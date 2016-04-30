/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // Public interface
    var S = function S(fn) {
        var parent = Updating, sampling = Sampling, opts = (this instanceof Builder ? this : null), node = new ComputationNode(fn, parent && parent.trait);
        Updating = node;
        Sampling = false;
        if (Batching) {
            if (opts && opts.mod)
                node.fn = opts.mod(node.fn);
            if (node.trait)
                node.fn = node.trait(node.fn);
            node.value = node.fn();
        }
        else {
            Batching = true;
            Changes.reset();
            toplevelComputation(node, opts && opts.mod);
        }
        if (parent && (!opts || !opts.orphan))
            (parent.children || (parent.children = [])).push(node);
        Updating = parent;
        Sampling = sampling;
        return function computation() {
            if (Disposing) {
                if (Updating)
                    Disposes.add(node);
                else
                    dispose(node);
            }
            else if (Updating) {
                if (node.age === Time) {
                    if (node.state === UPDATING)
                        throw new Error("circular dependency");
                    else
                        update(node);
                }
                if (!Sampling)
                    logComputationRead(node, Updating);
            }
            return node.value;
        };
    };
    S.on = function on(ev, fn, value, onchanges) {
        if (Array.isArray(ev))
            ev = callAll(ev);
        onchanges = !!onchanges;
        return this instanceof Builder ? this.S(on) : S(on);
        function on() {
            ev();
            if (onchanges)
                onchanges = false;
            else {
                Sampling = true;
                value = fn(value);
                Sampling = false;
            }
            return value;
        }
    };
    function callAll(ss) {
        return function all() {
            for (var i = 0; i < ss.length; i++)
                ss[i]();
        };
    }
    S.data = function data(value) {
        var node = new DataNode(value);
        return function data(value) {
            if (arguments.length > 0) {
                if (Batching) {
                    if (node.pending !== NOTPENDING) {
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    }
                    else {
                        node.pending = value;
                        Changes.add(node);
                    }
                }
                else {
                    if (node.log) {
                        node.pending = value;
                        event(node);
                    }
                    else {
                        node.value = value;
                    }
                }
                return value;
            }
            else {
                if (Updating && !Sampling)
                    logDataRead(node, Updating);
                return node.value;
            }
        };
    };
    S.sum = function sum(value) {
        var node = new DataNode(value);
        return function sum(update) {
            if (arguments.length > 0) {
                if (Batching) {
                    if (node.pending !== NOTPENDING) {
                        node.pending = update(node.pending);
                    }
                    else {
                        node.pending = update(node.value);
                        Changes.add(node);
                    }
                }
                else {
                    if (node.log) {
                        node.pending = update(node.value);
                        event(node);
                    }
                    else {
                        node.value = update(node.value);
                    }
                }
                return value;
            }
            else {
                if (Updating && !Sampling)
                    logDataRead(node, Updating);
                return node.value;
            }
        };
    };
    S.event = function batch(fn) {
        var result;
        if (Batching) {
            result = fn();
        }
        else {
            Batching = true;
            Changes.reset();
            try {
                result = fn();
                event(null);
            }
            finally {
                Batching = false;
            }
        }
        return result;
    };
    S.sample = function sample(fn) {
        var result;
        if (Updating && !Sampling) {
            Sampling = true;
            result = fn();
            Sampling = false;
        }
        else {
            result = fn();
        }
        return result;
    };
    /// Builder
    var Builder = (function () {
        function Builder(prev, orphan, mod) {
            this.orphan = false;
            this.mod = prev && prev.mod ? mod ? compose(prev.mod, mod) : prev.mod : mod;
            this.orphan = prev && prev.orphan || orphan;
        }
        Builder.prototype.async = function (scheduler) {
            return new Builder(this, false, async(scheduler));
        };
        return Builder;
    })();
    function compose(a, b) { return function compose(x) { return a(b(x)); }; }
    Builder.prototype.S = S;
    Builder.prototype.on = S.on;
    S.orphan = function orphan() {
        return new Builder(null, true, null);
    };
    S.async = function (fn) {
        return new Builder(null, false, async(fn));
    };
    function async(scheduler) {
        var gotime = 0, root = new DataNode(null), tick = scheduler(go);
        return function asyncmod(fn) {
            if (Updating) {
                Updating.trait = asyncmod;
                Updating.hold = hold;
            }
            return fn;
        };
        function hold() {
            if (Time === gotime)
                return false;
            if (tick)
                tick();
            logDataRead(root, this);
            return true;
        }
        function go() {
            gotime = Time + 1;
            if (Batching)
                Changes.add(root);
            else
                event(root);
        }
    }
    S.dispose = function dispose(signal) {
        if (Disposing) {
            signal();
        }
        else {
            Disposing = true;
            try {
                signal();
            }
            finally {
                Disposing = false;
            }
        }
    };
    S.cleanup = function cleanup(fn) {
        if (Updating) {
            (Updating.cleanups || (Updating.cleanups = [])).push(fn);
        }
        else {
            throw new Error("S.cleanup() must be called from within an S() computation.  Cannot call it at toplevel.");
        }
    };
    // Internal implementation
    /// Graph classes and operations
    var DataNode = (function () {
        function DataNode(value) {
            this.value = value;
            this.pending = NOTPENDING;
            this.log = null;
        }
        return DataNode;
    })();
    var ComputationNode = (function () {
        function ComputationNode(fn, trait) {
            this.fn = fn;
            this.trait = trait;
            this.id = ComputationNode.count++;
            this.value = undefined;
            this.age = Time;
            this.state = CURRENT;
            this.hold = null;
            this.count = 0;
            this.sources = [];
            this.log = null;
            this.children = null;
            this.cleanups = null;
        }
        ComputationNode.count = 0;
        return ComputationNode;
    })();
    var Log = (function () {
        function Log() {
            this.count = 0;
            this.nodes = [];
            this.ids = [];
        }
        return Log;
    })();
    var Queue = (function () {
        function Queue() {
            this.items = [];
            this.count = 0;
        }
        Queue.prototype.reset = function () {
            this.count = 0;
        };
        Queue.prototype.add = function (item) {
            this.items[this.count++] = item;
        };
        Queue.prototype.run = function (fn) {
            var items = this.items, count = this.count;
            for (var i = 0; i < count; i++) {
                fn(items[i]);
                items[i] = null;
            }
            this.count = 0;
        };
        return Queue;
    })();
    // "Globals" used to keep track of current system state
    var Time = 1, Batching = false, // whether we're batching changes
    Updating = null, // whether we're updating, null = no, non-null = node being updated
    Sampling = false, // whether we're sampling signals, with no dependencies
    Disposing = false; // whether we're disposing
    // Queues for the phases of the update process
    var Changes = new Queue(), // batched changes to data nodes
    _Changes = new Queue(), // batched changes to data nodes
    Updates = new Queue(), // computations to update
    Disposes = new Queue(); // disposals to run after current batch of updates finishes
    // Constants
    var REVIEWING = new ComputationNode(null, null), DEAD = new ComputationNode(null, null), NOTPENDING = {}, CURRENT = 0, STALE = 1, UPDATING = 2;
    // Functions
    function logRead(from, to) {
        var id = to.id, node = from.nodes[id];
        if (node === to)
            return; // already logged
        if (node !== REVIEWING)
            from.ids[from.count++] = id; // not in ids array
        from.nodes[id] = to;
        to.sources[to.count++] = from;
    }
    function logDataRead(data, to) {
        if (!data.log)
            data.log = new Log();
        logRead(data.log, to);
    }
    function logComputationRead(node, to) {
        if (!node.log)
            node.log = new Log();
        logRead(node.log, to);
    }
    function event(change) {
        try {
            resolve(change);
        }
        finally {
            Batching = false;
            Updating = null;
            Sampling = false;
            Disposing = false;
        }
    }
    function toplevelComputation(node, mod) {
        try {
            if (node.trait)
                node.fn = node.trait(node.fn);
            if (mod)
                node.fn = mod(node.fn);
            node.value = node.fn();
            if (Changes.count > 0)
                resolve(null);
        }
        finally {
            Batching = false;
            Updating = null;
            Sampling = false;
            Disposing = false;
        }
    }
    function resolve(change) {
        var count = 0, changes;
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
    function applyDataChange(data) {
        data.value = data.pending;
        data.pending = NOTPENDING;
        if (data.log)
            markComputationsStale(data.log);
    }
    function markComputationsStale(log) {
        var nodes = log.nodes, ids = log.ids, dead = 0;
        for (var i = 0; i < log.count; i++) {
            var id = ids[i], node = nodes[id];
            if (node === REVIEWING) {
                nodes[id] = DEAD;
                dead++;
            }
            else {
                if (node.age < Time) {
                    node.age = Time;
                    if (!node.hold || !node.hold()) {
                        node.state = STALE;
                        Updates.add(node);
                        if (node.children)
                            markChildrenForDisposal(node.children);
                        if (node.log)
                            markComputationsStale(node.log);
                    }
                    else {
                        node.state = CURRENT;
                    }
                }
                if (dead)
                    ids[i - dead] = id;
            }
        }
        if (dead)
            log.count -= dead;
    }
    function markChildrenForDisposal(children) {
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            child.age = Time;
            child.state = CURRENT;
            if (child.children)
                markChildrenForDisposal(child.children);
        }
    }
    function update(node) {
        if (node.state === STALE) {
            var updating = Updating, sampling = Sampling;
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
    function cleanup(node, final) {
        var sources = node.sources, cleanups = node.cleanups, children = node.children;
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
            sources[i].nodes[node.id] = REVIEWING;
            sources[i] = null;
        }
        node.count = 0;
    }
    function dispose(node) {
        node.fn = null;
        node.trait = null;
        node.hold = null;
        node.log = null;
        cleanup(node, true);
        node.sources = null;
    }
    // UMD exporter
    /* globals define */
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = S; // CommonJS
    }
    else if (typeof define === 'function') {
        define([], function () { return S; }); // AMD
    }
    else {
        (eval || function () { })("this").S = S; // fallback to global object
    }
})();
