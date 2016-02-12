/// <reference path="../S.d.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
(function () {
    "use strict";
    // "Globals" used to keep track of current system state
    var Time = 1, // our clock, ticks every update
    Batching = 0, // whether we're batching data changes, 0 = no, 1+ = yes, with index to next Batch slot
    Batch = [], // batched changes to data nodes
    Updating = null, // whether we're updating, null = no, non-null = node being updated
    Sampling = false, // whether we're sampling signals, with no dependencies
    Disposing = false, // whether we're disposing
    Disposes = []; // disposals to run after current batch of changes finishes 
    var S = function S(fn, seed, state) {
        var options = (this instanceof Builder ? this.options : null), parent = Updating, sampling = Sampling, gate = (options && options.async && Gate(options.async)) || (parent && parent.gate) || null, node = new ComputationNode(fn, gate);
        fn = arguments.length === 1 ? fn :
            arguments.length === 2 ? reducer(fn, seed) :
                reducer2(fn, seed, state);
        if (parent && (!options || !options.toplevel)) {
            (parent.children || (parent.children = [])).push(node);
        }
        Updating = node;
        Sampling = false;
        if (Batching) {
            node.value = fn();
        }
        else {
            node.value = initialExecution(node, fn);
        }
        Updating = parent;
        Sampling = sampling;
        return function computation() {
            if (Disposing) {
                if (Batching)
                    Disposes.push(node);
                else
                    node.dispose();
            }
            else if (Updating && node.fn) {
                if (node.receiver && node.receiver.marks !== 0 && node.receiver.age === Time) {
                    backtrack(node.receiver);
                }
                if (!Sampling) {
                    if (!node.emitter)
                        node.emitter = new Emitter(node);
                    addEdge(node.emitter, Updating);
                }
            }
            return node.value;
        };
    };
    function initialExecution(node, fn) {
        var result;
        Time++;
        Batching = 1;
        try {
            result = fn();
            if (Batching > 1)
                resolve(null);
        }
        finally {
            Updating = null;
            Sampling = false;
            Batching = 0;
        }
        return result;
    }
    S.on = function on(ev, fn, seed, state) {
        var builder = (this instanceof Builder ? this : null), first = true, signal = typeof ev === 'function' ? ev : multi;
        fn = arguments.length === 1 ? fn :
            arguments.length === 2 ? reducer(fn, seed) :
                reducer2(fn, seed, state);
        return builder ? builder.S(on) : S(on);
        function on() {
            var result = seed;
            signal();
            if (first)
                first = false;
            else {
                Sampling = true;
                result = fn();
                Sampling = false;
            }
            return result;
        }
        function multi() { for (var i = 0; i < ev.length; i++)
            ev[i](); }
    };
    function reducer(fn, seed) {
        return function reduce() {
            return seed = fn(seed);
        };
    }
    function reducer2(fn, seed, state) {
        return function reduce2() {
            return seed = fn(seed, state);
        };
    }
    S.data = function data(value) {
        var node = new DataNode(value);
        return function data(value) {
            if (arguments.length > 0) {
                if (Batching) {
                    if (node.age === Time) {
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    }
                    else {
                        node.age = Time;
                        node.pending = value;
                        Batch[Batching++] = node;
                    }
                }
                else {
                    node.age = Time;
                    node.value = value;
                    if (node.emitter)
                        handleEvent(node);
                }
                return value;
            }
            else {
                if (Updating && !Sampling) {
                    if (!node.emitter)
                        node.emitter = new Emitter(null);
                    addEdge(node.emitter, Updating);
                }
                return node.value;
            }
        };
    };
    S.sum = function sum(value) {
        var node = new DataNode(value);
        return function sum(update) {
            if (arguments.length > 0) {
                if (Batching) {
                    if (node.age === Time) {
                        node.pending = update(node.pending);
                    }
                    else {
                        node.age = Time;
                        node.pending = update(node.value);
                        Batch[Batching++] = node;
                    }
                }
                else {
                    node.age = Time;
                    node.value = update(node.value);
                    if (node.emitter)
                        handleEvent(node);
                }
                return value;
            }
            else {
                if (Updating && !Sampling) {
                    if (!node.emitter)
                        node.emitter = new Emitter(null);
                    addEdge(node.emitter, Updating);
                }
                return node.value;
            }
        };
    };
    /// Options
    var Options = (function () {
        function Options() {
            this.toplevel = false;
            this.async = null;
        }
        return Options;
    })();
    var Builder = (function () {
        function Builder(options) {
            this.options = options;
        }
        return Builder;
    })();
    Builder.prototype.S = S;
    Builder.prototype.on = S.on;
    var AsyncOption = (function (_super) {
        __extends(AsyncOption, _super);
        function AsyncOption() {
            _super.apply(this, arguments);
        }
        AsyncOption.prototype.async = function (fn) {
            this.options.async = fn;
            return new Builder(this.options);
        };
        return AsyncOption;
    })(Builder);
    S.toplevel = function toplevel() {
        var options = new Options();
        options.toplevel = true;
        return new AsyncOption(options);
    };
    S.async = function async(fn) {
        return new AsyncOption(new Options()).async(fn);
    };
    function Gate(scheduler) {
        var root = new DataNode(null), scheduled = false, gotime = 0, tick;
        root.emitter = new Emitter(null);
        return function gate(node) {
            if (gotime === Time)
                return true;
            if (typeof tick === 'function')
                tick();
            else if (!scheduled) {
                scheduled = true;
                tick = scheduler(go);
            }
            addEdge(root.emitter, node);
            return false;
        };
        function go() {
            if (gotime === Time)
                return;
            scheduled = false;
            gotime = Time + 1;
            if (Batching) {
                Batch[Batching++] = root;
            }
            else {
                handleEvent(root);
            }
        }
    }
    ;
    S.event = function event(fn) {
        var result;
        if (Batching) {
            result = fn();
        }
        else {
            Batching = 1;
            try {
                result = fn();
                handleEvent(null);
            }
            finally {
                Batching = 0;
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
    function handleEvent(change) {
        try {
            resolve(change);
        }
        finally {
            Batching = 0;
            Updating = null;
            Sampling = false;
            Disposing = false;
        }
    }
    var _batch = [];
    function resolve(change) {
        var count = 0, batch, i, len;
        if (!Batching)
            Batching = 1;
        if (change) {
            Time++;
            prepare(change.emitter);
            notify(change.emitter);
            i = -1, len = Disposes.length;
            if (len) {
                while (++i < len)
                    Disposes[i].dispose();
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
                if (change.emitter)
                    prepare(change.emitter);
            }
            // run all updates in batch
            i = 0;
            while (++i < len) {
                change = batch[i];
                if (change.emitter)
                    notify(change.emitter);
                batch[i] = null;
            }
            // run disposes accumulated while updating
            i = -1, len = Disposes.length;
            if (len) {
                while (++i < len)
                    Disposes[i].dispose();
                Disposes = [];
            }
            // if there are still changes after excessive batches, assume runaway            
            if (count++ > 1e5) {
                throw new Error("Runaway frames detected");
            }
        }
    }
    /// mark the node and all downstream nodes as within the range to be updated
    function prepare(emitter) {
        var edges = emitter.edges, i = -1, len = edges.length, edge, to, node, toEmitter;
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
                    if (toEmitter)
                        toEmitter.emitting = false;
                }
                // if we've come back to an emitting Emitter, that's a cycle
                if (toEmitter && toEmitter.emitting)
                    throw new Error("circular dependency"); // TODO: more helpful reporting
                edge.marked = true;
                to.marks++;
                to.age = Time;
                // if this is the first time to's been marked, then prepare children propagate
                if (to.marks === 1) {
                    if (node.children)
                        prepareChildren(node.children);
                    if (toEmitter)
                        prepare(toEmitter);
                }
            }
        }
        emitter.emitting = false;
    }
    function prepareChildren(children) {
        var i = -1, len = children.length, child;
        while (++i < len) {
            child = children[i];
            child.fn = null;
            if (child.children)
                prepareChildren(child.children);
        }
    }
    function notify(emitter) {
        var i = -1, len = emitter.edges.length, edge, to;
        while (++i < len) {
            edge = emitter.edges[i];
            if (edge && edge.marked) {
                to = edge.to;
                edge.marked = false;
                to.marks--;
                if (to.marks === 0) {
                    update(to.node);
                }
            }
        }
        if (emitter.fragmented())
            emitter.compact();
    }
    /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
    function update(node) {
        var emitter = node.emitter, receiver = node.receiver, disposing = node.fn === null, i, len, edge, to;
        Updating = node;
        disposeChildren(node);
        node.cleanup(disposing);
        if (!disposing)
            node.value = node.fn();
        if (emitter) {
            // this is the content of notify(emitter), inserted to shorten call stack for ergonomics
            i = -1, len = emitter.edges.length;
            while (++i < len) {
                edge = emitter.edges[i];
                if (edge && edge.marked) {
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
            }
            else if (emitter.fragmented())
                emitter.compact();
        }
        if (receiver) {
            if (disposing) {
                receiver.detach();
            }
            else {
                i = -1, len = receiver.edges.length;
                while (++i < len) {
                    edge = receiver.edges[i];
                    if (edge.active && edge.age < Time) {
                        edge.deactivate();
                    }
                }
                if (receiver.fragmented())
                    receiver.compact();
            }
        }
    }
    function disposeChildren(node) {
        if (!node.children)
            return;
        var i = -1, len = node.children.length, child;
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
    function backtrack(receiver) {
        var updating = Updating, sampling = Sampling;
        Sampling = false;
        backtrack(receiver);
        Updating = updating;
        Sampling = sampling;
        function backtrack(receiver) {
            var i = -1, len = receiver.edges.length, edge;
            while (++i < len) {
                edge = receiver.edges[i];
                if (edge && edge.marked) {
                    if (edge.from.node && edge.from.node.receiver.marks) {
                        // keep working backwards through the marked nodes ...
                        backtrack(edge.from.node.receiver);
                    }
                    else {
                        // ... until we find clean state, from which to start updating
                        notify(edge.from);
                    }
                }
            }
        }
    }
    /// Graph classes and operations
    var DataNode = (function () {
        function DataNode(value) {
            this.value = value;
            this.age = 0; // Data nodes start at a time prior to the present, or else they can't be set in the current frame
            this.emitter = null;
        }
        return DataNode;
    })();
    var ComputationNode = (function () {
        function ComputationNode(fn, gate) {
            this.fn = fn;
            this.gate = gate;
            this.emitter = null;
            this.receiver = null;
            // children and cleanups generated by last update
            this.children = null;
            this.cleanups = null;
        }
        // dispose node: free memory, dispose children, cleanup, detach from graph
        ComputationNode.prototype.dispose = function () {
            if (!this.fn)
                return;
            this.fn = null;
            this.gate = null;
            if (this.children) {
                var i = -1, len = this.children.length;
                while (++i < len) {
                    this.children[i].dispose();
                }
            }
            this.cleanup(true);
            if (this.receiver)
                this.receiver.detach();
            if (this.emitter)
                this.emitter.detach();
        };
        ComputationNode.prototype.cleanup = function (final) {
            if (this.cleanups) {
                var i = -1, len = this.cleanups.length;
                while (++i < len) {
                    this.cleanups[i](final);
                }
                this.cleanups = null;
            }
        };
        return ComputationNode;
    })();
    var Emitter = (function () {
        function Emitter(node) {
            this.node = node;
            this.id = Emitter.count++;
            this.emitting = false;
            this.edges = [];
            this.active = 0;
            this.edgesAge = 0;
        }
        Emitter.prototype.detach = function () {
            var i = -1, len = this.edges.length, edge;
            while (++i < len) {
                edge = this.edges[i];
                if (edge)
                    edge.deactivate();
            }
        };
        Emitter.prototype.fragmented = function () {
            return this.edges.length > 10 && this.edges.length / this.active > 4;
        };
        Emitter.prototype.compact = function () {
            var i = -1, len = this.edges.length, edges = [], compaction = ++this.edgesAge, edge;
            while (++i < len) {
                edge = this.edges[i];
                if (edge) {
                    edge.slot = edges.length;
                    edge.slotAge = compaction;
                    edges.push(edge);
                }
            }
            this.edges = edges;
        };
        Emitter.count = 0;
        return Emitter;
    })();
    function addEdge(from, to) {
        var edge = null;
        if (!to.receiver)
            to.receiver = new Receiver(to);
        else
            edge = to.receiver.index[from.id];
        if (edge)
            edge.activate(from);
        else
            new Edge(from, to.receiver, to.gate && (from.node === null || to.gate !== from.node.gate));
    }
    var Receiver = (function () {
        function Receiver(node) {
            this.node = node;
            this.id = Emitter.count++;
            this.marks = 0;
            this.age = Time;
            this.edges = [];
            this.index = [];
            this.active = 0;
        }
        Receiver.prototype.detach = function () {
            var i = -1, len = this.edges.length;
            while (++i < len) {
                this.edges[i].deactivate();
            }
        };
        Receiver.prototype.fragmented = function () {
            return this.edges.length > 10 && this.edges.length / this.active > 4;
        };
        Receiver.prototype.compact = function () {
            var i = -1, len = this.edges.length, edges = [], index = [], edge;
            while (++i < len) {
                edge = this.edges[i];
                if (edge.active) {
                    edges.push(edge);
                    index[edge.from.id] = edge;
                }
            }
            this.edges = edges;
            this.index = index;
        };
        Receiver.count = 0;
        return Receiver;
    })();
    var Edge = (function () {
        function Edge(from, to, boundary) {
            this.from = from;
            this.to = to;
            this.boundary = boundary;
            this.age = Time;
            this.active = true;
            this.marked = false;
            this.slot = from.edges.length;
            this.slotAge = from.edgesAge;
            from.edges.push(this);
            to.edges.push(this);
            to.index[from.id] = this;
            from.active++;
            to.active++;
        }
        Edge.prototype.activate = function (from) {
            if (!this.active) {
                this.active = true;
                if (this.slotAge === from.edgesAge) {
                    from.edges[this.slot] = this;
                }
                else {
                    this.slotAge = from.edgesAge;
                    this.slot = from.edges.length;
                    from.edges.push(this);
                }
                this.to.active++;
                from.active++;
                this.from = from;
            }
            this.age = Time;
        };
        Edge.prototype.deactivate = function () {
            if (!this.active)
                return;
            var from = this.from, to = this.to;
            this.active = false;
            from.edges[this.slot] = null;
            from.active--;
            to.active--;
            this.from = null;
        };
        return Edge;
    })();
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
