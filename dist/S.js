/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // "Globals" used to keep track of current system state
    var Time = 1, // our clock, ticks every update
    Batching = 0, // whether we're batching data changes, 0 = no, 1+ = yes, with index to next Batch slot
    Batch = [], // batched changes to data nodes
    Updating = null, // whether we're updating, null = no, non-null = node being updated
    Sampling = false, // whether we're sampling signals, with no dependencies
    Disposing = false, // whether we're disposing
    Disposes = [], // disposals to run after current batch of changes finishes
    Hold = {}, // unique value returned by functions that are holding their current value
    Toplevel = false; // whether a new computation should be promoted to top level 
    var S = function S(fn) {
        var parent = Updating, sampling = Sampling, trait = parent ? parent.trait : null, _fn = trait ? trait(fn) : fn, node = new ComputationNode(_fn, trait), value;
        Updating = node;
        Sampling = false;
        Toplevel = false;
        value = Batching ? _fn() : initialExecution(node, _fn);
        if (value !== Hold)
            node.value = value;
        if (Toplevel)
            Toplevel = false;
        else if (parent)
            (parent.children || (parent.children = [])).push(node);
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
                if (node.age === Time && node.marks !== node.updates) {
                    backtrack(node);
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
        var first = true;
        fn = arguments.length <= 2 ? fn :
            arguments.length === 3 ? reduce(seed)(fn) :
                reduce2(seed, state)(fn);
        return S(on);
        function on() {
            ev();
            return first ? (first = false, seed) : S.sample(fn);
        }
    };
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
    S.hold = function hold() { return Hold; };
    S.trait = function trait(mod) {
        return function (fn) {
            var first = true;
            fn = mod(fn);
            return function trait() {
                if (first && Updating) {
                    Updating.trait = Updating.trait ? compose(Updating.trait, mod) : mod;
                    first = false;
                }
                return fn();
            };
        };
    };
    S.toplevel = function toplevel(fn) {
        return function toplevel() {
            var result = fn();
            Toplevel = true;
            return result;
        };
    };
    S.async = function async(scheduler) {
        var sentinel = S.data(false), tick = scheduler(go);
        return S.trait(async);
        function async(fn) {
            var first = true;
            return function async() {
                return first ? (first = false, fn()) :
                    S.sample(sentinel) ? (sentinel(false), fn()) :
                        (sentinel(), tick && tick(), S.hold());
            };
        }
        function go() {
            sentinel(true);
        }
    };
    function compose(a, b) {
        return function compose(fn) { return a(b(fn)); };
    }
    function reduce(seed) {
        var _seed = seed;
        return function reduce(fn) {
            var seed = _seed;
            return function reduce() {
                return seed = fn(seed);
            };
        };
    }
    function reduce2(seed, state) {
        var _seed = seed;
        return function (fn) {
            var seed = _seed;
            return function reduce2() {
                return seed = fn(seed, state);
            };
        };
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
            propagate(mark, change.emitter);
            propagateMarked(update, change.emitter);
            if (Disposes.length) {
                for (i = 0; i < Disposes.length; i++)
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
            for (i = 1; i < len; i++) {
                change = batch[i];
                change.value = change.pending;
                change.pending = undefined;
                propagate(mark, change.emitter);
            }
            // run all updates in batch
            for (i = 1; i < len; i++) {
                change = batch[i];
                propagateMarked(update, change.emitter);
                batch[i] = null;
            }
            // run disposes accumulated while updating
            if (Disposes.length) {
                for (i = 0; i < Disposes.length; i++)
                    Disposes[i].dispose();
                Disposes = [];
            }
            // if there are still changes after excessive batches, assume runaway            
            if (count++ > 1e5) {
                throw new Error("Runaway frames detected");
            }
        }
    }
    function mark(node) {
        var children = node.children;
        if (node.age === Time) {
            // if we've come back to an emitting Emitter, that's a cycle
            if (node.emitter && node.emitter.emitting)
                throw new Error("circular dependency"); // TODO: more helpful reporting
            node.marks++;
        }
        else {
            node.age = Time;
            node.marks = 1;
            node.updates = 0;
            if (children) {
                for (var i = 0; i < children.length; i++) {
                    mark(children[i]);
                }
            }
            propagate(mark, node.emitter);
        }
    }
    /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
    function update(node) {
        node.updates++;
        if (node.marks != node.updates)
            return;
        var receiver = node.receiver;
        Updating = node;
        node.cleanup(false);
        var value = node.fn();
        if (value !== Hold) {
            node.value = value;
            propagateMarked(update, node.emitter);
            if (receiver) {
                for (var i = 0; i < receiver.edges.length; i++) {
                    var edge = receiver.edges[i];
                    if (edge.from && edge.age < Time) {
                        edge.deactivate();
                    }
                }
                if (receiver.fragmented())
                    receiver.compact();
            }
        }
        else {
            propagateMarked(clear, node.emitter);
        }
    }
    function clear(node) {
        node.marks--;
        if (node.marks === node.updates) {
            if (node.marks > 0)
                update(node);
            else {
                propagateMarked(clear, node.emitter);
                if (node.children) {
                    for (var i = 0; i < node.children.length; i++) {
                        clear(node.children[i]);
                    }
                }
            }
        }
    }
    /// update the given node by backtracking its dependencies to clean state and updating from there
    function backtrack(node) {
        var updating = Updating, sampling = Sampling;
        Sampling = false;
        backtrack(node);
        Updating = updating;
        Sampling = sampling;
        function backtrack(node) {
            var edges = node.receiver.edges;
            for (var i = 0; i < edges.length; i++) {
                var edge = edges[i];
                if (edge.marked) {
                    var back = edge.from.node;
                    if (!back) {
                        // reached data node, start updating
                        propagateMarked(update, edge.from);
                    }
                    else if (back.marks === back.updates) {
                        // reached clean computation, start updating
                        update(back);
                    }
                    else {
                        // still working backwards through the marked nodes, go back further
                        backtrack(back);
                    }
                }
            }
        }
    }
    function propagate(op, emitter) {
        if (!emitter)
            return;
        var edges = emitter.edges;
        emitter.emitting = true;
        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            if (edge) {
                edge.marked = true;
                op(edge.to.node);
            }
        }
        emitter.emitting = false;
    }
    function propagateMarked(op, emitter) {
        if (!emitter)
            return;
        var edges = emitter.edges;
        emitter.emitting = true;
        for (var i = 0; i < edges.length; i++) {
            var edge = edges[i];
            if (edge && edge.marked) {
                edge.marked = false;
                op(edge.to.node);
            }
        }
        emitter.emitting = false;
    }
    /// Graph classes and operations
    var DataNode = (function () {
        function DataNode(value) {
            this.value = value;
            this.age = 0; // Data nodes start at a time prior to the present, or else they can't be set in the current tick
            this.emitter = null;
        }
        return DataNode;
    })();
    var ComputationNode = (function () {
        function ComputationNode(fn, trait) {
            this.fn = fn;
            this.trait = trait;
            this.age = Time;
            this.marks = 0;
            this.updates = 0;
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
            this.trait = null;
            if (this.age === Time && this.marks !== this.updates) {
                propagateMarked(clear, this.emitter);
            }
            this.cleanup(true);
            if (this.receiver)
                this.receiver.detach();
            if (this.emitter)
                this.emitter.detach();
        };
        ComputationNode.prototype.cleanup = function (final) {
            if (this.children) {
                for (var i = 0; i < this.children.length; i++) {
                    this.children[i].dispose();
                }
                this.children = null;
            }
            if (this.cleanups) {
                for (i = 0; i < this.cleanups.length; i++) {
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
            for (var i = 0; i < this.edges.length; i++) {
                var edge = this.edges[i];
                if (edge)
                    edge.deactivate();
            }
        };
        Emitter.prototype.fragmented = function () {
            return this.edges.length > 10 && this.edges.length / this.active > 4;
        };
        Emitter.prototype.compact = function () {
            var edges = [], compaction = ++this.edgesAge;
            for (var i = 0; i < this.edges.length; i++) {
                var edge = this.edges[i];
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
            new Edge(from, to.receiver);
    }
    var Receiver = (function () {
        function Receiver(node) {
            this.node = node;
            this.id = Emitter.count++;
            this.edges = [];
            this.index = [];
            this.active = 0;
        }
        Receiver.prototype.detach = function () {
            for (var i = 0; i < this.edges.length; i++) {
                this.edges[i].deactivate();
            }
        };
        Receiver.prototype.fragmented = function () {
            return this.edges.length > 10 && this.edges.length / this.active > 4;
        };
        Receiver.prototype.compact = function () {
            var edges = [], index = [];
            for (var i = 0; i < this.edges.length; i++) {
                var edge = this.edges[i];
                if (edge.from) {
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
        function Edge(from, to) {
            this.from = from;
            this.to = to;
            this.age = Time;
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
            if (!this.from) {
                this.from = from;
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
            }
            this.age = Time;
        };
        Edge.prototype.deactivate = function () {
            if (!this.from)
                return;
            var from = this.from, to = this.to;
            this.from = null;
            from.edges[this.slot] = null;
            from.active--;
            to.active--;
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
