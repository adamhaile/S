/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // "Globals" used to keep track of current system state
    var Time         = 1,
        Frozen       = false,
        Changes      = [] as DataNode<any>[],
        ChangeCount  = 0,
        Updating     = null as ComputationNode<any>,
        Jailbreaking = false,
        Jailbroken   = null as ComputationNode<any>;
    
    var S = <S>function S<T>(fn : (self? : () => T) => T) : () => T {
        var options     = (this instanceof ComputationBuilder ? this : null) as ComputationBuilder,
            parent      = Updating,
            frozen      = Frozen,
            gate        = (options && options._gate) || (parent && parent.gate) || null,
            node        = new ComputationNode(fn, gate, computation);

        Updating = node;

        if (options && options._watch) {
            initSources(options._watch, parent);
            node.listening = false;
        }

        if (options && options._pin !== undefined) {
            if (options._pin !== null) options._pin.pins.push(node);
        } else if (parent) {
            parent.children.push(node);
        }
        
        Updating = node;
        
        if (frozen) {
            node.value = fn(computation);
            Updating = parent;
        } else {
            node.value = initComputation(fn, parent, computation);
        }

        return computation;
        
        function computation() {
            if (Jailbreaking) { Jailbroken = node; return; }
            if (!node.fn) return;
            if (Updating && Updating.listening) {
                if (!node.emitter) node.emitter = new Emitter(node);
                addEdge(node.emitter, Updating);
            }
            if (node.receiver && node.receiver.marks !== 0) backtrack(node.receiver);
            if (!node.fn) return;
            return node.value;
        }
    }

    function initSources(sources : (() => void)[], parent : ComputationNode<any>) {      
        var i   = -1, 
            len = sources.length;
        try {
            while (++i < len)
                sources[i]();
        } finally {
            Updating = parent;
        }
    }

    function initComputation<T>(fn : (self? : () => T) => T, parent : ComputationNode<any>, self : () => T) {
        var result;
        
        Time++;
        Frozen = true;
            
        try {
            result = fn(self);
    
            if (ChangeCount !== 0) resolve(null);
        } finally {
            Updating    = parent;
            Frozen      = false;
            ChangeCount = 0;
        }
        
        return result;
    }
        
    S.data = function data<T>(value : T) : (value? : T) => T {
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
                return node.value as T;
            }
        }
    };

    S.sum = function sum<T>(value : T) : (updater? : (value : T) => T) => T {
        var node = new DataNode(value);

        return function sum(updater? : (value : T) => T) {
            if (arguments.length > 0) {
                if (Frozen) {
                    if (node.age === Time) { // value has already been updated once, pull from pending
                        node.pending = updater(node.pending);
                    } else { // add to list of changes
                        node.age = Time; 
                        node.pending = updater(node.value);
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
                return node.value as T;
            }
        }
    };
    
    function jailbreak(signal : () => void) : ComputationNode<any> {
        Jailbreaking = true;
        try {
            signal();
            return Jailbroken;
        } finally {
            Jailbreaking = false;
        }
    }

    /// Options
    class ComputationBuilder {
        _watch = null as (() => void)[];
        _pin     = undefined as ComputationNode<any>;
        _gate    = null as (node : ComputationNode<any>) => boolean;

        pin(signal : () => void) { 
            this._pin  = signal ? jailbreak(signal) : null;
            return this; 
        }
        
        async(fn : (go : () => void) => void | (() => void)) { 
            this._gate = async(fn); 
            return this; 
        }
        
        S = S;
    }

    S.watch = function watch(...signals) {
        var options = new ComputationBuilder();
        options._watch = signals;
        return options;
    };

    S.pin = function pin(s) { 
        return new ComputationBuilder().pin(s); 
    };
    
    S.async = function async(fn) { 
        return new ComputationBuilder().async(fn); 
    };

    function async(scheduler : (go : () => void) => void | (() => void)) {
        var node      = new DataNode(null),
            emitter   = new Emitter(null),
            scheduled = false,
            running   = false,
            tick      : () => void;

        node.emitter = emitter;

        return function gate(node : ComputationNode<any>) : boolean {
            var _tick;
            if (running) return true;
            if (scheduled) {
                if (tick) tick();
            } else {
                scheduled = true;
                addEdge(emitter, node);
                _tick = scheduler(go);
                if (typeof _tick === 'function') tick = _tick;
            }
            return false;
        }
        
        function go() {
            if (running) return;
            running = true;
            externalChange(node);
            running = false;
        }
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

    S.dispose = function dispose(signal : () => {}) {
        var node = jailbreak(signal);
        if (node) node.dispose();
    }

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
        
    function externalChange(change : DataNode<any>) {
        try {
            resolve(change);
        } finally {
            Frozen      = false;
            ChangeCount = 0;
            Updating    = null;
        }
    }
        
    var _changes = [] as DataNode<any>[];
        
    function resolve(change : DataNode<any>) {
        var count   = 0, 
            changes : DataNode<any>[], 
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
    function update(node : ComputationNode<any>) {
        var emitter  = node.emitter,
            receiver = node.receiver,
            i        : number, 
            len      : number, 
            edge     : Edge, 
            to       : Receiver;
        
        i = -1, len = node.children.length;
        while (++i < len) {
            node.children[i].dispose();
        }
        node.children = [];
        
        Updating = node;

        node.value = node.fn(node.self);

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
    class DataNode<T> {
        age     = 0; // Data nodes start at a time prior to the present, or else they can't be set in the current frame
        
        pending : T;
        
        emitter = null as Emitter;
        
        constructor(public value : T) { }
    }
    
    class ComputationNode<T> {
        value       : T;
        
        emitter     = null as Emitter;
        receiver    = null as Receiver;
        
        listening   = true;
        pinning     = false;
        
        children    = [] as ComputationNode<any>[];
        pins        = [] as ComputationNode<any>[];
        cleanups    = [] as (() => void)[];
        
        constructor(public fn   : (self? : () => {}) => {}, 
                    public gate : (node : ComputationNode<any>) => boolean, 
                    public self : () => {})  { }
        
        dispose() {
            if (!this.fn) return;
            
            var i    : number, 
                len  : number, 
                edge : Edge;
                
            if (Updating === this) Updating = null;
            
            this.fn = null;
    
            if (this.receiver) {
                i = -1, len = this.receiver.edges.length;
                while (++i < len) {
                    deactivate(this.receiver.edges[i]);
                }
            }
            
            if (this.emitter) {
                i = -1, len = this.emitter.edges.length;
                while (++i < len) {
                    edge = this.emitter.edges[i];
                    if (edge) deactivate(edge);
                }
            }
    
            i = -1, len = this.children.length;
            while (++i < len) {
                this.children[i].dispose();
            }
    
            i = -1, len = this.pins.length;
            while (++i < len) {
                this.pins[i].dispose();
            }
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
        
        constructor(public node : ComputationNode<any>) { }
    
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
    
    function addEdge(from : Emitter, to : ComputationNode<any>) {
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
        
        constructor(public node : ComputationNode<any>) { }
        
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
        
        active   = true;
        marked   = false;
        
        slot     : number;
        slotAge  : number;
        
        constructor(public from : Emitter, public to : Receiver, public boundary : boolean) {
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
