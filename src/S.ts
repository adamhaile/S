/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // Public interface
    var S = <S>function S<T>(fn : (v? : T) => T, seed? : T) : () => T {
        var owner  = Owner,
            reader = Reader,
            node   = new ComputationNode(fn, seed);
            
        Owner = Reader = node;
        
        if (Batching) {
            node.value = node.fn(node.value);
        } else {
            Batching = true;
            Changes.reset();
            toplevelComputation(node);
        }
        
        if (owner) (owner.owned || (owner.owned = [])).push(node);
        else throw new Error("all computations must be created under a parent computation or root");
        
        Owner = owner;
        Reader = reader;

        return function computation() {
            if (Owner) {
                if (node.age === Time) {
                    if (node.state === UPDATING) throw new Error("circular dependency");
                    else update(node);
                }
                if (Reader) logComputationRead(node, Reader);
            }
            return node.value;
        }
    };

    S.root = function root<T>(fn : (dispose? : () => void) => T) {
        var owner = Owner,
            root = new ComputationNode(null, null);

        Owner = root;

        try {
            return fn(_dispose);
        } finally {
            Owner = owner;
        }

        function _dispose() {
            if (Batching) Disposes.add(root);
            else dispose(root);
        }
    };

    S.on = function on<T>(ev : () => any, fn : (v? : T) => T, seed? : T, onchanges? : boolean) {
        if (Array.isArray(ev)) ev = callAll(ev);
        onchanges = !!onchanges;

        return S(on, seed);
        
        function on(value : T) {
            var reader = Reader;
            ev(); 
            if (onchanges) onchanges = false;
            else {
                Reader = null;
                value = fn(value);
                Reader = reader;
            } 
            return value;
        }
    };

    function callAll(ss) {
        return function all() {
            for (var i = 0; i < ss.length; i++) ss[i]();
        }
    }

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
                    if (node.log) {
                        node.pending = value;
                        event(node);
                    } else {
                        node.value = value;
                    }
                }
                return value;
            } else {
                if (Reader) logDataRead(node, Reader);
                return node.value;
            }
        }
    };
    
    S.value = function value<T>(current : T, eq? : (a : T, b : T) => boolean) : S.DataSignal<T> {
        var data = S.data(current),
            age = 0;
        return function value(update? : T) {
            if (arguments.length === 0) {
                return data();
            } else {
                var same = eq ? eq(current, update) : current === update;
                if (!same) {
                    if (age === Time) 
                        throw new Error("conflicting values: " + value + " is not the same as " + current);
                    age = Time;
                    current = update;
                    data(update);
                }
                return update;
            }
        }
    };

    S.freeze = function freeze<T>(fn : () => T) : T {
        var result : T;
        
        if (Batching) {
            result = fn();
        } else {
            Batching = true;
            Changes.reset();

            try {
                result = fn();
                event(null);
            } finally {
                Batching = false;
            }
        }
            
        return result;
    };
    
    S.sample = function sample<T>(fn : () => T) : T {
        var result : T,
            reader = Reader;
        
        if (reader) {
            Reader = null;
            result = fn();
            Reader = reader;
        } else {
            result = fn();
        }
        
        return result;
    }
    
    S.cleanup = function cleanup(fn : () => void) : void {
        if (Owner) {
            (Owner.cleanups || (Owner.cleanups = [])).push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S() computation.  Cannot call it at toplevel.");
        }
    };
    
    // Internal implementation
    
    /// Graph classes and operations
    class DataNode {
        pending = NOTPENDING as any;   
        log     = null as Log;
        
        constructor(
            public value : any
        ) { }
    }
    
    class ComputationNode {
        static count = 0;
        
        id       = ComputationNode.count++;
        age      = Time;
        state    = CURRENT;
        count    = 0;
        sources  = [] as Log[];
        log      = null as Log;
        owned = null as ComputationNode[];
        cleanups = null as ((final : boolean) => void)[];
        
        constructor(
            public fn    : (v : any) => any,
            public value : any
        ) { }
    }
    
    class Log {
        count = 0;
        nodes = [] as ComputationNode[];
        ids = [] as number[];
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
    
    // "Globals" used to keep track of current system state
    var Time     = 1,
        Batching = false, // whether we're batching changes
        Owner   = null as ComputationNode, // whether we're updating, null = no, non-null = node being updated
        Reader   = null as ComputationNode; // whether we're recording signal reads or not (sampling)
        
    // Queues for the phases of the update process
    var Changes  = new Queue<DataNode>(), // batched changes to data nodes
        _Changes = new Queue<DataNode>(), // alternate array of batched changes to data nodes
        Updates  = new Queue<ComputationNode>(), // computations to update
        Disposes = new Queue<ComputationNode>(); // disposals to run after current batch of updates finishes
    
    // Constants
    var REVIEWING = new ComputationNode(null, null),
        DEAD = new ComputationNode(null, null),
        NOTPENDING = {},
        CURRENT    = 0,
        STALE      = 1,
        UPDATING   = 2;
    
    // Functions
    function logRead(from : Log, to : ComputationNode) {
        var id = to.id,
            node = from.nodes[id];
        if (node === to) return; // already logged
        if (node !== REVIEWING) from.ids[from.count++] = id; // not in ids array
        from.nodes[id] = to;
        to.sources[to.count++] = from;
    }
        
    function logDataRead(data : DataNode, to : ComputationNode) {
        if (!data.log) data.log = new Log();
        logRead(data.log, to);
    }
    
    function logComputationRead(node : ComputationNode, to : ComputationNode) {
        if (!node.log) node.log = new Log();
        logRead(node.log, to);
    }
    
    function event(change : DataNode) {
        try {
            resolve(change);
        } finally {
            Batching  = false;
            Owner = Reader = null;
        }
    }
    
    function toplevelComputation<T>(node : ComputationNode) {
        try {
            node.value = node.fn(node.value);
    
            if (Changes.count > 0) resolve(null);
        } finally {
            Batching = false;
            Owner = Reader = null;
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
    
    function applyDataChange(data : DataNode) {
        data.value = data.pending;
        data.pending = NOTPENDING;
        if (data.log) markComputationsStale(data.log);
    }
    
    function markComputationsStale(log : Log) {
        var nodes = log.nodes, 
            ids   = log.ids,
            dead  = 0;
            
        for (var i = 0; i < log.count; i++) {
            var id = ids[i],
                node = nodes[id];
            
            if (node === REVIEWING) {
                nodes[id] = DEAD;
                dead++;
            } else {
                if (node.age < Time) {
                    node.age = Time;
                    node.state = STALE;
                    Updates.add(node);
                    if (node.owned) markOwnedNodesForDisposal(node.owned);
                    if (node.log) markComputationsStale(node.log);
                }
                
                if (dead) ids[i - dead] = id;
            } 
        }
        
        if (dead) log.count -= dead;
    }
    
    function markOwnedNodesForDisposal(owned : ComputationNode[]) {
        for (var i = 0; i < owned.length; i++) {
            var child = owned[i];
            child.age = Time;
            child.state = CURRENT;
            if (child.owned) markOwnedNodesForDisposal(child.owned);
        }
    }
    
    function update<T>(node : ComputationNode) {
        if (node.state === STALE) {
            var owner = Owner,
                reader = Reader;
        
            Owner = Reader = node;
        
            node.state = UPDATING;    
            cleanup(node, false);
            node.value = node.fn(node.value);
            node.state = CURRENT;
            
            Owner = owner;
            Reader = reader;
        }
    }
        
    function cleanup(node : ComputationNode, final : boolean) {
        var sources = node.sources,
            cleanups = node.cleanups,
            owned = node.owned;
            
        if (cleanups) {
            for (var i = 0; i < cleanups.length; i++) {
                cleanups[i](final);
            }
            node.cleanups = null;
        }
        
        if (owned) {
            for (var i = 0; i < owned.length; i++) {
                dispose(owned[i]);
            }
            node.owned = null;
        }
        
        for (var i = 0; i < node.count; i++) {
            sources[i].nodes[node.id] = REVIEWING;
            sources[i] = null;
        }
        node.count = 0;
    }
        
    function dispose(node : ComputationNode) {
        node.fn   = null;
        node.log  = null;
        
        cleanup(node, true);
        
        node.sources = null;
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