/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // Public interface
    var S = function S(fn, seed) {
        var owner = Owner, clock = RunningClock || RootClock, running = RunningNode;
        if (!owner)
            throw new Error("all computations must be created under a parent computation or root");
        var node = new ComputationNode(clock, fn, seed);
        Owner = RunningNode = node;
        if (RunningClock) {
            node.value = node.fn(node.value);
        }
        else {
            toplevelComputation(node);
        }
        if (owner !== UNOWNED)
            (owner.owned || (owner.owned = [])).push(node);
        Owner = owner;
        RunningNode = running;
        return function computation() {
            if (RunningNode) {
                var rclock = RunningClock, sclock = node.clock;
                while (rclock.depth > sclock.depth + 1)
                    rclock = rclock.parent;
                if (rclock === sclock || rclock.parent === sclock) {
                    if (node.preclocks) {
                        for (var i = 0; i < node.preclocks.count; i++) {
                            var preclock = node.preclocks.clocks[i];
                            updateClock(preclock);
                        }
                    }
                    if (node.age === node.clock.time()) {
                        if (node.state === RUNNING)
                            throw new Error("circular dependency");
                        else
                            updateNode(node); // checks for state === STALE internally, so don't need to check here
                    }
                    if (node.preclocks) {
                        for (var i = 0; i < node.preclocks.count; i++) {
                            var preclock = node.preclocks.clocks[i];
                            if (rclock === sclock)
                                logNodePreClock(preclock, RunningNode);
                            else
                                logClockPreClock(preclock, rclock, RunningNode);
                        }
                    }
                }
                else {
                    if (rclock.depth > sclock.depth)
                        rclock = rclock.parent;
                    while (sclock.depth > rclock.depth + 1)
                        sclock = sclock.parent;
                    if (sclock.parent === rclock) {
                        logNodePreClock(sclock, RunningNode);
                    }
                    else {
                        if (sclock.depth > rclock.depth)
                            sclock = sclock.parent;
                        while (rclock.parent !== sclock.parent)
                            rclock = rclock.parent, sclock = sclock.parent;
                        logClockPreClock(sclock, rclock, RunningNode);
                    }
                    updateClock(sclock);
                }
                logComputationRead(node, RunningNode);
            }
            return node.value;
        };
    };
    S.root = function root(fn) {
        var owner = Owner, root = fn.length === 0 ? UNOWNED : new ComputationNode(RunningClock || RootClock, null, null), result = undefined;
        Owner = root;
        try {
            result = fn.length === 0 ? fn() : fn(function _dispose() {
                if (RunningClock)
                    RunningClock.disposes.add(root);
                else
                    dispose(root);
            });
        }
        finally {
            Owner = owner;
        }
        return result;
    };
    S.on = function on(ev, fn, seed, onchanges) {
        if (Array.isArray(ev))
            ev = callAll(ev);
        onchanges = !!onchanges;
        return S(on, seed);
        function on(value) {
            var running = RunningNode;
            ev();
            if (onchanges)
                onchanges = false;
            else {
                RunningNode = null;
                value = fn(value);
                RunningNode = running;
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
        var node = new DataNode(RunningClock || RootClock, value);
        return function data(value) {
            var rclock = RunningClock, sclock = node.clock;
            if (RunningClock) {
                while (rclock.depth > sclock.depth)
                    rclock = rclock.parent;
                while (sclock.depth > rclock.depth && sclock.parent !== rclock)
                    sclock = sclock.parent;
                if (sclock.parent !== rclock)
                    while (rclock.parent !== sclock.parent)
                        rclock = rclock.parent, sclock = sclock.parent;
                if (rclock !== sclock) {
                    updateClock(sclock);
                }
            }
            var cclock = rclock === sclock ? sclock : sclock.parent;
            if (arguments.length > 0) {
                if (RunningClock) {
                    if (node.pending !== NOTPENDING) {
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    }
                    else {
                        node.pending = value;
                        cclock.changes.add(node);
                        markClockStale(cclock);
                    }
                }
                else {
                    if (node.log) {
                        node.pending = value;
                        RootClock.changes.add(node);
                        event();
                    }
                    else {
                        node.value = value;
                    }
                }
                return value;
            }
            else {
                if (RunningNode) {
                    logDataRead(node, RunningNode);
                    if (sclock.parent === rclock)
                        logNodePreClock(sclock, RunningNode);
                    else if (sclock !== rclock)
                        logClockPreClock(sclock, rclock, RunningNode);
                }
                return node.value;
            }
        };
    };
    S.value = function value(current, eq) {
        var data = S.data(current), clock = RunningClock || RootClock, age = 0;
        return function value(update) {
            if (arguments.length === 0) {
                return data();
            }
            else {
                var same = eq ? eq(current, update) : current === update;
                if (!same) {
                    var time = clock.time();
                    if (age === time)
                        throw new Error("conflicting values: " + value + " is not the same as " + current);
                    age = time;
                    current = update;
                    data(update);
                }
                return update;
            }
        };
    };
    S.freeze = function freeze(fn) {
        var result = undefined;
        if (RunningClock) {
            result = fn();
        }
        else {
            RunningClock = RootClock;
            RunningClock.changes.reset();
            try {
                result = fn();
                event();
            }
            finally {
                RunningClock = null;
            }
        }
        return result;
    };
    S.sample = function sample(fn) {
        var result, running = RunningNode;
        if (running) {
            RunningNode = null;
            result = fn();
            RunningNode = running;
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
    S.subclock = function subclock(fn) {
        var clock = new Clock(RunningClock || RootClock);
        return fn ? subclock(fn) : subclock;
        function subclock(fn) {
            var result = null, running = RunningClock;
            RunningClock = clock;
            clock.state = STALE;
            try {
                result = fn();
                clock.subtime++;
                run(clock);
            }
            finally {
                RunningClock = running;
            }
            return result;
        }
    };
    // Internal implementation
    /// Graph classes and operations
    var Clock = (function () {
        function Clock(parent) {
            this.parent = parent;
            this.id = Clock.count++;
            this.state = CURRENT;
            this.subtime = 0;
            this.preclocks = null;
            this.changes = new Queue(); // batched changes to data nodes
            this.subclocks = new Queue(); // subclocks that need to be updated
            this.updates = new Queue(); // computations to update
            this.disposes = new Queue(); // disposals to run after current batch of updates finishes
            if (parent) {
                this.age = parent.time();
                this.depth = parent.depth + 1;
            }
            else {
                this.age = 0;
                this.depth = 0;
            }
        }
        Clock.prototype.time = function () {
            var time = this.subtime, p = this;
            while (p = p.parent)
                time += p.subtime;
            return time;
        };
        return Clock;
    }());
    Clock.count = 0;
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
            this.preclocks = null;
            this.owned = null;
            this.cleanups = null;
            this.age = this.clock.time();
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
    var NodePreClockLog = (function () {
        function NodePreClockLog() {
            this.count = 0;
            this.clocks = []; // [clock], where clock.parent === node.clock
            this.ages = []; // clock.id -> node.age
            this.ucount = 0; // number of ancestor clocks with preclocks from this node
            this.uclocks = [];
            this.uclockids = [];
        }
        return NodePreClockLog;
    }());
    var ClockPreClockLog = (function () {
        function ClockPreClockLog() {
            this.count = 0;
            this.clockcounts = []; // clock.id -> ref count
            this.clocks = []; // clock.id -> clock 
            this.ids = []; // [clock.id]
        }
        return ClockPreClockLog;
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
            var items = this.items;
            for (var i = 0; i < this.count; i++) {
                fn(items[i]);
                items[i] = null;
            }
            this.count = 0;
        };
        return Queue;
    }());
    // Constants
    var NOTPENDING = {}, CURRENT = 0, STALE = 1, RUNNING = 2;
    // "Globals" used to keep track of current system state
    var RootClock = new Clock(null), RunningClock = null, // currently running clock 
    RunningNode = null, // currently running computation
    Owner = null; // owner for new computations
    // Constants
    var REVIEWING = new ComputationNode(RootClock, null, null), DEAD = new ComputationNode(RootClock, null, null), UNOWNED = new ComputationNode(RootClock, null, null);
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
    function logNodePreClock(clock, to) {
        if (!to.preclocks)
            to.preclocks = new NodePreClockLog();
        else if (to.preclocks.ages[clock.id] === to.age)
            return;
        to.preclocks.ages[clock.id] = to.age;
        to.preclocks.clocks[to.preclocks.count++] = clock;
    }
    function logClockPreClock(sclock, rclock, rnode) {
        var clocklog = rclock.preclocks || (rclock.preclocks = new ClockPreClockLog()), nodelog = rnode.preclocks || (rnode.preclocks = new NodePreClockLog());
        if (nodelog.ages[sclock.id] === rnode.age)
            return;
        nodelog.ages[sclock.id] = rnode.age;
        nodelog.uclocks[nodelog.ucount] = rclock;
        nodelog.uclockids[nodelog.ucount++] = sclock.id;
        var clockcount = clocklog.clockcounts[sclock.id];
        if (!clockcount) {
            if (clockcount === undefined)
                clocklog.ids[clocklog.count++] = sclock.id;
            clocklog.clockcounts[sclock.id] = 1;
            clocklog.clocks[sclock.id] = sclock;
        }
        else {
            clocklog.clockcounts[sclock.id]++;
        }
    }
    function event() {
        RootClock.subtime++;
        try {
            run(RootClock);
        }
        finally {
            RunningClock = Owner = RunningNode = null;
        }
    }
    function toplevelComputation(node) {
        RunningClock = RootClock;
        RootClock.changes.reset();
        try {
            node.value = node.fn(node.value);
            if (RootClock.changes.count > 0 || RootClock.subclocks.count > 0 || RootClock.updates.count > 0) {
                RootClock.subtime++;
                run(RootClock);
            }
        }
        finally {
            RunningClock = Owner = RunningNode = null;
        }
    }
    function run(clock) {
        var running = RunningClock, count = 0;
        clock.disposes.reset();
        // for each batch ...
        while (clock.changes.count > 0 || clock.subclocks.count > 0 || clock.updates.count > 0) {
            if (count > 0)
                clock.subtime++;
            clock.changes.run(applyDataChange);
            clock.subclocks.run(updateClock);
            clock.updates.run(updateNode);
            clock.disposes.run(dispose);
            // if there are still changes after excessive batches, assume runaway            
            if (count++ > 1e5) {
                throw new Error("Runaway clock detected");
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
                var time = node.clock.time();
                if (node.age < time) {
                    node.age = time;
                    node.state = STALE;
                    node.clock.updates.add(node);
                    markClockStale(node.clock);
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
            child.age = child.clock.time();
            child.state = CURRENT;
            if (child.owned)
                markOwnedNodesForDisposal(child.owned);
        }
    }
    function markClockStale(clock) {
        var time = 0;
        if ((clock.parent && clock.age < (time = clock.parent.time())) || clock.state === CURRENT) {
            clock.state = STALE;
            if (clock.parent) {
                clock.age = time;
                clock.parent.subclocks.add(clock);
                markClockStale(clock.parent);
            }
        }
    }
    function updateClock(clock) {
        var time = clock.parent.time();
        if (clock.age < time || clock.state === STALE) {
            if (clock.age < time)
                clock.state = CURRENT;
            if (clock.preclocks) {
                for (var i = 0; i < clock.preclocks.ids.length; i++) {
                    var preclock = clock.preclocks.clocks[clock.preclocks.ids[i]];
                    if (preclock)
                        updateClock(preclock);
                }
            }
            clock.age = time;
        }
        if (clock.state === RUNNING) {
            throw new Error("clock circular reference");
        }
        else if (clock.state === STALE) {
            clock.state = RUNNING;
            run(clock);
            clock.state = CURRENT;
        }
    }
    function updateNode(node) {
        if (node.state === STALE) {
            var owner = Owner, running = RunningNode, clock = RunningClock;
            Owner = RunningNode = node;
            RunningClock = node.clock;
            node.state = RUNNING;
            cleanup(node, false);
            node.value = node.fn(node.value);
            node.state = CURRENT;
            Owner = owner;
            RunningNode = running;
            RunningClock = clock;
        }
    }
    function cleanup(node, final) {
        var sources = node.sources, cleanups = node.cleanups, owned = node.owned, preclocks = node.preclocks;
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
        if (preclocks) {
            for (i = 0; i < preclocks.count; i++) {
                preclocks.clocks[i] = null;
            }
            preclocks.count = 0;
            for (i = 0; i < preclocks.ucount; i++) {
                var upreclocks = preclocks.uclocks[i].preclocks, uclockid = preclocks.uclockids[i];
                if (--upreclocks.clockcounts[uclockid] === 0) {
                    upreclocks.clocks[uclockid] = null;
                }
            }
            preclocks.ucount = 0;
        }
    }
    function dispose(node) {
        node.fn = null;
        node.log = null;
        node.preclocks = null;
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
