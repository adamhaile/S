/// <reference path="../S.d.ts" />

declare var module : { exports : {} };
declare var define : (deps: string[], fn: () => S) => void;

(function () {
    "use strict";
    
    // Public interface
    var S = <S>function S<T>(fn : (v? : T) => T, seed? : T) : () => T {
        var owner  = Owner,
            proc  = RunningProcess || TopProcess,
            running = RunningNode;

        if (!owner) throw new Error("all computations must be created under a parent computation or root");

        var node = new ComputationNode(proc, fn, seed);
            
        Owner = RunningNode = node;
        
        if (RunningProcess) {
            node.value = node.fn!(node.value);
        } else {
            toplevelComputation(node);
        }
        
        if (owner !== UNOWNED) (owner.owned || (owner.owned = [])).push(node);
        
        Owner = owner;
        RunningNode = running;

        return function computation() {
            if (RunningNode) {
                var rproc = RunningProcess!,
                    sproc = node.process;

                while (rproc.depth > sproc.depth + 1) rproc = rproc.parent!;

                if (rproc === sproc || rproc.parent === sproc) {
                    if (node.preprocs) {
                        for (var i = 0; i < node.preprocs.count; i++) {
                            var preproc = node.preprocs.procs[i];
                            updateProcess(preproc);
                        }
                    }

                    if (node.age === node.process.time()) {
                        if (node.state === RUNNING) throw new Error("circular dependency");
                        else update(node); // checks for state === STALE internally, so don't need to check here
                    }

                    if (node.preprocs) {
                        for (var i = 0; i < node.preprocs.count; i++) {
                            var preproc = node.preprocs.procs[i];
                            if (rproc === sproc) logNodePreProcess(preproc, RunningNode);
                            else logProcessPreProcess(preproc, rproc, RunningNode);
                        }
                    }
                } else {
                    if (rproc.depth > sproc.depth) rproc = rproc.parent!;

                    while (sproc.depth > rproc.depth + 1) sproc = sproc.parent!;

                    if (sproc.parent === rproc) {
                        logNodePreProcess(sproc, RunningNode);
                    } else {
                        if (sproc.depth > rproc.depth) sproc = sproc.parent!;
                        while (rproc.parent !== sproc.parent) rproc = rproc.parent!, sproc = sproc.parent!;
                        logProcessPreProcess(sproc, rproc, RunningNode);
                    }

                    updateProcess(sproc);
                }

                logComputationRead(node, RunningNode);
            }

            return node.value;
        }
    };

    S.root = function root<T>(fn : (dispose? : () => void) => T) : T {
        var owner = Owner,
            root = fn.length === 0 ? UNOWNED : new ComputationNode(RunningProcess || TopProcess, null, null),
            result : T = undefined!;

        Owner = root;

        try {
            result = fn.length === 0 ? fn() : fn(function _dispose() {
                if (RunningProcess) RunningProcess.disposes.add(root);
                else dispose(root);
            });
        } finally {
            Owner = owner;
        }

        return result;
    };

    S.on = function on<T>(ev : () => any, fn : (v? : T) => T, seed? : T, onchanges? : boolean) {
        if (Array.isArray(ev)) ev = callAll(ev);
        onchanges = !!onchanges;

        return S(on, seed);
        
        function on(value : T) {
            var running = RunningNode;
            ev(); 
            if (onchanges) onchanges = false;
            else {
                RunningNode = null;
                value = fn(value);
                RunningNode = running;
            } 
            return value;
        }
    };

    function callAll(ss : (() => any)[]) {
        return function all() {
            for (var i = 0; i < ss.length; i++) ss[i]();
        }
    }

    S.data = function data<T>(value : T) : (value? : T) => T {
        var node = new DataNode(RunningProcess || TopProcess, value);

        return function data(value? : T) : T {
            var rproc = RunningProcess!,
                sproc = node.process;

            if (RunningProcess) {
                while (rproc.depth > sproc.depth) rproc = rproc.parent!;
                while (sproc.depth > rproc.depth && sproc.parent !== rproc) sproc = sproc.parent!;
                if (sproc.parent !== rproc)
                    while (rproc.parent !== sproc.parent) rproc = rproc.parent!, sproc = sproc.parent!;

                if (rproc !== sproc) {
                    updateProcess(sproc);
                }
            }

            var cproc = rproc === sproc ? sproc! : sproc.parent!;

            if (arguments.length > 0) {
                if (RunningProcess) {
                    if (node.pending !== NOTPENDING) { // value has already been set once, check for conflicts
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    } else { // add to list of changes
                        node.pending = value;
                        cproc.changes.add(node);
                        markProcessStale(cproc);
                    }
                } else { // not batching, respond to change now
                    if (node.log) {
                        node.pending = value;
                        TopProcess.changes.add(node);
                        event();
                    } else {
                        node.value = value;
                    }
                }
                return value!;
            } else {
                if (RunningNode) {
                    logDataRead(node, RunningNode);
                    if (sproc.parent === rproc) logNodePreProcess(sproc, RunningNode);
                    else if (sproc !== rproc) logProcessPreProcess(sproc, rproc, RunningNode);
                }
                return node.value;
            }
        }
    };
    
    S.value = function value<T>(current : T, eq? : (a : T, b : T) => boolean) : S.DataSignal<T> {
        var data = S.data(current),
            proc = RunningProcess || TopProcess,
            age = 0;
        return function value(update? : T) {
            if (arguments.length === 0) {
                return data();
            } else {
                var same = eq ? eq(current, update!) : current === update;
                if (!same) {
                    var time = proc.time();
                    if (age === time) 
                        throw new Error("conflicting values: " + value + " is not the same as " + current);
                    age = time;
                    current = update!;
                    data(update!);
                }
                return update!;
            }
        }
    };

    S.freeze = function freeze<T>(fn : () => T) : T {
        var result : T = undefined!;
        
        if (RunningProcess) {
            result = fn();
        } else {
            RunningProcess = TopProcess;
            RunningProcess.changes.reset();

            try {
                result = fn();
                event();
            } finally {
                RunningProcess = null;
            }
        }
            
        return result;
    };
    
    S.sample = function sample<T>(fn : () => T) : T {
        var result : T,
            running = RunningNode;
        
        if (running) {
            RunningNode = null;
            result = fn();
            RunningNode = running;
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

    S.process = function process<T>(fn? : () => T) {
        var proc = new Process(RunningProcess || TopProcess);

        return fn ? process(fn) : process;
        
        function process<T>(fn : () => T) {
            var result : T = null!,
                running = RunningProcess;
            RunningProcess = proc;
            proc.state = STALE;
            try {
                result = fn();
                proc.proctime++;
                run(proc);
            } finally {
                RunningProcess = running;
            }
            return result;
        }
    }
    
    // Internal implementation
    
    /// Graph classes and operations
    class Process {
        static count = 0;

        id        = Process.count++;
        depth     : number;
        age       : number;
        state     = CURRENT;
        proctime  = 0;

        preprocs  = null as ProcessPreProcessLog | null;
        changes   = new Queue<DataNode>(); // batched changes to data nodes
        subprocs  = new Queue<Process>(); // subprocesses that need to be updated
        updates   = new Queue<ComputationNode>(); // computations to update
        disposes  = new Queue<ComputationNode>(); // disposals to run after current batch of updates finishes

        constructor(
            public parent : Process | null
        ) { 
            if (parent) {
                this.age = parent.time();
                this.depth = parent.depth + 1;
            } else {
                this.age = 0;
                this.depth = 0;
            }
        }

        time () {
            var time = this.proctime,
                p = this as Process;
            while (p = p.parent!) time += p.proctime;
            return time;
        }
    }

    class DataNode {
        pending = NOTPENDING as any;   
        log     = null as Log | null;
        
        constructor(
            public process : Process,
            public value : any
        ) { }
    }
    
    class ComputationNode {
        static count = 0;
        
        id       = ComputationNode.count++;
        age      : number;
        state    = CURRENT;
        count    = 0;
        sources  = [] as Log[];
        log      = null as Log | null;
        preprocs = null as NodePreProcessLog | null;
        owned    = null as ComputationNode[] | null;
        cleanups = null as (((final : boolean) => void)[]) | null;
        
        constructor(
            public process : Process,
            public fn    : ((v : any) => any) | null,
            public value : any
        ) { 
            this.age = this.process.time();
        }
    }
    
    class Log {
        count = 0;
        nodes = [] as ComputationNode[];
        ids = [] as number[];
    }

    class NodePreProcessLog {
        count = 0;
        procs = [] as Process[]; // [proc], where proc.parent === node.process
        ages = [] as number[]; // proc.id -> node.age
        ucount = 0;
        uprocs = [] as Process[];
        uprocids = [] as number[];
    }

    class ProcessPreProcessLog {
        count = 0;
        proccounts = [] as number[]; // proc.id -> ref count
        procs = [] as (Process | null)[]; // proc.id -> proc 
        ids = [] as number[]; // [proc.id]
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
            var items = this.items;
            for (var i = 0; i < this.count; i++) {
                fn(items[i]!);
                items[i] = null!;
            }
            this.count = 0;
        }
    }
    
    // Constants
    var NOTPENDING = {},
        CURRENT    = 0,
        STALE      = 1,
        RUNNING    = 2;
    
    // "Globals" used to keep track of current system state
    var TopProcess     = new Process(null),
        RunningProcess = null as Process | null, // currently running process 
        RunningNode    = null as ComputationNode | null, // currently running computation
        Owner          = null as ComputationNode | null; // owner for new computations

    // Constants
    var REVIEWING  = new ComputationNode(TopProcess, null, null),
        DEAD       = new ComputationNode(TopProcess, null, null),
        UNOWNED    = new ComputationNode(TopProcess, null, null);
    
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

    function logNodePreProcess(proc : Process, to : ComputationNode) {
        if (!to.preprocs) to.preprocs = new NodePreProcessLog();
        else if (to.preprocs.ages[proc.id] === to.age) return;
        to.preprocs.ages[proc.id] = to.age;
        to.preprocs.procs[to.preprocs.count++] = proc;
    }
    
    function logProcessPreProcess(sproc : Process, rproc : Process, rnode : ComputationNode) {
        var proclog = rproc.preprocs || (rproc.preprocs = new ProcessPreProcessLog()),
            nodelog = rnode.preprocs || (rnode.preprocs = new NodePreProcessLog());

        if (nodelog.ages[sproc.id] === rnode.age) return;

        nodelog.ages[sproc.id] = rnode.age;
        nodelog.uprocs[nodelog.ucount] = rproc;
        nodelog.uprocids[nodelog.ucount++] = sproc.id;

        var proccount = proclog.proccounts[sproc.id];
        if (!proccount) {
            if (proccount === undefined) proclog.ids[proclog.count++] = sproc.id;
            proclog.proccounts[sproc.id] = 1;
            proclog.procs[sproc.id] = sproc;
        } else {
            proclog.proccounts[sproc.id]++;
        }
    }
    
    function event() {
        TopProcess.proctime++;
        try {
            run(TopProcess);
        } finally {
            RunningProcess = Owner = RunningNode = null;
        }
    }
    
    function toplevelComputation<T>(node : ComputationNode) {
        RunningProcess = TopProcess;
        TopProcess.changes.reset();

        try {
            node.value = node.fn!(node.value);
    
            if (TopProcess.changes.count > 0 || TopProcess.subprocs.count > 0 || TopProcess.updates.count > 0) {
                TopProcess.proctime++;
                run(TopProcess);
            }
        } finally {
            RunningProcess = Owner = RunningNode = null;
        }
    }
        
    function run(proc : Process) {
        var running = RunningProcess,
            count = 0;
            
        proc.disposes.reset();
        
        // for each batch ...
        while (proc.changes.count > 0 || proc.subprocs.count > 0 || proc.updates.count > 0) {
            if (count > 0) // don't tick on first run, or else we expire already scheduled updates
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
                var time = node.process.time();
                if (node.age < time) {
                    node.age = time;
                    node.state = STALE;
                    node.process.updates.add(node);
                    markProcessStale(node.process);
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
            child.age = child.process.time();
            child.state = CURRENT;
            if (child.owned) markOwnedNodesForDisposal(child.owned);
        }
    }

    function markProcessStale(proc : Process) {
        var time = 0;
        if ((proc.parent && proc.age < (time = proc.parent!.time())) || proc.state === CURRENT) {
            proc.state = STALE;
            if (proc.parent) {
                proc.age = time;
                proc.parent.subprocs.add(proc);
                markProcessStale(proc.parent);
            }
        }
    }
    
    function updateProcess(proc : Process) {
        var time = proc.parent!.time();
        if (proc.age < time || proc.state === STALE) {
            if (proc.age < time) proc.state = CURRENT;
            if (proc.preprocs) {
                for (var i = 0; i < proc.preprocs.ids.length; i++) {
                    var preproc = proc.preprocs.procs[proc.preprocs.ids[i]];
                    if (preproc) updateProcess(preproc);
                }
            }
            proc.age = time;
        }

        if (proc.state === RUNNING) {
            throw new Error("process circular reference");
        } else if (proc.state === STALE) {
            proc.state = RUNNING;
            run(proc);
            proc.state = CURRENT;
        }
    }

    function update<T>(node : ComputationNode) {
        if (node.state === STALE) {
            var owner = Owner,
                running = RunningNode,
                proc = RunningProcess;
        
            Owner = RunningNode = node;
            RunningProcess = node.process;
        
            node.state = RUNNING;    
            cleanup(node, false);
            node.value = node.fn!(node.value);
            node.state = CURRENT;
            
            Owner = owner;
            RunningNode = running;
            RunningProcess = proc;
        }
    }
        
    function cleanup(node : ComputationNode, final : boolean) {
        var sources = node.sources,
            cleanups = node.cleanups,
            owned = node.owned,
            preprocs = node.preprocs;
            
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
            sources[i]!.nodes[node.id] = REVIEWING;
            sources[i] = null!;
        }
        node.count = 0;

        if (preprocs) {
            for (i = 0; i < preprocs.count; i++) {
                preprocs.procs[i] = null!;
            }
            preprocs.count = 0;

            for (i = 0; i < preprocs.ucount; i++) {
                var upreprocs = preprocs.uprocs[i].preprocs!,
                    uprocid = preprocs.uprocids[i];
                if (--upreprocs.proccounts[uprocid] === 0) {
                    upreprocs.procs[uprocid] = null;
                }
            }
            preprocs.ucount = 0;
        }
    }
        
    function dispose(node : ComputationNode) {
        node.fn       = null;
        node.log      = null;
        node.preprocs = null;
        
        cleanup(node, true);
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