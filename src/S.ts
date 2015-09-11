/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // "Globals" used to keep track of current system state
    var UpdatingNode : GraphComputation = null,
        Frame : RunFrame = null;
    
    var S = <S>function S<T>(fn : () => T) : Computation<T> {
        var options : ComputationBuilder = this instanceof ComputationBuilder ? this : new ComputationBuilder(),
            parent = UpdatingNode,
            framing = Frame.collecting,
            gate = options._gate || (parent && parent.gate) || null,
            node = new GraphComputation(fn, gate),
            i : number, len : number,
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
            node.listening = false;
        }

        if (parent) {
            if (parent.pinning || options._pin) parent.finalizers.push(dispose);
            else parent.cleanups.push(dispose);
        } 
        
        if (!framing) Frame.collecting = true;

        try {
            if (!options._init || options._init(node)) {
                node.value = fn();
            }
        } finally {
            UpdatingNode = parent;
            if (!framing) Frame.collecting = false;
        }

        if (!framing && Frame.len !== 0)
            Frame.run(null, null);

        computation = <Computation<T>>function computation() {
            if (!node) return;
            if (UpdatingNode) {
                if (!node.emitter) node.emitter = new Emitter(node);
                addEdge(node.emitter, node.gate);
            }
            if (node.receiver && node.receiver.marks !== 0) node.receiver.backtrack();
            if (!node) return;
            return node.value;
        }

        computation.dispose = dispose;
        computation.toJSON = signalToJSON;

        return computation;

        function dispose() {
            if (!node) return;
            var _node = node,
                receiver = _node.receiver, 
                i : number, len : number;
                
            node = null;
            
            if (UpdatingNode === _node) UpdatingNode = null;

            if (receiver) {
                i = -1, len = receiver.inbound.length;
                while (++i < len) {
                    receiver.inbound[i].deactivate();
                }
            }

            _node.cleanup();

            i = -1, len = _node.finalizers.length;
            while (++i < len) {
                _node.finalizers[i]();
            }

            _node.value = null;
            _node.fn = null;
            _node.finalizers = null;
            _node.receiver = null;
            _node.emitter = null;
        }
    }

    S.data = function data<T>(value : T) : DataSignal<T> {
        var node = new Data(value),
            data : DataSignal<T>;
        
        node.value = value;

        data = <DataSignal<T>>function data(value : T) {
            if (arguments.length > 0) {
                if (Frame.collecting) Frame.add(node, value);
                else Frame.run(node, value);
            } else {
                if (UpdatingNode) {
                    if (!node.emitter) node.emitter = new Emitter(null);
                    addEdge(node.emitter, null);
                }
            }
            return node.value;
        }
        
        data.toJSON = signalToJSON;

        return data;
    };

    /// Options
    class ComputationBuilder {
        _sources : (() => any)[] = null;
        _pin     = false;
        _init    : Gate = null;
        _gate    : Gate = null;

        pin() { 
            this._pin  = true; 
            return this; 
        }
        
        gate(gate : Gate) { 
            this._gate = gate; 
            return this; 
        }
        
        S(fn : () => any) { return S(fn); } // temp value, just to get the right signature.  overwritten by actual S.
    }
    
    ComputationBuilder.prototype.S = S;

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
            nodes : GraphComputation[] = [],
            nodeIndex : GraphComputation[] = [],
            collector : Collector;

        collector = <Collector>function collector(token : GateToken) : boolean {
            var node = <GraphComputation>token;
            if (!running && !nodeIndex[node.receiver.id]) {
                nodes.push(node);
                nodeIndex[node.receiver.id] = node;
            }
            return running;
        }

        collector.go = go;

        return collector;
        
        function go() {
            var i : number, node : GraphComputation, oldNode : GraphComputation;

            running = true;

            i = -1;
            while (++i < nodes.length) {
                node = nodes[i];
                if (node.emitter) node.emitter.mark();
            }

            oldNode = UpdatingNode, UpdatingNode = null;

            i = -1;
            try {
                while (++i < nodes.length) {
                    nodes[i].update();
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
            nodeIndex = [];
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
        if (UpdatingNode && UpdatingNode.listening) {
            UpdatingNode.listening = false;

            try {
                return fn();
            } finally {
                UpdatingNode.listening = true;
            }
        } else {
            return fn();
        }
    };

    S.cleanup = function cleanup(fn : () => void) : void {
        if (UpdatingNode) {
            UpdatingNode.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };

    S.freeze = function freeze<T>(fn : () => T) : T {
        var result : T;
        
        if (Frame.collecting) {
            fn();
        } else {
            Frame.collecting = true;

            try {
                result = fn();
            } finally {
                Frame.collecting = false;
            }
            
            Frame.run(null, null);
            
            return result;
        }
    };

    // how to type this?
    S.pin = <any>function pin(fn) {
        if (arguments.length === 0) {
            return new ComputationBuilder().pin();
        } else if (!UpdatingNode || UpdatingNode.pinning) {
            return fn();
        } else {
            UpdatingNode.pinning = true;

            try {
                return fn();
            } finally {
                UpdatingNode.pinning = false;
            }
        }
    };
    
    // Run change propagation
    class RunFrame {
        len = 0;
        collecting = false;
        nodes : Data[] = [];
        nodes2 : Data[] = [];
        
        add(node : Data, value : any) {
            if (node.pending) {
                if (value !== node.pendingValue) {
                    throw new Error("conflicting mutations: " + value + " !== " + node.pendingValue);
                }
            } else {
                node.pending = true;
                node.pendingValue = value;
                this.nodes[this.len] = node;
                this.len++;
            }
        }
        
        run(node : Data, value : any) {
            var nodes : Data[], count = 0, success = false, i : number, len : number;
            
            if (node) {
                node.value = value;
                
                if (!node.emitter) return;
                
                node.emitter.mark();
                
                this.collecting = true;
                
                try {
                    node.emitter.propagate();
                    success = true;
                } finally {
                    if (!success) {
                        reset(node);
                    }
                    this.collecting = false;
                    UpdatingNode = null;
                }
            }
            
            // for each frame ...
            while ((nodes = this.nodes, len = this.len) !== 0) {
                // ... set nodes' values, clear their entry in the values array, and mark them
                i = -1;
                while (++i < len) {
                    node = nodes[i];
                    node.value = node.pendingValue;
                    node.pending = false;
                    if (node.emitter) node.emitter.mark();
                }
                
                // reset frame
                this.nodes = this.nodes2;
                this.nodes2 = nodes;
                this.len = 0;
                
                // run all updates in frame
                this.collecting = true;
                i = -1;
                try {
                    while (++i < len) {
                        node = nodes[i];
                        if (node.emitter) node.emitter.propagate();
                        nodes[i] = null;
                    }
                } finally {
                    // in case we had an error, make sure all remaining marked nodes are reset
                    i--;
                    while (++i < len) {
                        reset(nodes[i]);
                        nodes[i] = null;
                    }
                    this.collecting = false;
                    UpdatingNode = null;
                }
                
                if (++count > 1e5) {
                    i = -1;
                    while (++i < this.len) {
                        this.nodes[i] = null;
                    }
                    this.len = 0;
                    throw new Error("Runaway frames detected");
                }
            }
        }
    }
    
    Frame = new RunFrame();
    
    /// Graph classes and operations
    class Data {
        value : any = undefined;
        pending : boolean = false;
        pendingValue : any = undefined;
        
        emitter : Emitter = null;
        
        constructor(value : any) {
            this.value = value;
        }
    }
    
    class GraphComputation {
        fn : () => any;
        value : any = undefined;
        gen = 1;
        gate : Gate;
        
        emitter : Emitter = null;
        receiver : Receiver = null;
        
        listening = true;
        pinning = false;
        cleanups : (() => void)[] = [];
        finalizers : (() => void)[] = [];
        
        constructor(fn : () => any, gate : Gate)  {
            this.fn = fn;
            this.gate = gate;
        }
        
        /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
        update() {
            var i : number, len : number, edge : Edge, to : Receiver;
    
            this.cleanup();
            
            UpdatingNode = this;
    
            this.gen++;
    
            if (this.fn) this.value = this.fn();
    
            if (this.receiver && this.listening) {
                i = -1, len = this.receiver.inbound.length;
                while (++i < len) {
                    edge = this.receiver.inbound[i];
                    if (edge.active && edge.gen < this.gen) {
                        edge.deactivate();
                    }
                }
                
                if (len > 10 && len / this.receiver.inboundActive > 4)
                    this.receiver.compact();
            }
    
            if (this.emitter) this.emitter.propagate();
        }

        cleanup() {
            var i = -1, fns = this.cleanups, len = fns.length;
            this.cleanups = [];
            while (++i < len) {
                fns[i]();
            }
        }
    }
    
    class Emitter {
        static count = 0;
        
        id = Emitter.count++;
        node : GraphComputation;
        emitting = false;
        outbound : Edge[] = [];
        outboundIndex : Edge[] = [];
        outboundActive = 0;
        outboundCompaction = 0;
        
        constructor(node : GraphComputation) {
            this.node = node;
        }
        
        /// mark the node and all downstream nodes as within the range to be updated
        mark() {
            this.emitting = true;
    
            var outbound = this.outbound, i = -1, len = outbound.length, edge : Edge, to : Receiver;
            while (++i < len) {
                edge = outbound[i];
                if (edge && (!edge.boundary || edge.to.node.gate(edge.to.node))) {
                    to = edge.to;
    
                    if (to.node.emitter && to.node.emitter.emitting)
                        throw new Error("circular dependency"); // TODO: more helpful reporting
    
                    edge.marked = true;
                    to.marks++;
    
                    // if this is the first time node's been marked, then propagate
                    if (to.marks === 1 && to.node.emitter) {
                        to.node.emitter.mark();
                    }
                }
            }
    
            this.emitting = false;
        }
        
        propagate() {
            var i = -1, len = this.outbound.length, edge : Edge, to : Receiver;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.marked) { // due to gating and backtracking, not all outbound edges may be marked
                    to = edge.to;
    
                    edge.marked = false;
                    to.marks--;
    
                    if (to.marks === 0) {
                        to.node.update();
                    }
                }
            }
                        
            if (len > 10 && len / this.outboundActive > 4) 
                this.compact();
        }
    
        compact() {
            var i = -1, len = this.outbound.length, compact : Edge[] = [], compaction = ++this.outboundCompaction, edge : Edge;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge) {
                    edge.outboundOffset = compact.length;
                    edge.outboundCompaction = compaction;
                    compact.push(edge);
                }
            }
            this.outbound = compact;
        }
    }
    
    class Receiver {
        static count = 0;
        
        id = Emitter.count++;
        node : GraphComputation;
        marks = 0;
        inbound : Edge[] = [];
        inboundIndex : Edge[] = [];
        inboundActive = 0;
        
        constructor(node : GraphComputation) {
            this.node = node;
        }
    
        /// update the given node by backtracking its dependencies to clean state and updating from there
        backtrack() {
            var i = -1, len = this.inbound.length, oldNode = UpdatingNode, edge : Edge;
            while (++i < len) {
                edge = this.inbound[i];
                if (edge && edge.marked) {
                    if (edge.from.node && edge.from.node.receiver.marks) {
                        // keep working backwards through the marked nodes ...
                        edge.from.node.receiver.backtrack();
                    } else {
                        // ... until we find clean state, from which to start updating
                        edge.from.propagate();
                        UpdatingNode = oldNode;
                    }
                }
            }
        }
        
        compact() {
            var i = -1, len = this.inbound.length, compact : Edge[] = [], compactIndex : Edge[] = [], edge : Edge;
            while (++i < len) {
                edge = this.inbound[i];
                if (edge.active) {
                    compact.push(edge);
                    compactIndex[edge.from.id] = edge;
                }
            }
            this.inbound = compact;
            this.inboundIndex = compactIndex;
        }
    }

    class Edge {
        from : Emitter;
        to : Receiver;
        boundary : boolean;
        
        active = true;
        marked = false;
        gen : number;
        
        outboundOffset : number;
        outboundCompaction : number;
        
        constructor(from : Emitter, to : Receiver, boundary : boolean) {
            this.from = from;
            this.to = to;
            this.boundary = boundary;
    
            this.gen = to.node.gen;
    
            this.outboundOffset = from.outbound.length;
            this.outboundCompaction = from.outboundCompaction;
    
            from.outbound.push(this);
            to.inbound.push(this);
            to.inboundIndex[from.id] = this;
            from.outboundActive++;
            to.inboundActive++;
        }
        
        activate(from : Emitter) {
            if (!this.active) {
                this.active = true;
                if (this.outboundCompaction === from.outboundCompaction) {
                    from.outbound[this.outboundOffset] = this;
                } else {
                    this.outboundCompaction = from.outboundCompaction;
                    this.outboundOffset = from.outbound.length;
                    from.outbound.push(this);
                }
                this.to.inboundActive++;
                from.outboundActive++;
                this.from = from;
            }
            this.gen = this.to.node.gen;
        }
        
        deactivate() {
            if (!this.active) return;
            var from = this.from, to = this.to;
            this.active = false;
            from.outbound[this.outboundOffset] = null;
            from.outboundActive--;
            to.inboundActive--;
            this.from = null;
        }
    }

    function addEdge(from : Emitter, gate : Gate) {
        var to = UpdatingNode,
            edge : Edge = null;

        if (to && to.listening) {
            if (!to.receiver) to.receiver = new Receiver(to);
            else edge = to.receiver.inboundIndex[from.id];
            if (edge) edge.activate(from);
            else new Edge(from, to.receiver, to.gate && to.gate !== gate);
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
