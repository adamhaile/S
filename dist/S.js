/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // Public interface
    var S = function S(fn, seed) {
        var owner = Owner, proc = RunningProcess || TopProcess, running = RunningNode;
        if (!owner)
            throw new Error("all computations must be created under a parent computation or root");
        var node = new ComputationNode(proc, fn, seed);
        Owner = RunningNode = node;
        if (RunningProcess) {
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
                var rproc = RunningProcess, sproc = node.process;
                while (rproc.depth > sproc.depth + 1)
                    rproc = rproc.parent;
                if (rproc === sproc || rproc.parent === sproc) {
                    if (node.preprocs) {
                        for (var i = 0; i < node.preprocs.count; i++) {
                            var preproc = node.preprocs.procs[i];
                            updateProcess(preproc);
                        }
                    }
                    if (node.age === node.process.time()) {
                        if (node.state === RUNNING)
                            throw new Error("circular dependency");
                        else
                            update(node); // checks for state === STALE internally, so don't need to check here
                    }
                    if (node.preprocs) {
                        for (var i = 0; i < node.preprocs.count; i++) {
                            var preproc = node.preprocs.procs[i];
                            if (rproc === sproc)
                                logNodePreProcess(preproc, RunningNode);
                            else
                                logProcessPreProcess(preproc, rproc, RunningNode);
                        }
                    }
                }
                else {
                    if (rproc.depth > sproc.depth)
                        rproc = rproc.parent;
                    while (sproc.depth > rproc.depth + 1)
                        sproc = sproc.parent;
                    if (sproc.parent === rproc) {
                        logNodePreProcess(sproc, RunningNode);
                    }
                    else {
                        if (sproc.depth > rproc.depth)
                            sproc = sproc.parent;
                        while (rproc.parent !== sproc.parent)
                            rproc = rproc.parent, sproc = sproc.parent;
                        logProcessPreProcess(sproc, rproc, RunningNode);
                    }
                    updateProcess(sproc);
                }
                logComputationRead(node, RunningNode);
            }
            return node.value;
        };
    };
    S.root = function root(fn) {
        var owner = Owner, root = fn.length === 0 ? UNOWNED : new ComputationNode(RunningProcess || TopProcess, null, null), result = undefined;
        Owner = root;
        try {
            result = fn.length === 0 ? fn() : fn(function _dispose() {
                if (RunningProcess)
                    RunningProcess.disposes.add(root);
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
        var node = new DataNode(RunningProcess || TopProcess, value);
        return function data(value) {
            var rproc = RunningProcess, sproc = node.process;
            if (RunningProcess) {
                while (rproc.depth > sproc.depth)
                    rproc = rproc.parent;
                while (sproc.depth > rproc.depth && sproc.parent !== rproc)
                    sproc = sproc.parent;
                if (sproc.parent !== rproc)
                    while (rproc.parent !== sproc.parent)
                        rproc = rproc.parent, sproc = sproc.parent;
                if (rproc !== sproc) {
                    updateProcess(sproc);
                }
            }
            var cproc = rproc === sproc ? sproc : sproc.parent;
            if (arguments.length > 0) {
                if (RunningProcess) {
                    if (node.pending !== NOTPENDING) {
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    }
                    else {
                        node.pending = value;
                        cproc.changes.add(node);
                        markProcessStale(cproc);
                    }
                }
                else {
                    if (node.log) {
                        node.pending = value;
                        TopProcess.changes.add(node);
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
                    if (sproc.parent === rproc)
                        logNodePreProcess(sproc, RunningNode);
                    else if (sproc !== rproc)
                        logProcessPreProcess(sproc, rproc, RunningNode);
                }
                return node.value;
            }
        };
    };
    S.value = function value(current, eq) {
        var data = S.data(current), proc = RunningProcess || TopProcess, age = 0;
        return function value(update) {
            if (arguments.length === 0) {
                return data();
            }
            else {
                var same = eq ? eq(current, update) : current === update;
                if (!same) {
                    var time = proc.time();
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
        if (RunningProcess) {
            result = fn();
        }
        else {
            RunningProcess = TopProcess;
            RunningProcess.changes.reset();
            try {
                result = fn();
                event();
            }
            finally {
                RunningProcess = null;
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
    S.process = function process() {
        var proc = new Process(RunningProcess || TopProcess);
        return function process(fn) {
            var result = null, running = RunningProcess;
            RunningProcess = proc;
            proc.state = STALE;
            try {
                result = fn();
                run(proc);
            }
            finally {
                RunningProcess = running;
            }
            return result;
        };
    };
    // Internal implementation
    /// Graph classes and operations
    var Process = (function () {
        function Process(parent) {
            this.parent = parent;
            this.id = Process.count++;
            this.state = CURRENT;
            this.proctime = 0;
            this.preprocs = null;
            this.changes = new Queue(); // batched changes to data nodes
            this.subprocs = new Queue(); // subprocesses that need to be updated
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
        Process.prototype.time = function () {
            var time = this.proctime, p = this;
            while (p = p.parent)
                time += p.proctime;
            return time;
        };
        return Process;
    }());
    Process.count = 0;
    var DataNode = (function () {
        function DataNode(process, value) {
            this.process = process;
            this.value = value;
            this.pending = NOTPENDING;
            this.log = null;
        }
        return DataNode;
    }());
    var ComputationNode = (function () {
        function ComputationNode(process, fn, value) {
            this.process = process;
            this.fn = fn;
            this.value = value;
            this.id = ComputationNode.count++;
            this.state = CURRENT;
            this.count = 0;
            this.sources = [];
            this.log = null;
            this.preprocs = null;
            this.owned = null;
            this.cleanups = null;
            this.age = this.process.time();
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
    var NodePreProcessLog = (function () {
        function NodePreProcessLog() {
            this.count = 0;
            this.procs = []; // [proc], where proc.parent === node.process
            this.ages = []; // proc.id -> node.age
            this.ucount = 0;
            this.uprocs = [];
            this.uprocids = [];
        }
        return NodePreProcessLog;
    }());
    var ProcessPreProcessLog = (function () {
        function ProcessPreProcessLog() {
            this.count = 0;
            this.proccounts = []; // proc.id -> ref count
            this.procs = []; // proc.id -> proc 
            this.ids = []; // [proc.id]
        }
        return ProcessPreProcessLog;
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
    var TopProcess = new Process(null), RunningProcess = null, // currently running process 
    RunningNode = null, // currently running computation
    Owner = null; // owner for new computations
    // Constants
    var REVIEWING = new ComputationNode(TopProcess, null, null), DEAD = new ComputationNode(TopProcess, null, null), UNOWNED = new ComputationNode(TopProcess, null, null);
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
    function logNodePreProcess(proc, to) {
        if (!to.preprocs)
            to.preprocs = new NodePreProcessLog();
        else if (to.preprocs.ages[proc.id] === to.age)
            return;
        to.preprocs.ages[proc.id] = to.age;
        to.preprocs.procs[to.preprocs.count++] = proc;
    }
    function logProcessPreProcess(sproc, rproc, rnode) {
        var proclog = rproc.preprocs || (rproc.preprocs = new ProcessPreProcessLog()), nodelog = rnode.preprocs || (rnode.preprocs = new NodePreProcessLog());
        if (nodelog.ages[sproc.id] === rnode.age)
            return;
        nodelog.ages[sproc.id] = rnode.age;
        nodelog.uprocs[nodelog.ucount] = rproc;
        nodelog.uprocids[nodelog.ucount++] = sproc.id;
        var proccount = proclog.proccounts[sproc.id];
        if (!proccount) {
            if (proccount === undefined)
                proclog.ids[proclog.count++] = sproc.id;
            proclog.proccounts[sproc.id] = 1;
            proclog.procs[sproc.id] = sproc;
        }
        else {
            proclog.proccounts[sproc.id]++;
        }
    }
    function event() {
        try {
            run(TopProcess);
        }
        finally {
            RunningProcess = Owner = RunningNode = null;
        }
    }
    function toplevelComputation(node) {
        RunningProcess = TopProcess;
        TopProcess.changes.reset();
        try {
            node.value = node.fn(node.value);
            if (TopProcess.changes.count > 0)
                run(TopProcess);
        }
        finally {
            RunningProcess = Owner = RunningNode = null;
        }
    }
    function run(proc) {
        var running = RunningProcess, count = 0;
        proc.disposes.reset();
        // for each batch ...
        while (proc.changes.count || proc.subprocs.count || proc.updates.count) {
            proc.proctime++;
            proc.changes.run(applyDataChange);
            proc.subprocs.run(updateProcess);
            proc.updates.run(update);
            proc.disposes.run(dispose);
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
                var time = node.process.time();
                if (node.age < time) {
                    node.age = time;
                    node.state = STALE;
                    node.process.updates.add(node);
                    markProcessStale(node.process);
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
            child.age = child.process.time();
            child.state = CURRENT;
            if (child.owned)
                markOwnedNodesForDisposal(child.owned);
        }
    }
    function markProcessStale(proc) {
        var time = 0;
        if ((proc.parent && proc.age < (time = proc.parent.time())) || proc.state === CURRENT) {
            proc.state = STALE;
            if (proc.parent) {
                proc.age = time;
                proc.parent.subprocs.add(proc);
                markProcessStale(proc.parent);
            }
        }
    }
    function updateProcess(proc) {
        var time = proc.parent.time();
        if (proc.age < time || proc.state === STALE) {
            if (proc.age < time)
                proc.state = CURRENT;
            if (proc.preprocs) {
                for (var i = 0; i < proc.preprocs.ids.length; i++) {
                    var preproc = proc.preprocs.procs[proc.preprocs.ids[i]];
                    if (preproc)
                        updateProcess(preproc);
                }
            }
            proc.age = time;
        }
        if (proc.state === RUNNING) {
            throw new Error("process circular reference");
        }
        else if (proc.state === STALE) {
            proc.state = RUNNING;
            run(proc);
            proc.state = CURRENT;
        }
    }
    function update(node) {
        if (node.state === STALE) {
            var owner = Owner, running = RunningNode, proc = RunningProcess;
            Owner = RunningNode = node;
            RunningProcess = node.process;
            node.state = RUNNING;
            cleanup(node, false);
            node.value = node.fn(node.value);
            node.state = CURRENT;
            Owner = owner;
            RunningNode = running;
            RunningProcess = proc;
        }
    }
    function cleanup(node, final) {
        var sources = node.sources, cleanups = node.cleanups, owned = node.owned, preprocs = node.preprocs;
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
        if (preprocs) {
            for (i = 0; i < preprocs.count; i++) {
                preprocs.procs[i] = null;
            }
            preprocs.count = 0;
            for (i = 0; i < preprocs.ucount; i++) {
                var upreprocs = preprocs.uprocs[i].preprocs, uprocid = preprocs.uprocids[i];
                if (--upreprocs.proccounts[uprocid] === 0) {
                    upreprocs.procs[uprocid] = null;
                }
            }
            preprocs.ucount = 0;
        }
    }
    function dispose(node) {
        node.fn = null;
        node.log = null;
        node.preprocs = null;
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
