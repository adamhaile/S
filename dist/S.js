/// <reference path="../S.d.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
(function () {
    "use strict";
    // "Globals" used to keep track of current system state
    var Time = 1, Batching = 0, Batch = [], Updating = null, Disposing = false, Disposes = [];
    var S = function S(fn) {
        var options = (this instanceof Builder ? this.options : null), parent = Updating, gate = (options && options.gate) || (parent && parent.gate) || null, node = new ComputationNode(fn, gate);
        if (parent && (!options || !options.toplevel)) {
            (parent.children || (parent.children = [])).push(node);
        }
        Updating = node;
        if (Batching) {
            if (options && options.static) {
                options.static();
                node.static = true;
            }
            node.value = fn();
        }
        else {
            node.value = initialExecution(node, fn, options && options.static);
        }
        Updating = parent;
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
                if (!Updating.static) {
                    if (!node.emitter)
                        node.emitter = new Emitter(node);
                    addEdge(node.emitter, Updating);
                }
            }
            return node.value;
        };
    };
    function initialExecution(node, fn, on) {
        var result;
        Time++;
        Batching = 1;
        try {
            if (on) {
                on();
                node.static = true;
            }
            result = fn();
            if (Batching > 1)
                resolve(null);
        }
        finally {
            Updating = null;
            Batching = 0;
        }
        return result;
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
                if (Updating && !Updating.static) {
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
            this.gate = null;
            this.static = null;
        }
        return Options;
    })();
    var Builder = (function () {
        function Builder(options) {
            this.options = options;
        }
        Builder.prototype.S = function (fn) { return S.call(this, fn); };
        ;
        return Builder;
    })();
    var AsyncOption = (function (_super) {
        __extends(AsyncOption, _super);
        function AsyncOption() {
            _super.apply(this, arguments);
        }
        AsyncOption.prototype.async = function (fn) {
            this.options.gate = gate(fn);
            return new Builder(this.options);
        };
        return AsyncOption;
    })(Builder);
    var OnOption = (function (_super) {
        __extends(OnOption, _super);
        function OnOption() {
            _super.apply(this, arguments);
        }
        OnOption.prototype.on = function () {
            var args;
            if (arguments.length === 0) {
                this.options.static = noop;
            }
            else if (arguments.length === 1) {
                this.options.static = arguments[0];
            }
            else {
                args = Array.prototype.slice.call(arguments);
                this.options.static = callAll;
            }
            return new AsyncOption(this.options);
            function callAll() { for (var i = 0; i < args.length; i++)
                args[i](); }
            function noop() { }
        };
        return OnOption;
    })(AsyncOption);
    S.toplevel = function toplevel() {
        var options = new Options();
        options.toplevel = true;
        return new OnOption(options);
    };
    S.on = function on() {
        return OnOption.prototype.on.apply(new OnOption(new Options()), arguments);
    };
    S.async = function async(fn) {
        return new AsyncOption(new Options()).async(fn);
    };
    function gate(scheduler) {
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
        // for each frame ...
        while (Batching !== 1) {
            // prepare next frame
            Time++;
            batch = Batch, Batch = _batch, _batch = batch;
            len = Batching, Batching = 1;
            // ... set nodes' values, clear pending data, and mark them
            i = 0;
            while (++i < len) {
                change = batch[i];
                change.value = change.pending;
                change.pending = undefined;
                if (change.emitter)
                    prepare(change.emitter);
            }
            // run all updates in frame
            i = 0;
            while (++i < len) {
                change = batch[i];
                if (change.emitter)
                    notify(change.emitter);
                batch[i] = null;
            }
            i = -1, len = Disposes.length;
            if (len) {
                while (++i < len)
                    Disposes[i].dispose();
                Disposes = [];
            }
            if (count++ > 1e5) {
                throw new Error("Runaway frames detected");
            }
        }
    }
    /// mark the node and all downstream nodes as within the range to be updated
    function prepare(emitter) {
        var edges = emitter.edges, i = -1, len = edges.length, edge, to, toEmitter;
        emitter.emitting = true;
        while (++i < len) {
            edge = edges[i];
            if (edge && (!edge.boundary || edge.to.node.gate(edge.to.node))) {
                to = edge.to;
                toEmitter = to.node.emitter;
                // if an earlier update threw an exception, marks may be dirty - clear it now
                if (to.marks !== 0 && to.age < Time) {
                    to.marks = 0;
                    if (toEmitter) {
                        toEmitter.emitting = false;
                    }
                }
                if (toEmitter && toEmitter.emitting)
                    throw new Error("circular dependency"); // TODO: more helpful reporting
                edge.marked = true;
                to.marks++;
                to.age = Time;
                // if this is the first time to's been marked, then propagate
                if (toEmitter && to.marks === 1) {
                    prepare(toEmitter);
                }
            }
        }
        emitter.emitting = false;
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
        if (len > 10 && len / emitter.active > 4)
            emitter.compact();
    }
    /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
    function update(node) {
        var emitter = node.emitter, receiver = node.receiver, i, len, edge, to;
        if (node.cleanups) {
            i = -1, len = node.cleanups.length;
            while (++i < len) {
                node.cleanups[i](false);
            }
            node.cleanups = null;
        }
        if (node.children) {
            i = -1, len = node.children.length;
            while (++i < len) {
                node.children[i].dispose();
            }
            node.children = null;
        }
        Updating = node;
        if (node.fn)
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
            if (len > 10 && len / emitter.active > 4)
                emitter.compact();
        }
        if (receiver && !node.static) {
            i = -1, len = receiver.edges.length;
            while (++i < len) {
                edge = receiver.edges[i];
                if (edge.active && edge.age < Time) {
                    deactivate(edge);
                }
            }
            if (len > 10 && len / receiver.active > 4)
                receiver.compact();
        }
    }
    /// update the given node by backtracking its dependencies to clean state and updating from there
    function backtrack(receiver) {
        var updating = Updating;
        backtrack(receiver);
        Updating = updating;
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
            this.static = false;
            this.emitter = null;
            this.receiver = null;
            this.children = null;
            this.cleanups = null;
        }
        ComputationNode.prototype.dispose = function () {
            if (!this.fn)
                return;
            var i, len, edge;
            if (Updating === this)
                Updating = null;
            this.fn = null;
            this.gate = null;
            if (this.cleanups) {
                i = -1, len = this.cleanups.length;
                while (++i < len) {
                    this.cleanups[i](true);
                }
                this.cleanups = null;
            }
            if (this.receiver) {
                i = -1, len = this.receiver.edges.length;
                while (++i < len) {
                    deactivate(this.receiver.edges[i]);
                }
            }
            if (this.emitter) {
                i = -1, len = this.emitter.edges.length;
                while (++i < len) {
                    edge = this.emitter.edges[i];
                    if (edge)
                        deactivate(edge);
                }
            }
            if (this.children) {
                i = -1, len = this.children.length;
                while (++i < len) {
                    this.children[i].dispose();
                }
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
            this.index = [];
            this.active = 0;
            this.edgesAge = 0;
        }
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
            activate(edge, from);
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
        return Edge;
    })();
    function activate(edge, from) {
        if (!edge.active) {
            edge.active = true;
            if (edge.slotAge === from.edgesAge) {
                from.edges[edge.slot] = edge;
            }
            else {
                edge.slotAge = from.edgesAge;
                edge.slot = from.edges.length;
                from.edges.push(edge);
            }
            edge.to.active++;
            from.active++;
            edge.from = from;
        }
        edge.age = Time;
    }
    function deactivate(edge) {
        if (!edge.active)
            return;
        var from = edge.from, to = edge.to;
        edge.active = false;
        from.edges[edge.slot] = null;
        from.active--;
        to.active--;
        edge.from = null;
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
