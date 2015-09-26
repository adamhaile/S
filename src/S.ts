/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // "Globals" used to keep track of current system state
    var Time = 1,
        UpdatingComputation : ComputationNode = null,
        Resolver : FrameResolver = null;
    
    var S = <S>function S<T>(fn : () => T) : Computation<T> {
        var options : ComputationBuilder = this instanceof ComputationBuilder ? this : null,
            parent = UpdatingComputation,
            frozen = Resolver.frozen,
            gate = (options && options._gate) || (parent && parent.gate) || null,
            node = new ComputationNode(fn, gate),
            i : number, len : number,
            computation : Computation<T>;

        UpdatingComputation = node;

        if (options && options._sources) {
            initSources(options._sources, parent);
            node.listening = false;
        }

        if (parent) {
            if (parent.pinning || (options && options._pin)) parent.finalizers.push(dispose);
            else parent.cleanups.push(dispose);
        } 
        
        UpdatingComputation = node;
        
        if (frozen) {
            node.value = fn();
            
            UpdatingComputation = parent;
        } else {
            Time++;
            Resolver.frozen = true;
            
            node.value = initComputation(fn, parent);
        }

        computation = <Computation<T>>function computation() {
            if (!node) return;
            if (UpdatingComputation && UpdatingComputation.listening) {
                if (!node.emitter) node.emitter = new Emitter(node);
                node.emitter.addEdge(UpdatingComputation);
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
                cleanups = _node.cleanups,
                i : number, len : number;
                
            node = null;
            
            if (UpdatingComputation === _node) UpdatingComputation = null;

            if (receiver) {
                i = -1, len = receiver.edges.length;
                while (++i < len) {
                    receiver.edges[i].deactivate();
                }
            }

            _node.cleanups = [];
            i = -1, len = cleanups.length;
            while (++i < len) {
                cleanups[i]();
            }

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

    function initSources(sources : Signal<any>[], parent : ComputationNode) {      
        var i = -1, len = sources.length;
        try {
            while (++i < len)
                sources[i]();
        } finally {
            UpdatingComputation = parent;
        }
    }

    function initComputation<T>(fn : () => T, parent : ComputationNode) {
        var result;
        
        try {
            result = fn();
    
            if (Resolver.len !== 0) Resolver.run(null);
        } finally {
            UpdatingComputation = parent;
            Resolver.frozen = false;
            Resolver.len = 0;
        }
        
        return result;
    }

    S.data = function data<T>(value : T) : DataSignal<T> {
        var node = new DataNode(value),
            data : DataSignal<T>;
        
        node.value = value;

        data = <DataSignal<T>>function data(value : T) {
            if (arguments.length > 0) {
                Resolver.change(node, value);
            } else {
                if (UpdatingComputation && UpdatingComputation.listening) {
                    if (!node.emitter) node.emitter = new Emitter(null);
                    node.emitter.addEdge(UpdatingComputation);
                }
            }
            return node.value;
        }
        
        data.toJSON = signalToJSON;

        return data;
    };

    function signalToJSON() {
        return this();
    }

    /// Options
    class ComputationBuilder {
        _sources : (() => any)[] = null;
        _pin     = false;
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

    S.gate = function gate(g : Gate) { 
        return new ComputationBuilder().gate(g); 
    };

    S.collector = function collector() : Collector {
        var node = new DataNode(null),
            emitter = node.emitter = new Emitter(null),
            running = false,
            collector : Collector;

        collector = <Collector>function collector(token : GateToken) : boolean {
            var node = <ComputationNode>token;
            if (!running) {
                emitter.addEdge(node);
            }
            return running;
        }

        collector.go = go;

        return collector;
        
        function go() {
            running = true;
            
            Resolver.enter(node);
            
            running = false;
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
        if (UpdatingComputation && UpdatingComputation.listening) {
            UpdatingComputation.listening = false;

            try {
                return fn();
            } finally {
                UpdatingComputation.listening = true;
            }
        } else {
            return fn();
        }
    };

    S.cleanup = function cleanup(fn : () => void) : void {
        if (UpdatingComputation) {
            UpdatingComputation.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };

    S.freeze = function freeze<T>(fn : () => T) : T {
        var result : T;
        
        if (Resolver.frozen) {
            result = fn();
        } else {
            Time++;
            Resolver.frozen = true;

            try {
                result = fn();
            } finally {
                Resolver.frozen = false;
            }
            
            if (Resolver.len > 0) Resolver.enter(null);
        }
            
        return result;
    };

    // how to type this?
    S.pin = <any>function pin(fn) {
        if (arguments.length === 0) {
            return new ComputationBuilder().pin();
        } else if (!UpdatingComputation || UpdatingComputation.pinning) {
            return fn();
        } else {
            UpdatingComputation.pinning = true;

            try {
                return fn();
            } finally {
                UpdatingComputation.pinning = false;
            }
        }
    };
    
    // Run change propagation
    class FrameResolver {
        len = 0;
        frozen = false;
        
        private changes : DataNode[] = [];
        private changes2 : DataNode[] = [];
        
        change(data : DataNode, value : any) {
            if (this.frozen) {
                if (data.age === Time) {
                    if (value !== data.pending) {
                        throw new Error("conflicting changes: " + value + " !== " + data.pending);
                    }
                } else {
                    data.age = Time; 
                    data.pending = value;
                    
                    this.changes[this.len] = data;
                    this.len++;
                }
            } else {
                data.value = value;
                
                if (data.emitter) this.enter(data);
            }
        }
        
        enter(change : DataNode) {
            try {
                this.run(change);
            } finally {
                this.frozen = false;
                this.len = 0;
                UpdatingComputation = null;
            }
        }
        
        run(change : DataNode) {
            var changes : DataNode[], 
                count = 0, 
                i : number, 
                len : number;
                
            this.frozen = true;
                
            if (change) {
                Time++;
                
                change.emitter.mark();
                
                change.emitter.propagate();
            }
            
            // for each frame ...
            while (this.len !== 0) {
                // prepare next frame
                Time++;
                changes = this.changes;
                this.changes = this.changes2;
                this.changes2 = changes;
                len = this.len;
                this.len = 0;
                
                // ... set nodes' values, clear pending data, and mark them
                i = -1;
                while (++i < len) {
                    change = changes[i];
                    change.value = change.pending;
                    change.pending = undefined;
                    if (change.emitter) change.emitter.mark();
                }
                
                // run all updates in frame
                i = -1;
                while (++i < len) {
                    change = changes[i];
                    if (change.emitter) change.emitter.propagate();
                    changes[i] = null;
                }
                
                if (count++ > 1e5) {
                    throw new Error("Runaway frames detected");
                }
            }
        }
    }
    
    /// Graph classes and operations
    class DataNode {
        age = 0; // Data nodes start at a time prior to the present, or else they can't be set in the current frame
        
        value : any = undefined;
        pending : any = undefined;
        
        emitter : Emitter = null;
        
        constructor(value : any) {
            this.value = value;
        }
    }
    
    class ComputationNode {
        fn : () => any;
        value : any = undefined;
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
            var i : number, 
                len : number, 
                edge : Edge, 
                to : Receiver, 
                cleanups = this.cleanups;
            
            this.cleanups = [];
            i = -1, len = cleanups.length;
            while (++i < len) {
                cleanups[i]();
            }
            
            UpdatingComputation = this;
    
            if (this.fn) this.value = this.fn();
    
            if (this.emitter) this.emitter.propagate();
            
            if (this.receiver && this.listening) {
                i = -1, len = this.receiver.edges.length;
                while (++i < len) {
                    edge = this.receiver.edges[i];
                    if (edge.active && edge.age < Time) {
                        edge.deactivate();
                    }
                }
                
                if (len > 10 && len / this.receiver.active > 4)
                    this.receiver.compact();
            }
        }
    }
    
    class Emitter {
        static count = 0;
        
        id = Emitter.count++;
        node : ComputationNode;
        emitting = false;
        edges : Edge[] = [];
        index : Edge[] = [];
        active = 0;
        edgesAge = 0;
        
        constructor(node : ComputationNode) {
            this.node = node;
        }
        
        addEdge(to : ComputationNode) {
            var edge : Edge = null;
            
            if (!to.receiver) to.receiver = new Receiver(to);
            else edge = to.receiver.index[this.id];
            
            if (edge) edge.activate(this);
            else new Edge(this, to.receiver, to.gate && (this.node === null || to.gate !== this.node.gate));
        }
        
        /// mark the node and all downstream nodes as within the range to be updated
        mark() {
            var edges = this.edges, 
                i = -1, 
                len = edges.length, 
                edge : Edge, 
                to : Receiver,
                emitter: Emitter;
            
            this.emitting = true;
                
            while (++i < len) {
                edge = edges[i];
                if (edge && (!edge.boundary || edge.to.node.gate(edge.to.node))) {
                    to = edge.to;
                    emitter = to.node.emitter;
    
                    if (to.age < Time) {
                        to.marks = 0;
                        if (emitter) {
                            emitter.emitting = false;
                        }
                    }
    
                    if (emitter && emitter.emitting)
                        throw new Error("circular dependency"); // TODO: more helpful reporting
    
                    edge.marked = true;
                    to.marks++;
                    to.age = Time;
    
                    // if this is the first time node's been marked, then propagate
                    if (to.marks === 1 && emitter) {
                        emitter.mark();
                    }
                }
            }
    
            this.emitting = false;
        }
        
        propagate() {
            var i = -1, 
                len = this.edges.length, 
                edge : Edge, 
                to : Receiver;
                
            while (++i < len) {
                edge = this.edges[i];
                if (edge && edge.marked) { // due to gating and backtracking, not all outbound edges may be marked
                    to = edge.to;
    
                    edge.marked = false;
                    to.marks--;
    
                    if (to.marks === 0) {
                        to.node.update();
                    }
                }
            }
                        
            if (len > 10 && len / this.active > 4) 
                this.compact();
        }
    
        compact() {
            var i = -1, 
                len = this.edges.length, 
                edges : Edge[] = [], 
                compaction = ++this.edgesAge, 
                edge : Edge;
                
            while (++i < len) {
                edge = this.edges[i];
                if (edge) {
                    edge.slot = edges.length;
                    edge.slotAge = compaction;
                    edges.push(edge);
                }
            }
            
            this.edges = edges;
        }
    }
    
    class Receiver {
        static count = 0;
        
        id = Emitter.count++;
        node : ComputationNode;
        marks = 0;
        age = Time;
        edges : Edge[] = [];
        index : Edge[] = [];
        active = 0;
        
        constructor(node : ComputationNode) {
            this.node = node;
        }
    
        /// update the given node by backtracking its dependencies to clean state and updating from there
        backtrack() {
            var i = -1, 
                len = this.edges.length, 
                oldNode = UpdatingComputation, 
                edge : Edge;
                
            while (++i < len) {
                edge = this.edges[i];
                if (edge && edge.marked) {
                    if (edge.from.node && edge.from.node.receiver.marks) {
                        // keep working backwards through the marked nodes ...
                        edge.from.node.receiver.backtrack();
                    } else {
                        // ... until we find clean state, from which to start updating
                        edge.from.propagate();
                        UpdatingComputation = oldNode;
                    }
                }
            }
        }
        
        compact() {
            var i = -1, 
                len = this.edges.length, 
                edges : Edge[] = [], 
                index : Edge[] = [], 
                edge : Edge;
                
            while (++i < len) {
                edge = this.edges[i];
                if (edge.active) {
                    edges.push(edge);
                    index[edge.from.id] = edge;
                }
            }
            
            this.edges = edges;
            this.index = index;
        }
    }

    class Edge {
        age = Time;
        
        from : Emitter;
        to : Receiver;
        boundary : boolean;
        
        active = true;
        marked = false;
        
        slot : number;
        slotAge : number;
        
        constructor(from : Emitter, to : Receiver, boundary : boolean) {
            this.from = from;
            this.to = to;
            this.boundary = boundary;
    
            this.slot = from.edges.length;
            this.slotAge = from.edgesAge;
    
            from.edges.push(this);
            to.edges.push(this);
            to.index[from.id] = this;
            from.active++;
            to.active++;
        }
        
        activate(from : Emitter) {
            if (!this.active) {
                this.active = true;
                if (this.slotAge === from.edgesAge) {
                    from.edges[this.slot] = this;
                } else {
                    this.slotAge = from.edgesAge;
                    this.slot = from.edges.length;
                    from.edges.push(this);
                }
                this.to.active++;
                from.active++;
                this.from = from;
            }
            this.age = Time;
        }
        
        deactivate() {
            if (!this.active) return;
            var from = this.from, to = this.to;
            this.active = false;
            from.edges[this.slot] = null;
            from.active--;
            to.active--;
            this.from = null;
        }
    }

    Resolver = new FrameResolver();
    
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
