/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // "Globals" used to keep track of current system state
    var Time        = 1,
        Frozen      = false,
        Changes     = [] as DataNode[],
        ChangeCount = 0,
        Updating    = null as ComputationNode;
    
    var S = <S>function S<T>(fn : (dispose? : () => void) => T) : Signal<T> {
        var options     = (this instanceof ComputationBuilder ? this : null) as ComputationBuilder,
            parent      = Updating,
            frozen      = Frozen,
            gate        = (options && options._gate) || (parent && parent.gate) || null,
            node        = new ComputationNode(fn, gate, dispose);

        Updating = node;

        if (options && options._sources) {
            initSources(options._sources, parent);
            node.listening = false;
        }

        if (parent) {
            if (parent.pinning || (options && options._pin)) parent.finalizers.push(dispose);
            else parent.cleanups.push(dispose);
        } 
        
        Updating = node;
        
        if (frozen) {
            node.value = fn(dispose);
            
            Updating = parent;
        } else {
            node.value = initComputation(fn, parent, dispose);
        }

        return function computation() {
            if (!node) return;
            if (Updating && Updating.listening) {
                if (!node.emitter) node.emitter = new Emitter(node);
                addEdge(node.emitter, Updating);
            }
            if (node.receiver && node.receiver.marks !== 0) backtrack(node.receiver);
            if (!node) return;
            return node.value;
        }
        
        function dispose() {
            if (!node) return;
            
            var receiver   = node.receiver, 
                emitter    = node.emitter,
                cleanups   = node.cleanups,
                finalizers = node.finalizers,
                i          : number, 
                len        : number, 
                edge       : Edge;
                
            if (Updating === node) Updating = null;
            
            node = null;
    
            if (receiver) {
                i = -1, len = receiver.edges.length;
                while (++i < len) {
                    deactivate(receiver.edges[i]);
                }
            }
            
            if (emitter) {
                i = -1, len = emitter.edges.length;
                while (++i < len) {
                    edge = emitter.edges[i];
                    if (edge) deactivate(edge);
                }
            }
    
            i = -1, len = cleanups.length;
            while (++i < len) {
                cleanups[i]();
            }
    
            i = -1, len = finalizers.length;
            while (++i < len) {
                finalizers[i]();
            }
        }
    }

    function initSources(sources : Signal<any>[], parent : ComputationNode) {      
        var i   = -1, 
            len = sources.length;
        try {
            while (++i < len)
                sources[i]();
        } finally {
            Updating = parent;
        }
    }

    function initComputation<T>(fn : (dispose? : () => void) => T, parent : ComputationNode, dispose : () => void) {
        var result;
        
        Time++;
        Frozen = true;
            
        try {
            result = fn(dispose);
    
            if (ChangeCount !== 0) run(null);
        } finally {
            Updating    = parent;
            Frozen      = false;
            ChangeCount = 0;
        }
        
        return result;
    }
        
    S.data = function data<T>(value : T) : DataSignal<T> {
        var node = new DataNode(value);

        return function data(value? : T) {
            if (arguments.length > 0) {
                if (Frozen) {
                    if (node.age === Time) { // value has already been set once, check for conflicts
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    } else { // add to list of changes
                        node.age = Time; 
                        node.pending = value;
                        Changes[ChangeCount++] = node;
                    }
                } else { // not frozen, respond to change now
                    node.value = value;
                    if (node.emitter) externalChange(node);
                }
                return value;
            } else {
                if (Updating && Updating.listening) {
                    if (!node.emitter) node.emitter = new Emitter(null);
                    addEdge(node.emitter, Updating);
                }
                return node.value;
            }
        }
    };

    /// Options
    class ComputationBuilder {
        _sources = null as Signal<any>[];
        _pin     = false;
        _gate    = <Gate>null;

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
        var node      = new DataNode(null),
            emitter   = new Emitter(null),
            running   = false,
            collector : Collector;

        node.emitter = emitter;

        collector = <Collector>function collector(token : GateToken) : boolean {
            var node = <ComputationNode>token;
            if (!running) {
                addEdge(emitter, node);
            }
            return running;
        }

        collector.go = go;

        return collector;
        
        function go() {
            running = true;
            
            externalChange(node);
            
            running = false;
        }
    };

    S.throttle = function throttle(t) {
        var col  = S.collector(),
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
        var col  = S.collector(),
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
        if (Updating && Updating.listening) {
            Updating.listening = false;

            try {
                return fn();
            } finally {
                Updating.listening = true;
            }
        } else {
            return fn();
        }
    };

    S.cleanup = function cleanup(fn : () => void) : void {
        if (Updating) {
            Updating.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };

    S.freeze = function freeze<T>(fn : () => T) : T {
        var result : T;
        
        if (Frozen) {
            result = fn();
        } else {
            Time++;
            Frozen = true;

            try {
                result = fn();
            } finally {
                Frozen = false;
            }
            
            if (ChangeCount > 0) externalChange(null);
        }
            
        return result;
    };

    // how to type this?
    S.pin = <any>function pin(fn) {
        if (arguments.length === 0) {
            return new ComputationBuilder().pin();
        } else if (!Updating || Updating.pinning) {
            return fn();
        } else {
            Updating.pinning = true;

            try {
                return fn();
            } finally {
                Updating.pinning = false;
            }
        }
    };   
        
    function externalChange(change : DataNode) {
        try {
            run(change);
        } finally {
            Frozen      = false;
            ChangeCount = 0;
            Updating    = null;
        }
    }
        
    var _changes = [] as DataNode[];
        
    function run(change : DataNode) {
        var count   = 0, 
            changes : DataNode[], 
            i       : number, 
            len     : number;
            
        Frozen = true;
            
        if (change) {
            Time++;
            
            prepare(change.emitter);
            
            notify(change.emitter);
        }
        
        // for each frame ...
        while (ChangeCount !== 0) {
            // prepare next frame
            Time++;
            changes = Changes, Changes = _changes, _changes = changes;
            len = ChangeCount, ChangeCount = 0;
            
            // ... set nodes' values, clear pending data, and mark them
            i = -1;
            while (++i < len) {
                change = changes[i];
                change.value = change.pending;
                change.pending = undefined;
                if (change.emitter) prepare(change.emitter);
            }
            
            // run all updates in frame
            i = -1;
            while (++i < len) {
                change = changes[i];
                if (change.emitter) notify(change.emitter);
                changes[i] = null;
            }
            
            if (count++ > 1e5) {
                throw new Error("Runaway frames detected");
            }
        }
    }

    /// mark the node and all downstream nodes as within the range to be updated
    function prepare(emitter : Emitter) {
        var edges     = emitter.edges, 
            i         = -1, 
            len       = edges.length, 
            edge      : Edge, 
            to        : Receiver,
            toEmitter : Emitter;
        
        emitter.emitting = true;
            
        while (++i < len) {
            edge = edges[i];
            if (edge && (!edge.boundary || edge.to.node.gate(edge.to.node))) {
                to = edge.to;
                toEmitter = to.node.emitter;

                // if an earlier update threw an exception, marks may be dirty - clear it now
                if (to.age < Time) {
                    to.marks = 0;
                    if (toEmitter) {
                        toEmitter.emitting = false;
                    }
                }

                if (toEmitter && toEmitter.emitting)
                    throw new Error("circular dependency"); // TODO: more helpful reporting

                edge.marked = true;
                to.marks++;
                to.age = Time;

                // if this is the first time to's been marked, then propagate
                if (to.marks === 1 && toEmitter) {
                    prepare(toEmitter);
                }
            }
        }

        emitter.emitting = false;
    }
    
    function notify(emitter : Emitter) {
        var i    = -1, 
            len  = emitter.edges.length, 
            edge : Edge, 
            to   : Receiver;
            
        while (++i < len) {
            edge = emitter.edges[i];
            if (edge && edge.marked) { // due to gating and backtracking, not all outbound edges may be marked
                to = edge.to;

                edge.marked = false;
                to.marks--;

                if (to.marks === 0) {
                    update(to.node);
                }
            }
        }
                    
        if (len > 10 && len / emitter.active > 4) 
            emitter.compact();
    }
    
    /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
    function update(node : ComputationNode) {
        var emitter  = node.emitter,
            receiver = node.receiver,
            i        : number, 
            len      : number, 
            edge     : Edge, 
            to       : Receiver;
        
        i = -1, len = node.cleanups.length;
        while (++i < len) {
            node.cleanups[i]();
        }
        node.cleanups = [];
        
        Updating = node;

        node.value = node.fn(node.dispose);

        if (emitter) {
            // this is the content of notify(emitter), inserted to shorten call stack for ergonomics
            i = -1, len = emitter.edges.length;
            while (++i < len) {
                edge = emitter.edges[i];
                if (edge && edge.marked) { // due to gating and backtracking, not all outbound edges may be marked
                    to = edge.to;
    
                    edge.marked = false;
                    to.marks--;
    
                    if (to.marks === 0) {
                        update(to.node);
                    }
                }
            }
                        
            if (len > 10 && len / emitter.active > 4) 
                emitter.compact();
        }
        
        if ((receiver !== null) && node.listening) {
            i = -1, len = receiver.edges.length;
            while (++i < len) {
                edge = receiver.edges[i];
                if (edge.active && edge.age < Time) {
                    deactivate(edge);
                }
            }
            
            if (len > 10 && len / receiver.active > 4)
                receiver.compact();
        }
    }
        
    /// update the given node by backtracking its dependencies to clean state and updating from there
    function backtrack(receiver : Receiver) {
        var i       = -1, 
            len     = receiver.edges.length, 
            oldNode = Updating, 
            edge    : Edge;
            
        while (++i < len) {
            edge = receiver.edges[i];
            if (edge && edge.marked) {
                if (edge.from.node && edge.from.node.receiver.marks) {
                    // keep working backwards through the marked nodes ...
                    backtrack(edge.from.node.receiver);
                } else {
                    // ... until we find clean state, from which to start updating
                    notify(edge.from);
                    Updating = oldNode;
                }
            }
        }
    }
    
    /// Graph classes and operations
    class DataNode {
        age     = 0; // Data nodes start at a time prior to the present, or else they can't be set in the current frame
        
        value   : any;
        pending : any;
        
        emitter = null as Emitter;
        
        constructor(value : any) {
            this.value = value;
        }
    }
    
    class ComputationNode {
        fn         : (dispose? : () => void) => any;
        value      : any;
        gate       : Gate;
        dispose    : () => void;
        
        emitter    = null as Emitter;
        receiver   = null as Receiver;
        
        listening  = true;
        pinning    = false;
        
        cleanups   = [] as (() => void)[];
        finalizers = [] as (() => void)[];
        
        constructor(fn : () => any, gate : Gate, dispose : () => void)  {
            this.fn = fn;
            this.gate = gate;
            this.dispose = dispose;
        }
    }
    
    class Emitter {
        static count = 0;
        
        id       = Emitter.count++;
        
        emitting = false;
        edges    = [] as Edge[];
        index    = [] as Edge[];
        active   = 0;
        edgesAge = 0;
        
        node     : ComputationNode;
        
        constructor(node : ComputationNode) {
            this.node = node;
        }
    
        compact() {
            var i          = -1, 
                len        = this.edges.length, 
                edges      = <Edge[]>[], 
                compaction = ++this.edgesAge, 
                edge       : Edge;
                
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
    
    function addEdge(from : Emitter, to : ComputationNode) {
        var edge : Edge = null;
        
        if (!to.receiver) to.receiver = new Receiver(to);
        else edge = to.receiver.index[from.id];
        
        if (edge) activate(edge, from);
        else new Edge(from, to.receiver, to.gate && (from.node === null || to.gate !== from.node.gate));
    }
        
    class Receiver {
        static count = 0;
        
        id     = Emitter.count++;
        marks  = 0;
        age    = Time;
        edges  = [] as Edge[];
        index  = [] as Edge[];
        active = 0;
        node   : ComputationNode;
        
        constructor(node : ComputationNode) {
            this.node = node;
        }
        
        compact() {
            var i     = -1, 
                len   = this.edges.length, 
                edges = <Edge[]>[], 
                index = <Edge[]>[], 
                edge  : Edge;
                
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
        age      = Time;
        
        from     : Emitter;
        to       : Receiver;
        boundary : boolean;
        
        active   = true;
        marked   = false;
        
        slot     : number;
        slotAge  : number;
        
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
    }
        
    function activate(edge : Edge, from : Emitter) {
        if (!edge.active) {
            edge.active = true;
            if (edge.slotAge === from.edgesAge) {
                from.edges[edge.slot] = edge;
            } else {
                edge.slotAge = from.edgesAge;
                edge.slot = from.edges.length;
                from.edges.push(edge);
            }
            edge.to.active++;
            from.active++;
            edge.from = from;
        }
        edge.age = Time;
    }
    
    function deactivate(edge : Edge) {
        if (!edge.active) return;
        var from = edge.from, to = edge.to;
        edge.active = false;
        from.edges[edge.slot] = null;
        from.active--;
        to.active--;
        edge.from = null;
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
