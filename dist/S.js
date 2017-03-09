/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // Public interface
    var S = function S(fn, value) {
        var owner = Owner, clock = RunningClock || RootClock, running = RunningNode;
        if (!owner)
            throw new Error("all computations must be created under a parent computation or root");
        var node = newComputationNode(clock, fn, value);
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
            if (node.fn !== fn)
                return value;
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
            return value = node.value;
        };
    };
    S.root = function root(fn) {
        var owner = Owner, root = fn.length === 0 ? UNOWNED : newComputationNode(RunningClock || RootClock, null, null), result = undefined;
        Owner = root;
        try {
            result = fn.length === 0 ? fn() : fn(function _dispose() {
                if (RunningClock) {
                    markClockStale(root.clock);
                    root.clock.disposes.add(root);
                }
                else {
                    dispose(root);
                }
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
                        markClockStale(cclock);
                        node.pending = value;
                        cclock.changes.add(node);
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
            this.state = CURRENT;
            this.count = 0;
            this.sources = [];
            this.sourceslots = [];
            this.log = null;
            this.preclocks = null;
            this.owned = null;
            this.cleanups = null;
            this.age = this.clock.time();
        }
        return ComputationNode;
    }());
    var Log = (function () {
        function Log() {
            this.count = 0;
            this.nodes = [];
            this.nodeslots = [];
            this.freecount = 0;
            this.freeslots = [];
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
    // object pools
    var ComputationNodePool = [], LogPool = [];
    // Constants
    var UNOWNED = newComputationNode(RootClock, null, null);
    // Functions
    function logRead(from, to) {
        var fromslot = from.freecount ? from.freeslots[--from.freecount] : from.count++, toslot = to.count++;
        from.nodes[fromslot] = to;
        from.nodeslots[fromslot] = toslot;
        to.sources[toslot] = from;
        to.sourceslots[toslot] = fromslot;
    }
    function logDataRead(data, to) {
        if (!data.log)
            data.log = newLog();
        logRead(data.log, to);
    }
    function logComputationRead(node, to) {
        if (!node.log)
            node.log = newLog();
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
        RootClock.subclocks.reset();
        RootClock.updates.reset();
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
        RootClock.subclocks.reset();
        RootClock.updates.reset();
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
        RunningClock = clock;
        clock.disposes.reset();
        // for each batch ...
        while (clock.changes.count !== 0 || clock.subclocks.count !== 0 || clock.updates.count !== 0 || clock.disposes.count !== 0) {
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
        RunningClock = running;
    }
    function applyDataChange(data) {
        data.value = data.pending;
        data.pending = NOTPENDING;
        if (data.log)
            markComputationsStale(data.log);
    }
    function markComputationsStale(log) {
        var nodes = log.nodes, nodeslots = log.nodeslots, dead = 0, slot, nodeslot;
        // mark all downstream nodes stale which haven't been already, compacting log.nodes as we go
        for (var i = 0; i < log.count; i++) {
            var node = nodes[i];
            if (node) {
                var time = node.clock.time();
                if (node.age < time) {
                    markClockStale(node.clock);
                    node.age = time;
                    node.state = STALE;
                    node.clock.updates.add(node);
                    if (node.owned)
                        markOwnedNodesForDisposal(node.owned);
                    if (node.log)
                        markComputationsStale(node.log);
                }
                if (dead) {
                    slot = i - dead;
                    nodeslot = nodeslots[i];
                    nodes[i] = null;
                    nodes[slot] = node;
                    nodeslots[slot] = nodeslot;
                    node.sourceslots[nodeslot] = slot;
                }
            }
            else {
                dead++;
            }
        }
        log.count -= dead;
        log.freecount = 0;
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
            if (clock.parent) {
                clock.age = time;
                markClockStale(clock.parent);
                clock.parent.subclocks.add(clock);
            }
            clock.changes.reset();
            clock.subclocks.reset();
            clock.updates.reset();
            clock.state = STALE;
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
        var sources = node.sources, sourceslots = node.sourceslots, cleanups = node.cleanups, owned = node.owned, preclocks = node.preclocks, i, source, slot;
        if (cleanups) {
            for (i = 0; i < cleanups.length; i++) {
                cleanups[i](final);
            }
            node.cleanups = null;
        }
        if (owned) {
            for (i = 0; i < owned.length; i++) {
                dispose(owned[i]);
            }
            node.owned = null;
        }
        for (i = 0; i < node.count; i++) {
            source = sources[i];
            slot = sourceslots[i];
            source.nodes[slot] = null;
            source.freeslots[source.freecount++] = slot;
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
        var log = node.log;
        node.clock = null;
        node.fn = null;
        node.preclocks = null;
        if (log) {
            node.log = null;
            for (var i = 0; i < log.count; i++) {
                log.nodes[i] = null;
            }
            LogPool.push(log);
        }
        cleanup(node, true);
        ComputationNodePool.push(node);
    }
    function newComputationNode(clock, fn, value) {
        var node;
        if (ComputationNodePool.length === 0) {
            node = new ComputationNode(clock, fn, value);
        }
        else {
            node = ComputationNodePool.pop();
            node.age = clock.time();
            node.state = CURRENT;
            node.clock = clock;
            node.fn = fn;
            node.value = value;
        }
        return node;
    }
    function newLog() {
        var log;
        if (LogPool.length === 0) {
            log = new Log();
        }
        else {
            log = LogPool.pop();
            log.count = 0;
            log.freecount = 0;
        }
        return log;
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
