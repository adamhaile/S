/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // "Globals" used to keep track of current system state
    var Time = 1, Frozen = false, Changes = [], ChangeCount = 0, Updating = null, Jailbreaking = false, Jailbroken = null;
    var S = function S(fn) {
        var options = (this instanceof ComputationBuilder ? this : null), parent = Updating, frozen = Frozen, gate = (options && options._gate) || (parent && parent.gate) || null, node = new ComputationNode(fn, gate, computation);
        Updating = node;
        if (options && options._watch) {
            initSources(options._watch, parent);
            node.listening = false;
        }
        if (options && options._pin !== undefined) {
            if (options._pin !== null)
                options._pin.pins.push(node);
        }
        else if (parent) {
            parent.children.push(node);
        }
        Updating = node;
        if (frozen) {
            node.value = fn(computation);
            Updating = parent;
        }
        else {
            node.value = initComputation(fn, parent, computation);
        }
        return computation;
        function computation() {
            if (Jailbreaking) {
                Jailbroken = node;
                return;
            }
            if (!node.fn)
                return;
            if (Updating && Updating.listening) {
                if (!node.emitter)
                    node.emitter = new Emitter(node);
                addEdge(node.emitter, Updating);
            }
            if (node.receiver && node.receiver.marks !== 0)
                backtrack(node.receiver);
            if (!node.fn)
                return;
            return node.value;
        }
    };
    function initSources(sources, parent) {
        var i = -1, len = sources.length;
        try {
            while (++i < len)
                sources[i]();
        }
        finally {
            Updating = parent;
        }
    }
    function initComputation(fn, parent, self) {
        var result;
        Time++;
        Frozen = true;
        try {
            result = fn(self);
            if (ChangeCount !== 0)
                resolve(null);
        }
        finally {
            Updating = parent;
            Frozen = false;
            ChangeCount = 0;
        }
        return result;
    }
    S.data = function data(value) {
        var node = new DataNode(value);
        return function data(value) {
            if (arguments.length > 0) {
                if (Frozen) {
                    if (node.age === Time) {
                        if (value !== node.pending) {
                            throw new Error("conflicting changes: " + value + " !== " + node.pending);
                        }
                    }
                    else {
                        node.age = Time;
                        node.pending = value;
                        Changes[ChangeCount++] = node;
                    }
                }
                else {
                    node.value = value;
                    if (node.emitter)
                        externalChange(node);
                }
                return value;
            }
            else {
                if (Updating && Updating.listening) {
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
        return function sum(updater) {
            if (arguments.length > 0) {
                if (Frozen) {
                    if (node.age === Time) {
                        node.pending = updater(node.pending);
                    }
                    else {
                        node.age = Time;
                        node.pending = updater(node.value);
                        Changes[ChangeCount++] = node;
                    }
                }
                else {
                    node.value = value;
                    if (node.emitter)
                        externalChange(node);
                }
                return value;
            }
            else {
                if (Updating && Updating.listening) {
                    if (!node.emitter)
                        node.emitter = new Emitter(null);
                    addEdge(node.emitter, Updating);
                }
                return node.value;
            }
        };
    };
    function jailbreak(signal) {
        Jailbreaking = true;
        try {
            signal();
            return Jailbroken;
        }
        finally {
            Jailbreaking = false;
        }
    }
    /// Options
    var ComputationBuilder = (function () {
        function ComputationBuilder() {
            this._watch = null;
            this._pin = undefined;
            this._gate = null;
            this.S = S;
        }
        ComputationBuilder.prototype.pin = function (signal) {
            this._pin = signal ? jailbreak(signal) : null;
            return this;
        };
        ComputationBuilder.prototype.async = function (fn) {
            this._gate = async(fn);
            return this;
        };
        return ComputationBuilder;
    })();
    S.watch = function watch() {
        var signals = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            signals[_i - 0] = arguments[_i];
        }
        var options = new ComputationBuilder();
        options._watch = signals;
        return options;
    };
    S.pin = function pin(s) {
        return new ComputationBuilder().pin(s);
    };
    S.async = function async(fn) {
        return new ComputationBuilder().async(fn);
    };
    function async(scheduler) {
        var node = new DataNode(null), emitter = new Emitter(null), scheduled = false, running = false, tick;
        node.emitter = emitter;
        return function gate(node) {
            var _tick;
            if (running)
                return true;
            if (scheduled) {
                if (tick)
                    tick();
            }
            else {
                scheduled = true;
                addEdge(emitter, node);
                _tick = scheduler(go);
                if (typeof _tick === 'function')
                    tick = _tick;
            }
            return false;
        };
        function go() {
            if (running)
                return;
            running = true;
            externalChange(node);
            running = false;
        }
    }
    ;
    S.peek = function peek(fn) {
        if (Updating && Updating.listening) {
            Updating.listening = false;
            try {
                return fn();
            }
            finally {
                Updating.listening = true;
            }
        }
        else {
            return fn();
        }
    };
    S.cleanup = function cleanup(fn) {
        if (Updating) {
            Updating.cleanups.push(fn);
        }
        else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };
    S.dispose = function dispose(signal) {
        var node = jailbreak(signal);
        if (node)
            node.dispose();
    };
    S.freeze = function freeze(fn) {
        var result;
        if (Frozen) {
            result = fn();
        }
        else {
            Time++;
            Frozen = true;
            try {
                result = fn();
            }
            finally {
                Frozen = false;
            }
            if (ChangeCount > 0)
                externalChange(null);
        }
        return result;
    };
    function externalChange(change) {
        try {
            resolve(change);
        }
        finally {
            Frozen = false;
            ChangeCount = 0;
            Updating = null;
        }
    }
    var _changes = [];
    function resolve(change) {
        var count = 0, changes, i, len;
        Frozen = true;
        if (change) {
            Time++;
            prepare(change.emitter);
            notify(change.emitter);
        }
        // for each frame ...
        while (ChangeCount !== 0) {
            // prepare next frame
            Time++;
            changes = Changes, Changes = _changes, _changes = changes;
            len = ChangeCount, ChangeCount = 0;
            // ... set nodes' values, clear pending data, and mark them
            i = -1;
            while (++i < len) {
                change = changes[i];
                change.value = change.pending;
                change.pending = undefined;
                if (change.emitter)
                    prepare(change.emitter);
            }
            // run all updates in frame
            i = -1;
            while (++i < len) {
                change = changes[i];
                if (change.emitter)
                    notify(change.emitter);
                changes[i] = null;
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
                if (to.age < Time) {
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
                if (to.marks === 1 && toEmitter) {
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
        i = -1, len = node.children.length;
        while (++i < len) {
            node.children[i].dispose();
        }
        node.children = [];
        Updating = node;
        node.value = node.fn(node.self);
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
        if ((receiver !== null) && node.listening) {
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
        var i = -1, len = receiver.edges.length, oldNode = Updating, edge;
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
                    Updating = oldNode;
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
        function ComputationNode(fn, gate, self) {
            this.fn = fn;
            this.gate = gate;
            this.self = self;
            this.emitter = null;
            this.receiver = null;
            this.listening = true;
            this.pinning = false;
            this.children = [];
            this.pins = [];
            this.cleanups = [];
        }
        ComputationNode.prototype.dispose = function () {
            if (!this.fn)
                return;
            var i, len, edge;
            if (Updating === this)
                Updating = null;
            this.fn = null;
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
            i = -1, len = this.children.length;
            while (++i < len) {
                this.children[i].dispose();
            }
            i = -1, len = this.pins.length;
            while (++i < len) {
                this.pins[i].dispose();
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
