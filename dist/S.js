/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // Public interface
    var S = function S(fn, seed) {
        var owner = Owner, clock = Clock || TopClock, running = Running;
        if (!owner)
            throw new Error("all computations must be created under a parent computation or root");
        var node = new ComputationNode(clock, fn, seed);
        Owner = Running = node;
        if (Clock) {
            node.value = node.fn(node.value);
        }
        else {
            Clock = clock;
            clock.changes.reset();
            toplevelComputation(node);
        }
        (owner.owned || (owner.owned = [])).push(node);
        Owner = owner;
        Running = running;
        return function computation() {
            if (Owner) {
                if (node.age === node.clock.time) {
                    if (node.state === RUNNING)
                        throw new Error("circular dependency");
                    else
                        update(node);
                }
                if (Running)
                    logComputationRead(node, Running);
            }
            return node.value;
        };
    };
    S.root = function root(fn) {
        var owner = Owner, root = new ComputationNode(Clock || TopClock, null, null);
        Owner = root;
        try {
            return fn(_dispose);
        }
        finally {
            Owner = owner;
        }
        function _dispose() {
            if (Clock)
                Clock.disposes.add(root);
            else
                dispose(root);
        }
    };
    S.on = function on(ev, fn, seed, onchanges) {
        if (Array.isArray(ev))
            ev = callAll(ev);
        onchanges = !!onchanges;
        return S(on, seed);
        function on(value) {
            var running = Running;
            ev();
            if (onchanges)
                onchanges = false;
            else {
                Running = null;
                value = fn(value);
                Running = running;
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
        var node = new DataNode(Owner ? Owner.clock : TopClock, value);
        return function data(value) {
            if (arguments.length > 0) {
                if (Clock) {
                    if (node.pending !== NOTPENDING) {
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    }
                    else {
                        node.pending = value;
                        Clock.changes.add(node);
                    }
                }
                else {
                    if (node.log) {
                        node.pending = value;
                        event(TopClock, node);
                    }
                    else {
                        node.value = value;
                    }
                }
                return value;
            }
            else {
                if (Running)
                    logDataRead(node, Running);
                return node.value;
            }
        };
    };
    S.value = function value(current, eq) {
        var data = S.data(current), clock = Clock || TopClock, age = 0;
        return function value(update) {
            if (arguments.length === 0) {
                return data();
            }
            else {
                var same = eq ? eq(current, update) : current === update;
                if (!same) {
                    if (age === clock.time)
                        throw new Error("conflicting values: " + value + " is not the same as " + current);
                    age = clock.time;
                    current = update;
                    data(update);
                }
                return update;
            }
        };
    };
    S.freeze = function freeze(fn) {
        var result;
        if (Clock) {
            result = fn();
        }
        else {
            Clock = TopClock;
            Clock.changes.reset();
            try {
                result = fn();
                event(TopClock, null);
            }
            finally {
                Clock = null;
            }
        }
        return result;
    };
    S.sample = function sample(fn) {
        var result, running = Running;
        if (running) {
            Running = null;
            result = fn();
            Running = running;
        }
        else {
            result = fn();
        }
        return result;
    };
    S.cleanup = function cleanup(fn) {
        if (Owner) {
            (Owner.cleanups || (Owner.cleanups = [])).push(fn);
        }
        else {
            throw new Error("S.cleanup() must be called from within an S() computation.  Cannot call it at toplevel.");
        }
    };
    // Internal implementation
    /// Graph classes and operations
    var SubClock = (function () {
        function SubClock() {
            this.time = 0;
            this.changes = new Queue(); // batched changes to data nodes
            this.updates = new Queue(); // computations to update
            this.disposes = new Queue(); // disposals to run after current batch of updates finishes
        }
        return SubClock;
    }());
    var DataNode = (function () {
        function DataNode(clock, value) {
            this.clock = clock;
            this.value = value;
            this.pending = NOTPENDING;
            this.log = null;
        }
        return DataNode;
    }());
    var ComputationNode = (function () {
        function ComputationNode(clock, fn, value) {
            this.clock = clock;
            this.fn = fn;
            this.value = value;
            this.id = ComputationNode.count++;
            this.state = CURRENT;
            this.count = 0;
            this.sources = [];
            this.log = null;
            this.owned = null;
            this.cleanups = null;
            this.age = this.clock.time;
        }
        return ComputationNode;
    }());
    ComputationNode.count = 0;
    var Log = (function () {
        function Log() {
            this.count = 0;
            this.nodes = [];
            this.ids = [];
        }
        return Log;
    }());
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
    }());
    // "Globals" used to keep track of current system state
    var TopClock = new SubClock(), Clock = null, // whether we're batching changes
    Owner = null, // whether we're updating, null = no, non-null = node being updated
    Running = null; // whether we're recording signal reads or not (sampling)
    // Constants
    var REVIEWING = new ComputationNode(TopClock, null, null), DEAD = new ComputationNode(TopClock, null, null), NOTPENDING = {}, CURRENT = 0, STALE = 1, RUNNING = 2;
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
    function event(clock, change) {
        try {
            resolve(clock, change);
        }
        finally {
            Clock = Owner = Running = null;
        }
    }
    function toplevelComputation(node) {
        try {
            node.value = node.fn(node.value);
            if (node.clock.changes.count > 0)
                resolve(node.clock, null);
        }
        finally {
            Clock = Owner = Running = null;
        }
    }
    function resolve(clock, change) {
        var count = 0;
        Clock = clock;
        clock.updates.reset();
        clock.disposes.reset();
        if (change) {
            clock.changes.reset();
            clock.time++;
            applyDataChange(change);
            clock.updates.run(update);
            clock.disposes.run(dispose);
        }
        // for each batch ...
        while (clock.changes.count !== 0) {
            clock.time++;
            clock.changes.run(applyDataChange);
            clock.updates.run(update);
            clock.disposes.run(dispose);
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
                if (node.age < node.clock.time) {
                    node.age = node.clock.time;
                    node.state = STALE;
                    node.clock.updates.add(node);
                    if (node.owned)
                        markOwnedNodesForDisposal(node.owned);
                    if (node.log)
                        markComputationsStale(node.log);
                }
                if (dead)
                    ids[i - dead] = id;
            }
        }
        if (dead)
            log.count -= dead;
    }
    function markOwnedNodesForDisposal(owned) {
        for (var i = 0; i < owned.length; i++) {
            var child = owned[i];
            child.age = child.clock.time;
            child.state = CURRENT;
            if (child.owned)
                markOwnedNodesForDisposal(child.owned);
        }
    }
    function update(node) {
        if (node.state === STALE) {
            var owner = Owner, running = Running;
            Owner = Running = node;
            node.state = RUNNING;
            cleanup(node, false);
            node.value = node.fn(node.value);
            node.state = CURRENT;
            Owner = owner;
            Running = running;
        }
    }
    function cleanup(node, final) {
        var sources = node.sources, cleanups = node.cleanups, owned = node.owned;
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
    function dispose(node) {
        node.fn = null;
        node.log = null;
        cleanup(node, true);
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
