/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // "Globals" used to keep track of current system state
    var Time      = 1, // our clock, ticks every update
        Batching  = 0, // whether we're batching data changes, 0 = no, 1+ = yes, with index to next Batch slot
        Batch     = [] as DataNode<any>[], // batched changes to data nodes
        Updating  = null as ComputationNode<any>, // whether we're updating, null = no, non-null = node being updated
        Sampling  = false, // whether we're sampling signals, with no dependencies
        Disposing = false, // whether we're disposing
        Disposes  = [] as ComputationNode<any>[]; // disposals to run after current batch of changes finishes 
    
    var S = <S>function S<T>(fn : () => T) : () => T {
        var options = (this instanceof Builder ? this.options : null) as Options,
            parent  = Updating,
            gate    = (options && options.gate) || (parent && parent.gate) || null,
            _fn     = (options && options.mod) ? options.mod(fn) : fn,
            node    = new ComputationNode<T>(_fn, gate);

        if (parent && (!options || !options.toplevel)) {
            (parent.children || (parent.children = [])).push(node);
        }
            
        Updating = node;
        if (Batching) {
            node.value = _fn();
        } else {
            node.value = initialExecution(node, _fn);
        }
        Updating = parent;

        return function computation() {
            if (Disposing) {
                if (Batching) Disposes.push(node);
                else node.dispose();
            } else if (Updating && node.fn) {
                if (node.receiver && node.receiver.marks !== 0 && node.receiver.age === Time) {
                    backtrack(node.receiver);
                }
                if (!Sampling) {
                    if (!node.emitter) node.emitter = new Emitter(node);
                    addEdge(node.emitter, Updating);
                }
            }
            return node.value;
        }
    }
    
    function initialExecution<T>(node : ComputationNode<T>, fn : () => T) {
        var result : T;
        
        Time++;
        Batching = 1;
            
        try {
            result = fn();
    
            if (Batching > 1) resolve(null);
        } finally {
            Updating = null;
            Batching = 0;
        }
        
        return result;
    }
        
    S.data = function data<T>(value : T) : (value? : T) => T {
        var node = new DataNode(value);

        return function data(value? : T) {
            if (arguments.length > 0) {
                if (Batching) {
                    if (node.age === Time) { // value has already been set once, check for conflicts
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    } else { // add to list of changes
                        node.age = Time; 
                        node.pending = value;
                        Batch[Batching++] = node;
                    }
                } else { // not batching, respond to change now
                    node.age = Time; 
                    node.value = value;
                    if (node.emitter) handleEvent(node);
                }
                return value;
            } else {
                if (Updating && !Sampling) {
                    if (!node.emitter) node.emitter = new Emitter(null);
                    addEdge(node.emitter, Updating);
                }
                return node.value;
            }
        }
    };
    
    /// Options
    class Options {
        toplevel = false;
        gate     = null as (node : ComputationNode<any>) => boolean;
        mod      = null as (fn : () => any) => () => any;
    }
    
    class Builder {
        constructor(public options : Options) {}
        S(fn) { return S.call(this, fn); };
    }
    
    class AsyncOption extends Builder {
        async(fn : (go : () => void) => void | (() => void)) { 
            this.options.gate = gate(fn); 
            return new Builder(this.options); 
        }
    }
    
    class OnOption extends AsyncOption {
        on(/* ...fns */) {
            var deps, args;
            
            if (arguments.length === 0) {
                deps = noop;
            } else if (arguments.length === 1) {
                deps = arguments[0];
            } else {
                args = Array.prototype.slice.call(arguments);
                deps = callAll;
            }
            
            this.options.mod = mod;
            
            return new AsyncOption(this.options);
            
            function mod(fn) { return function on() { deps(); S.sample(fn); }; }
            function callAll() { for (var i = 0; i < args.length; i++) args[i](); }
            function noop() {}
        }
    }

    S.toplevel = function toplevel() {
        var options = new Options();
        options.toplevel = true;
        return new OnOption(options);
    }
    
    S.on = function on(/* args */) {
        return OnOption.prototype.on.apply(new OnOption(new Options()), arguments);
    }
    
    S.async = function async(fn) { 
        return new AsyncOption(new Options()).async(fn); 
    };

    function gate(scheduler : (go : () => void) => void | (() => void)) {
        var root      = new DataNode(null),
            scheduled = false,
            gotime    = 0,
            tick      : any;

        root.emitter = new Emitter(null);

        return function gate(node : ComputationNode<any>) : boolean {
            if (gotime === Time) return true;
            if (typeof tick === 'function') tick();
            else if (!scheduled) {
                scheduled = true;
                tick = scheduler(go);
            }
            addEdge(root.emitter, node);
            return false;
        }
        
        function go() {
            if (gotime === Time) return;
            scheduled = false;
            gotime = Time + 1;
            if (Batching) {
                Batch[Batching++] = root;
            } else {
                handleEvent(root);
            }
        }
    };

    S.event = function event<T>(fn : () => T) : T {
        var result : T;
        
        if (Batching) {
            result = fn();
        } else {
            Batching = 1;

            try {
                result = fn();
                handleEvent(null);
            } finally {
                Batching = 0;
            }
        }
            
        return result;
    };

    S.sample = function sample<T>(fn : () => T) : T {
        var result : T;
        
        if (Updating && !Sampling) {
            Sampling = true;
            result = fn();
            Sampling = false;
        } else {
            result = fn();
        }
        
        return result;
    }

    S.dispose = function dispose(signal : () => {}) {
        if (Disposing) {
            signal();
        } else {
            Disposing = true;
            try {
                signal();
            } finally {
                Disposing = false;
            }
        }
    }
    
    S.cleanup = function cleanup(fn : () => void) : void {
        if (Updating) {
            (Updating.cleanups || (Updating.cleanups = [])).push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S() computation.  Cannot call it at toplevel.");
        }
    };
    
    function handleEvent(change : DataNode<any>) {
        try {
            resolve(change);
        } finally {
            Batching  = 0;
            Updating  = null;
            Sampling  = false;
            Disposing = false;
        }
    }
        
    var _batch = [] as DataNode<any>[];
        
    function resolve(change : DataNode<any>) {
        var count = 0, 
            batch : DataNode<any>[], 
            i     : number, 
            len   : number;
            
        if (!Batching) Batching = 1;
            
        if (change) {
            Time++;
            
            prepare(change.emitter);
            
            notify(change.emitter);
            
            i = -1, len = Disposes.length;
            if (len) {
                while (++i < len) Disposes[i].dispose();
                Disposes = [];
            }
        }
        
        // for each batch ...
        while (Batching !== 1) {
            // prepare globals to record next batch
            Time++;
            batch = Batch, Batch = _batch, _batch = batch; // rotate batch arrays
            len = Batching, Batching = 1;
            
            // set nodes' values, clear pending data, and prepare them for update
            i = 0;
            while (++i < len) {
                change = batch[i];
                change.value = change.pending;
                change.pending = undefined;
                if (change.emitter) prepare(change.emitter);
            }
            
            // run all updates in batch
            i = 0;
            while (++i < len) {
                change = batch[i];
                if (change.emitter) notify(change.emitter);
                batch[i] = null;
            }
            
            // run disposes accumulated while updating
            i = -1, len = Disposes.length;
            if (len) {
                while (++i < len) Disposes[i].dispose();
                Disposes = [];
            }

            // if there are still changes after excessive batches, assume runaway            
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
            node      : ComputationNode<any>,
            toEmitter : Emitter;
        
        emitter.emitting = true;
            
        while (++i < len) {
            edge = edges[i];
            if (edge && (!edge.boundary || edge.to.node.gate(edge.to.node))) {
                to = edge.to;
                node = to.node;
                toEmitter = node.emitter;

                // if an earlier update threw an exception, marks may be dirty - clear it now
                if (to.marks !== 0 && to.age < Time) {
                    to.marks = 0;
                    if (toEmitter) toEmitter.emitting = false;
                }

                // if we've come back to an emitting Emitter, that's a cycle
                if (toEmitter && toEmitter.emitting)
                    throw new Error("circular dependency"); // TODO: more helpful reporting

                edge.marked = true;
                to.marks++;
                to.age = Time;

                // if this is the first time to's been marked, then prepare children propagate
                if (to.marks === 1) {
                    if (node.children) prepareChildren(node.children);
                    if (toEmitter) prepare(toEmitter);
                }
            }
        }

        emitter.emitting = false;
    }
    
    function prepareChildren(children : ComputationNode<any>[]) {
        var i = -1, len = children.length, child : ComputationNode<any>;
        while (++i < len) {
            child = children[i];
            child.fn = null;
            if (child.children) prepareChildren(child.children);
        }
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
                    
        if (emitter.fragmented()) emitter.compact();
    }
    
    /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
    function update(node : ComputationNode<any>) {
        var emitter   = node.emitter,
            receiver  = node.receiver,
            disposing = node.fn === null,
            i         : number, 
            len       : number, 
            edge      : Edge, 
            to        : Receiver;
        
        Updating = node;

        disposeChildren(node);
        node.cleanup(disposing);

        if (!disposing) node.value = node.fn();

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
                        
            if (disposing) {
                emitter.detach();
            } else if (emitter.fragmented()) emitter.compact();
        }
        
        if (receiver) {
            if (disposing) {
                receiver.detach();
            } else {
                i = -1, len = receiver.edges.length;
                while (++i < len) {
                    edge = receiver.edges[i];
                    if (edge.active && edge.age < Time) {
                        edge.deactivate();
                    }
                }
                
                if (receiver.fragmented()) receiver.compact();
            }
        }
    }
        
    function disposeChildren(node : ComputationNode<any>) {
        if (!node.children) return;
        
        var i = -1, len = node.children.length, child : ComputationNode<any>;
        while (++i < len) {
            child = node.children[i];
            if (!child.receiver || child.receiver.age < Time) {
                disposeChildren(child);
                child.dispose();
            }
        }
        
        node.children = null;
    }    
        
    /// update the given node by backtracking its dependencies to clean state and updating from there
    function backtrack(receiver : Receiver) {
        var updating = Updating,
            sampling = Sampling;
        backtrack(receiver);
        Updating = updating;
        Sampling = sampling;
        
        function backtrack(receiver : Receiver) {
            var i       = -1, 
                len     = receiver.edges.length, 
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
                    }
                }
            }
        }
    }
    
    /// Graph classes and operations
    class DataNode<T> {
        age     = 0; // Data nodes start at a time prior to the present, or else they can't be set in the current frame
        pending : T;   
        emitter = null as Emitter;
        
        constructor(
            public value : T
        ) { }
    }
    
    class ComputationNode<T> {
        value     : T;
        
        emitter   = null as Emitter;
        receiver  = null as Receiver;
        
        // children and cleanups generated by last update
        children  = null as ComputationNode<any>[];
        cleanups  = null as ((final : boolean) => void)[];
        
        constructor(
            public fn   : () => T, 
            public gate : (node : ComputationNode<any>) => boolean
        )  { }
        
        // dispose node: free memory, dispose children, cleanup, detach from graph
        dispose() {
            if (!this.fn) return;
            
            this.fn    = null;
            this.gate  = null;
            
            if (this.children) {
                var i = -1, len = this.children.length;
                while (++i < len) {
                    this.children[i].dispose();
                }
            }
            
            this.cleanup(true);
            if (this.receiver) this.receiver.detach();
            if (this.emitter) this.emitter.detach();
        }
        
        cleanup(final : boolean) {
            if (this.cleanups) {
                var i = -1, len = this.cleanups.length;
                while (++i < len) {
                    this.cleanups[i](final);
                }
                this.cleanups = null;
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
        
        constructor(
            public node : ComputationNode<any>
        ) { }
    
        detach() {
            var i = -1, len = this.edges.length, edge : Edge;
            while (++i < len) {
                edge = this.edges[i];
                if (edge) edge.deactivate();
            }
        }
    
        fragmented() {
            return this.edges.length > 10 && this.edges.length / this.active > 4;
        }
    
        compact() {
            var i          = -1, 
                len        = this.edges.length, 
                edges      = [] as Edge[], 
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
        
        if (edge) edge.activate(from);
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
        
        constructor(
            public node : ComputationNode<any>
        ) { }
        
        detach() {
            var i = -1, len = this.edges.length;
            while (++i < len) {
                this.edges[i].deactivate();
            }
        }
        
        fragmented() {
            return this.edges.length > 10 && this.edges.length / this.active > 4;
        }
        
        compact() {
            var i     = -1, 
                len   = this.edges.length, 
                edges = [] as Edge[], 
                index = [] as Edge[], 
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
        
        constructor(
            public from : Emitter, 
            public to : Receiver, 
            public boundary : boolean
        ) {
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
