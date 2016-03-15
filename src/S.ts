/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // "Globals" used to keep track of current system state
    var Time         = 1,
        Batching     = false, // whether we're batching changes
        Updating     = null as ComputationNode, // whether we're updating, null = no, non-null = node being updated
        Sampling     = false, // whether we're sampling signals, with no dependencies
        Disposing    = false; // whether we're disposing
    
    // Constants
    var NOTPENDING = {},
        CURRENT    = 0,
        STALE      = 1,
        UPDATING   = 2;
        
    var S = <S>function S<T>(fn : () => T) : () => T {
        var parent   = Updating,
            sampling = Sampling,
            opts     = (this instanceof Builder ? this : null) as Builder<T>,
            node     = new ComputationNode(fn, parent && parent.trait);
            
        Updating = node;
        Sampling = false;
        
        if (Batching) {
            if (opts && opts.mod) node.fn = opts.mod(node.fn);
            if (node.trait) node.fn = node.trait(node.fn);
            node.value = node.fn();
        } else {
            Batching = true;
            Changes.reset();
            toplevelComputation(node, opts && opts.mod);
        }
        
        if (parent && (!opts || !opts.orphan)) (parent.children || (parent.children = [])).push(node);
        
        Updating = parent;
        Sampling = sampling;

        return function computation() {
            if (Disposing) {
                if (Updating) Disposes.add(node);
                else dispose(node);
            } else if (Updating) {
                if (node.age === Time) {
                    if (node.state === UPDATING) throw new Error("circular dependency");
                    else update(node);
                }
                if (!Sampling) recordComputationRead(node, Updating);
            }
            return node.value;
        }
    }
    
    function toplevelComputation<T>(node : ComputationNode, mod : (fn : () => T) => () => T) {
        try {
            if (node.trait) node.fn = node.trait(node.fn);
            if (mod) node.fn = mod(node.fn);
            node.value = node.fn();
    
            if (Changes.count > 0) resolve(null);
        } finally {
            Batching = false;
            Updating = null;
            Sampling = false;
            Disposing = false;
        }
    }
        
    S.on = function on<T>(ev : () => any, fn : (v? : T) => T, seed? : T) {
        var first = true;
        
        return this instanceof Builder ? this.S(on) : S(on);
        
        function on() : T { 
            ev(); 
            if (first) first = false;
            else if (Updating && !Sampling) {
                Sampling = true;
                seed = fn(seed);
                Sampling = false;
            } else {
                seed = fn(seed);
            }
            return seed;
        }
    };

    S.data = function data<T>(value : T) : (value? : T) => T {
        var node = new DataNode(value);

        return function data(value? : T) : T {
            if (arguments.length > 0) {
                if (Batching) {
                    if (node.pending !== NOTPENDING) { // value has already been set once, check for conflicts
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    } else { // add to list of changes
                        node.pending = value;
                        Changes.add(node);
                    }
                } else { // not batching, respond to change now
                    if (node.emitter) {
                        node.pending = value;
                        handleEvent(node);
                    } else {
                        node.value = value;
                    }
                }
                return value;
            } else {
                if (Updating && !Sampling) recordDataRead(node, Updating);
                return node.value;
            }
        }
    };
    
    S.sum = function sum<T>(value : T) : (update? : (value : T) => T) => T {
        var node = new DataNode(value);

        return function sum(update? : (value : T) => T) : T {
            if (arguments.length > 0) {
                if (Batching) {
                    if (node.pending !== NOTPENDING) { // value has already been set once, update pending value
                        node.pending = update(node.pending);
                    } else { // add to list of changes
                        node.pending = update(node.value);
                        Changes.add(node);
                    }
                } else { // not batching, respond to change now
                    if (node.emitter) {
                        node.pending = update(node.value);
                        handleEvent(node);
                    } else {
                        node.value = update(node.value);
                    }
                }
                return value;
            } else {
                if (Updating && !Sampling) recordDataRead(node, Updating);
                return node.value;
            }
        }
    };

    S.event = function event<T>(fn : () => T) : T {
        var result : T;
        
        if (Batching) {
            result = fn();
        } else {
            Batching = true;
            Changes.reset();

            try {
                result = fn();
                handleEvent(null);
            } finally {
                Batching = false;
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
    
    /// Builder
    class Builder<T> implements SBuilder {
        orphan = false;
        mod : (fn : () => T) => () => T;
        
        constructor(prev : Builder<T>, orphan : boolean, mod : (fn : () => T) => () => T) {
            this.mod = prev && prev.mod ? mod ? compose(prev.mod, mod) : prev.mod : mod;
            this.orphan = prev && prev.orphan || orphan;
        }
        
        S : any;
        on : any;
        
        async<T>(scheduler : (go : () => T) => () => T) { 
            return new Builder(this, false, async(scheduler)); 
        }
    }
    
    function compose(a, b) { return function compose(x) { return a(b(x)); }; }
    
    Builder.prototype.S = S;
    Builder.prototype.on = S.on;

    S.orphan = function orphan() {
        return new Builder(null, true, null);
    }
    
    S.async = function (fn) { 
        return new Builder(null, false, async(fn)); 
    };

    function async<T>(scheduler : (go : () => void) => () => void) : (fn : () => T) => () => T {
        var gotime = 0,
            root = new DataNode(null),
            tick = scheduler(go);
            
        return function asyncmod(fn) {
            if (Updating) {
                Updating.trait = asyncmod;
                Updating.hold = hold;
            }
            return fn;
        }
        
        function hold() {
            if (Time === gotime) return false;
            if (tick) tick();
            recordDataRead(root, this);
            return true;
        }
        
        function go() {
            gotime = Time + 1;
            if (Batching) Changes.add(root);
            else handleEvent(root);
        }
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
    
    function handleEvent(change : DataNode) {
        try {
            resolve(change);
        } finally {
            Batching  = false;
            Updating  = null;
            Sampling  = false;
            Disposing = false;
        }
    }
        
    function resolve(change : DataNode) {
        var count = 0,
            changes : Queue<DataNode>;
            
        Batching = true;
        Updates.reset();
        Disposes.reset();
            
        if (change) {
            Changes.reset();
            
            Time++;
            applyDataChange(change);
            Updates.run(update);
            Disposes.run(dispose);
        }
        
        // for each batch ...
        while (Changes.count !== 0) {
            changes = Changes, Changes = _Changes, _Changes = changes;
            Changes.reset();
            
            Time++;
            changes.run(applyDataChange);
            Updates.run(update);
            Disposes.run(dispose);

            // if there are still changes after excessive batches, assume runaway            
            if (count++ > 1e5) {
                throw new Error("Runaway frames detected");
            }
        }
    }
    
    function update<T>(node : ComputationNode) {
        if (node.state === STALE) {
            var updating = Updating,
                sampling = Sampling;
        
            Updating = node;
            Sampling = false;
        
            node.state = UPDATING;    
            cleanup(node, false);
            node.value = node.fn();
            node.state = CURRENT;
            
            Updating = updating;
            Sampling = sampling;
        }
    }
    
    function recordDataRead(data : DataNode, to : ComputationNode) {
        if (!data.emitter) data.emitter = new Emitter();
        recordRead(data.emitter, to);
    }
    
    function recordComputationRead(node : ComputationNode, to : ComputationNode) {
        if (!node.emitter) node.emitter = new Emitter();
        recordRead(node.emitter, to);
    }
    
    function recordRead(from : Emitter, to : ComputationNode) {
        var id = to.id,
            node = from.nodes[id];
        if (node === to) return;
        if (node !== DETACHED) from.index[from.count++] = id;
        from.nodes[id] = to;
        to.sources[to.count++] = from;
    }
    
    function applyDataChange(data : DataNode) {
        data.value = data.pending;
        data.pending = NOTPENDING;
        if (data.emitter) markComputationsStale(data.emitter);
    }
    
    function markComputationsStale(emitter : Emitter) {
        var nodes = emitter.nodes, 
            index = emitter.index,
            dead = 0;
            
        for (var i = 0; i < emitter.count; i++) {
            var id = index[i],
                node = nodes[id];
            
            if (node === DETACHED) {
                nodes[id] = DEAD;
                dead++;
            } else {
                if (node.age < Time) {
                    node.age = Time;
                    if (!node.hold || !node.hold()) {
                        node.state = STALE;
                        Updates.add(node);
                        if (node.children) markChildrenForDisposal(node.children);
                        if (node.emitter) markComputationsStale(node.emitter);
                    } else {
                        node.state = CURRENT;
                    }
                }
                
                if (dead) index[i - dead] = id;
            } 
        }
        
        if (dead) emitter.count -= dead;
    }
    
    function markChildrenForDisposal(children : ComputationNode[]) {
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            child.age = Time;
            child.state = CURRENT;
            if (child.children) markChildrenForDisposal(child.children);
        }
    }
        
    function dispose(node : ComputationNode) {
        node.fn      = null;
        node.trait   = null;
        node.hold    = null;
        node.emitter = null;
        
        cleanup(node, true);
        
        node.sources = null;
    }
        
    function cleanup(node : ComputationNode, final : boolean) {
        var sources = node.sources,
            cleanups = node.cleanups,
            children = node.children;
            
        if (cleanups) {
            for (var i = 0; i < cleanups.length; i++) {
                cleanups[i](final);
            }
            node.cleanups = null;
        }
        
        if (children) {
            for (var i = 0; i < children.length; i++) {
                dispose(children[i]);
            }
            node.children = null;
        }
        
        for (var i = 0; i < node.count; i++) {
            sources[i].nodes[node.id] = DETACHED;
            sources[i] = null;
        }
        node.count = 0;
    }
    
    class Queue<T> {
        items = [] as T[];
        count = 0;
        
        reset() {
            this.count = 0;
        }
        
        add(item : T) {
            this.items[this.count++] = item;
        }
        
        run(fn : (item : T) => void) {
            var items = this.items, count = this.count;
            for (var i = 0; i < count; i++) {
                fn(items[i]);
                items[i] = null;
            }
            this.count = 0;
        }
    }
    
    /// Graph classes and operations
    class DataNode {
        pending = NOTPENDING as any;   
        emitter = null as Emitter;
        
        constructor(
            public value : any
        ) { }
    }
    
    class ComputationNode {
        static count = 0;
        
        id       = ComputationNode.count++;
        value    = undefined as any;
        age      = Time;
        state    = CURRENT;
        hold     = null as () => boolean;
        count    = 0;
        sources  = [] as Emitter[];
        emitter  = null as Emitter;
        children = null as ComputationNode[];
        cleanups = null as ((final : boolean) => void)[];
        
        constructor(
            public fn : () => any,
            public trait  : (fn : () => any) => () => any
        ) { }
    }
    
    class Emitter {
        count = 0;
        nodes = [] as ComputationNode[];
        index = [] as number[];
    }
        
    // Queues for the phases of the update process
    var Changes  = new Queue<DataNode>(), // batched changes to data nodes
        _Changes = new Queue<DataNode>(), // batched changes to data nodes
        Updates  = new Queue<ComputationNode>(), // computations to update
        Disposes = new Queue<ComputationNode>(); // disposals to run after current batch of updates finishes
    
    var DETACHED = new ComputationNode(null, null),
        DEAD = new ComputationNode(null, null);
    
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