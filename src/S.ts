/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    class _Frame {
        len = 0;
        values : any[] = [];
        nodes : Node<any>[] = [];
        nodes2 : Node<any>[] = [];
        
        add<T>(node : Node<T>, value : T) {
            this.values[this.len] = value;
            this.nodes[this.len] = node;
            this.len++;
        }
    }
    
    // "Globals" used to keep track of current system state
    var NodeCount = 0,
        UpdatingNode = <Node<any>>null,
        Framing = false,
        Frame = new _Frame();

    function runFrames() {
        var nodes : Node<any>[], i : number, len : number, node : Node<any>, count = 0;
        
        // for each frame ...
        while ((nodes = Frame.nodes, len = Frame.len) !== 0) {
            // ... set nodes' values, clear their entry in the values array, and mark them
            i = -1;
            while (++i < len) {
                node = nodes[i];
                node.value = Frame.values[i], Frame.values[i] = null;
                mark(node);
            }
            
            // reset frame
            Frame.nodes = Frame.nodes2;
            Frame.nodes2 = nodes;
            Frame.len = 0;
            
            // run all updates in frame
            Framing = true;
            i = -1;
            try {
                while (++i < len) {
                    node = nodes[i];
                    update(node);
                    nodes[i] = null;
                }
            } finally {
                // in case we had an error, make sure all remaining marked nodes are reset
                i--;
                while (++i < len) {
                    reset(nodes[i]);
                    nodes[i] = null;
                }
                Framing = false;
                UpdatingNode = null;
            }
            
            if (++count > 1e5) {
                i = -1;
                while (++i < Frame.len) {
                    Frame.nodes[i] = null;
                }
                Frame.len = 0;
                throw new Error("Runaway frames detected");
            }
        }
    }
    
    function runSingleChange(node : Node<any>, value : any) {
        var success = false;
        
        node.value = value;
        mark(node);
        
        Framing = true;
        
        try {
            update(node);
            success = true;
        } finally {
            if (!success) {
                reset(node);
            }
            Framing = false;
            UpdatingNode = null;
        }
        
        if (Frame.len !== 0) runFrames();
    }
    
    var S = <S>function S<T>(fn : () => T) : Computation<T> {
        var options = this instanceof ComputationBuilder ? this : new ComputationBuilder(),
            parent = UpdatingNode,
            framing = Framing,
            gate = options._gate || (parent && parent.gate) || null,
            payload = new Payload<T>(fn),
            node = new Node<T>(++NodeCount, payload, gate),
            disposed = false,
            i, len,
            computation : Computation<T>;

        UpdatingNode = node;

        if (options._sources) {
            i = -1, len = options._sources.length;
            while (++i < len) {
                try {
                    options._sources[i]();
                } catch (ex) {
                    UpdatingNode = parent;
                    throw ex;
                }
            }
            payload.listening = false;
        }

        if (parent) {
            if (parent.payload.pinning || options._pin) parent.payload.finalizers.push(dispose);
            else parent.payload.cleanups.push(dispose);
        } 
        
        if (!framing) Framing = true;

        try {
            if (!options._init || options._init(node)) {
                node.value = fn();
            }
        } finally {
            UpdatingNode = parent;
            if (!framing) Framing = false;
        }

        if (!framing && Frame.len !== 0)
            runFrames();

        computation = <Computation<T>>function computation() {
            if (disposed) return;
            addEdge(node);
            if (node.marks !== 0) backtrack(node);
            if (disposed) return;
            return node.value;
        }

        computation.dispose = dispose;
        computation.toJSON = signalToJSON;

        return computation;

        function dispose() {
            if (disposed) return;
            disposed = true;

            var i, len;

            i = -1, len = node.inbound.length;
            while (++i < len) {
                deactivate(node.inbound[i]);
            }

            cleanup(payload);

            i = -1, len = payload.finalizers.length;
            while (++i < len) {
                payload.finalizers[i]();
            }

            payload.fn = null;
            payload.finalizers = null;
            payload = null;

            node.value = null;
            node.payload = null;
            node.inbound = null;
            node.inboundIndex = null;
            node.outbound = null;
            node = null;
        }
    }

    S.data = function data<T>(value : T) : DataSignal<T> {
        var node = new Node<T>(++NodeCount, null, UpdatingNode ? UpdatingNode.gate : null),
            data : DataSignal<T>;
        
        node.value = value;

        data = <DataSignal<T>>function data(value : T) {
            if (arguments.length > 0) {
                if (Framing) Frame.add(node, value);
                else runSingleChange(node, value);
            } else {
                addEdge(node);
            }
            return node.value;
        }
        
        data.toJSON = signalToJSON;

        return data;
    };

    /// Options
    function ComputationBuilder() {
        this._sources = null;
        this._pin     = false;
        this._init    = null;
        this._gate    = null;
    }

    ComputationBuilder.prototype = {
        pin : function ()     { this._pin  = true; return this; },
        gate: function (gate) { this._gate = gate; return this; },
        S   : S
    };

    S.on = function on(...signals : Signal<any>[]) {
        var options = new ComputationBuilder();
        options._sources = signals;
        return options;
    };

    S.when = function when(...preds : Signal<any>[]) {
        var options = new ComputationBuilder(),
            len = preds.length;

        options._sources = preds;
        options._gate = options._init = function when() {
            var i = -1;
            while (++i < len) {
                if (preds[i]() === undefined) return false;
            }
            return true;
        };

        return options;
    };

    S.gate = function gate(g : Gate) { 
        return new ComputationBuilder().gate(g); 
    };

    function signalToJSON() {
        return this();
    }

    S.collector = function collector() : Collector {
        var running = false,
            nodes = [],
            nodeIndex = {},
            collector : Collector;

        collector = <Collector>function collector(token : GateToken) : boolean {
            var node = <Node<any>>token;
            if (!running && !nodeIndex[node.id]) {
                nodes.push(node);
                nodeIndex[node.id] = node;
            }
            return running;
        }

        collector.go = go;

        return collector;
        
        function go() {
            var i, oldNode;

            running = true;

            i = -1;
            while (++i < nodes.length) {
                mark(nodes[i]);
            }

            oldNode = UpdatingNode, UpdatingNode = null;

            i = -1;
            try {
                while (++i < nodes.length) {
                    update(nodes[i]);
                }
            } catch (ex) {
                i--;
                while (++i < nodes.length) {
                    reset(nodes[i]);
                }
                throw ex;
            } finally {
                UpdatingNode = oldNode;
                running = false;
            }

            nodes = [];
            nodeIndex = {};
        }
    };

    S.throttle = function throttle(t) {
        var col = S.collector(),
            last = 0;

        return function throttle(emitter) {
            var now = Date.now();

            col(emitter);

            if ((now - last) > t) {
                last = now;
                col.go();
            } else {
                setTimeout(function throttled() {
                    last = Date.now();
                    col.go();
                }, t - (now - last));
            }
            
            return false;
        };
    };
        
    S.debounce = function debounce(t) {
        var col = S.collector(),
            last = 0,
            tout = 0;

        return function debounce(node) {
            var now = Date.now();

            col(node);

            if (now > last) {
                last = now;
                if (tout) clearTimeout(tout);

                tout = setTimeout(col.go, t);
            }
            
            return false;
        };
    };
        
    S.peek = function peek<T>(fn : () => T) : T {
        if (UpdatingNode && UpdatingNode.payload && UpdatingNode.payload.listening) {
            UpdatingNode.payload.listening = false;

            try {
                return fn();
            } finally {
                if (UpdatingNode.payload) UpdatingNode.payload.listening = true;
            }
        } else {
            return fn();
        }
    };

    S.cleanup = function cleanup(fn : () => void) : void {
        if (UpdatingNode && UpdatingNode.payload) {
            UpdatingNode.payload.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };

    S.freeze = function freeze<T>(fn : () => T) : T {
        var result : T;
        
        if (Framing) {
            fn();
        } else {
            Framing = true;

            try {
                result = fn();
            } finally {
                Framing = false;
            }
            
            runFrames();
            
            return result;
        }
    };

    // how to type this?
    S.pin = <any>function pin(fn) {
        if (arguments.length === 0) {
            return new ComputationBuilder().pin();
        } else if (!UpdatingNode || !UpdatingNode.payload || UpdatingNode.payload.pinning) {
            return fn();
        } else {
            UpdatingNode.payload.pinning = true;

            try {
                return fn();
            } finally {
                UpdatingNode.payload.pinning = false;
            }
        }
    };
    
    /// Graph classes and operations
    class Node<T> {
        id : number;
        value : T = undefined;
        payload : Payload<T>;
        gate : Gate;
        marks = 0;
        updating : boolean = false;
        cur : number = 0;
        inbound : Edge[] = [];
        inboundIndex = [];
        inboundActive = 0;
        outbound : Edge[] = [];
        outboundIndex = [];
        outboundActive = 0;
        outboundCompaction = 0;
        
        constructor(id : number, payload : Payload<T>, gate : Gate)  {
            this.id = id;
            this.payload = payload;
            this.gate = gate;
        }
    }

    class Edge {
        from : Node<any>;
        to : Node<any>;
        boundary : boolean;
        
        active = true;
        marked = false;
        gen : number;
        
        outboundOffset : number;
        outboundCompaction : number;
        
        constructor(from : Node<any>, to : Node<any>, boundary) {
            this.from = from;
            this.to = to;
            this.boundary = boundary;
    
            this.gen = to.payload.gen;
    
            this.outboundOffset = from.outbound.length;
            this.outboundCompaction = from.outboundCompaction;
    
            from.outbound.push(this);
            to.inbound.push(this);
            to.inboundIndex[from.id] = this;
            from.outboundActive++;
            to.inboundActive++;
        }
    }

    class Payload<T> {
        fn : () => T;
        gen = 1;

        listening = true;
        pinning = false;

        cleanups = [];
        finalizers = [];
        
        constructor(fn : () => T) {
            this.fn = fn;
        }
    }

    function addEdge(from) {
        var to = UpdatingNode,
            edge = null;

        if (to && to.payload && to.payload.listening) {
            edge = to.inboundIndex[from.id];
            if (edge) activate(edge, from);
            else new Edge(from, to, to.gate && from.gate !== to.gate);
        }
    }

    /// mark the node and all downstream nodes as within the range to be updated
    function mark(node : Node<any>) {
        node.updating = true;

        var i = -1, len = node.outbound.length, edge : Edge, to : Node<any>;
        while (++i < len) {
            edge = node.outbound[i];
            if (edge && (!edge.boundary || edge.to.gate(edge.to))) {
                to = edge.to;

                if (to.updating)
                    throw new Error("circular dependency"); // TODO: more helpful reporting

                edge.marked = true;
                to.marks++;

                // if this is the first time node's been marked, then propagate
                if (to.marks === 1) {
                    mark(to);
                }
            }
        }

        node.updating = false;
    }

    /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
    function update(node : Node<any>) {
        var i : number, len : number, edge : Edge, to : Node<any>, payload : Payload<any>;

        node.updating = true;

        if (node.payload) {
            payload = node.payload;

            UpdatingNode = node;

            cleanup(payload);

            if (node.payload) {
                payload.gen++;

                node.value = payload.fn();

                if (payload.listening && node.inbound) {
                    i = -1, len = node.inbound.length;
                    while (++i < len) {
                        edge = node.inbound[i];
                        if (edge.active && edge.gen < payload.gen) {
                            deactivate(edge);
                        }
                    }
                    
                    if (len > 10 && len / node.inboundActive > 4) {
                        compactInbound(node);
                    }
                }
            }
        }

        node.cur = -1, len = node.outbound ? node.outbound.length : 0;
        while (++node.cur < len) {
            edge = node.outbound[node.cur];
            if (edge && edge.marked) { // due to gating and backtracking, not all outbound edges are marked
                to = edge.to;

                edge.marked = false;
                to.marks--;

                if (to.marks === 0) {
                    update(to);
                }
            }
        }
                    
        if (len > 10 && len / node.outboundActive > 4) {
            compactOutbound(node);
        }
        
        node.updating = false;
    }

    /// update the given node by backtracking its dependencies to clean state and updating from there
    function backtrack(node) {
        var i = -1, len = node.inbound.length, edge, oldNode;
        while (++i < len) {
            edge = node.inbound[i];
            if (edge && edge.marked) {
                if (edge.from.marks) {
                    // keep working backwards through the marked nodes ...
                    backtrack(edge.from);
                } else {
                    // ... until we find clean state, from which to start updating
                    oldNode = UpdatingNode;
                    update(edge.from); // does this double-run edge.from?
                    UpdatingNode = oldNode;
                }
            }
        }
    }

    /// reset the given node and all downstream nodes to initial state: unmarked, not updating
    function reset(node) {
        node.marks = 0;
        node.updating = false;
        node.cur = 0;

        var i = -1, len = node.outbound ? node.outbound.length : 0, edge;
        while (++i < len) {
            edge = node.outbound[i];
            if (edge && (edge.marked || edge.to.updating)) {
                edge.marked = false;
                reset(edge.to);
            }
        }
    }

    function cleanup(payload) {
        var i = -1, fns = payload.cleanups, len = fns.length;
        payload.cleanups = [];
        while (++i < len) {
            fns[i]();
        }
    }

    function activate(edge, from) {
        if (!edge.active) {
            edge.active = true;
            if (edge.outboundCompaction === from.outboundCompaction) {
                from.outbound[edge.outboundOffset] = edge;
            } else {
                edge.outboundCompaction = from.outboundCompaction;
                edge.outboundOffset = from.outbound.length;
                from.outbound.push(edge);
            }
            edge.to.inboundActive++;
            from.outboundActive++;
            edge.from = from;
        }
        edge.gen = edge.to.payload.gen;
    }

    function deactivate(edge) {
        if (!edge.active) return;
        var from = edge.from, to = edge.to;
        edge.active = false;
        if (from.outbound) from.outbound[edge.outboundOffset] = null;
        from.outboundActive--;
        to.inboundActive--;
        edge.from = null;
    }
    
    function compactInbound(node) {
        var i = -1, len = node.inbound.length, compact = [], compactIndex = [], edge;
        while (++i < len) {
            edge = node.inbound[i];
            if (edge.active) {
                compact.push(edge);
                compactIndex[edge.from.id] = edge;
            }
        }
        node.inbound = compact;
        node.inboundIndex = compactIndex;
    }
    
    function compactOutbound(node) {
        var i = -1, len = node.outbound.length, compact = [], compaction = ++node.outboundCompaction, edge;
        while (++i < len) {
            edge = node.outbound[i];
            if (edge) {
                edge.outboundOffset = compact.length;
                edge.outboundCompaction = compaction;
                compact.push(edge);
            }
        }
        node.outbound = compact;
    }

    // UMD exporter
    /* globals define */
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = S; // CommonJS
    } else if (typeof define === 'function') {
        define([], function () { return S; }); // AMD
    } else {
        (eval || function () {})("this").S = S; // fallback to global object
    }

})();
