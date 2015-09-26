/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // "Globals" used to keep track of current system state
    var Time = 1, UpdatingComputation = null, Resolver = null;
    var S = function S(fn) {
        var options = this instanceof ComputationBuilder ? this : null, parent = UpdatingComputation, frozen = Resolver.frozen, gate = (options && options._gate) || (parent && parent.gate) || null, node = new ComputationNode(fn, gate), i, len, computation;
        UpdatingComputation = node;
        if (options && options._sources) {
            initSources(options._sources, parent);
            node.listening = false;
        }
        if (parent) {
            if (parent.pinning || (options && options._pin))
                parent.finalizers.push(dispose);
            else
                parent.cleanups.push(dispose);
        }
        UpdatingComputation = node;
        if (frozen) {
            node.value = fn();
            UpdatingComputation = parent;
        }
        else {
            Time++;
            Resolver.frozen = true;
            node.value = initComputation(fn, parent);
        }
        computation = function computation() {
            if (!node)
                return;
            if (UpdatingComputation && UpdatingComputation.listening) {
                if (!node.emitter)
                    node.emitter = new Emitter(node);
                node.emitter.addEdge(UpdatingComputation);
            }
            if (node.receiver && node.receiver.marks !== 0)
                node.receiver.backtrack();
            if (!node)
                return;
            return node.value;
        };
        computation.dispose = dispose;
        computation.toJSON = signalToJSON;
        return computation;
        function dispose() {
            if (!node)
                return;
            var _node = node, receiver = _node.receiver, cleanups = _node.cleanups, i, len;
            node = null;
            if (UpdatingComputation === _node)
                UpdatingComputation = null;
            if (receiver) {
                i = -1, len = receiver.edges.length;
                while (++i < len) {
                    receiver.edges[i].deactivate();
                }
            }
            _node.cleanups = [];
            i = -1, len = cleanups.length;
            while (++i < len) {
                cleanups[i]();
            }
            i = -1, len = _node.finalizers.length;
            while (++i < len) {
                _node.finalizers[i]();
            }
            _node.value = null;
            _node.fn = null;
            _node.finalizers = null;
            _node.receiver = null;
            _node.emitter = null;
        }
    };
    function initSources(sources, parent) {
        var i = -1, len = sources.length;
        try {
            while (++i < len)
                sources[i]();
        }
        finally {
            UpdatingComputation = parent;
        }
    }
    function initComputation(fn, parent) {
        var result;
        try {
            result = fn();
            if (Resolver.len !== 0)
                Resolver.run(null);
        }
        finally {
            UpdatingComputation = parent;
            Resolver.frozen = false;
            Resolver.len = 0;
        }
        return result;
    }
    S.data = function data(value) {
        var node = new DataNode(value), data;
        node.value = value;
        data = function data(value) {
            if (arguments.length > 0) {
                Resolver.change(node, value);
            }
            else {
                if (UpdatingComputation && UpdatingComputation.listening) {
                    if (!node.emitter)
                        node.emitter = new Emitter(null);
                    node.emitter.addEdge(UpdatingComputation);
                }
            }
            return node.value;
        };
        data.toJSON = signalToJSON;
        return data;
    };
    function signalToJSON() {
        return this();
    }
    /// Options
    var ComputationBuilder = (function () {
        function ComputationBuilder() {
            this._sources = null;
            this._pin = false;
            this._gate = null;
        }
        ComputationBuilder.prototype.pin = function () {
            this._pin = true;
            return this;
        };
        ComputationBuilder.prototype.gate = function (gate) {
            this._gate = gate;
            return this;
        };
        ComputationBuilder.prototype.S = function (fn) { return S(fn); }; // temp value, just to get the right signature.  overwritten by actual S.
        return ComputationBuilder;
    })();
    ComputationBuilder.prototype.S = S;
    S.on = function on() {
        var signals = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            signals[_i - 0] = arguments[_i];
        }
        var options = new ComputationBuilder();
        options._sources = signals;
        return options;
    };
    S.gate = function gate(g) {
        return new ComputationBuilder().gate(g);
    };
    S.collector = function collector() {
        var node = new DataNode(null), emitter = node.emitter = new Emitter(null), running = false, collector;
        collector = function collector(token) {
            var node = token;
            if (!running) {
                emitter.addEdge(node);
            }
            return running;
        };
        collector.go = go;
        return collector;
        function go() {
            running = true;
            Resolver.enter(node);
            running = false;
        }
    };
    S.throttle = function throttle(t) {
        var col = S.collector(), last = 0;
        return function throttle(emitter) {
            var now = Date.now();
            col(emitter);
            if ((now - last) > t) {
                last = now;
                col.go();
            }
            else {
                setTimeout(function throttled() {
                    last = Date.now();
                    col.go();
                }, t - (now - last));
            }
            return false;
        };
    };
    S.debounce = function debounce(t) {
        var col = S.collector(), last = 0, tout = 0;
        return function debounce(node) {
            var now = Date.now();
            col(node);
            if (now > last) {
                last = now;
                if (tout)
                    clearTimeout(tout);
                tout = setTimeout(col.go, t);
            }
            return false;
        };
    };
    S.peek = function peek(fn) {
        if (UpdatingComputation && UpdatingComputation.listening) {
            UpdatingComputation.listening = false;
            try {
                return fn();
            }
            finally {
                UpdatingComputation.listening = true;
            }
        }
        else {
            return fn();
        }
    };
    S.cleanup = function cleanup(fn) {
        if (UpdatingComputation) {
            UpdatingComputation.cleanups.push(fn);
        }
        else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };
    S.freeze = function freeze(fn) {
        var result;
        if (Resolver.frozen) {
            result = fn();
        }
        else {
            Time++;
            Resolver.frozen = true;
            try {
                result = fn();
            }
            finally {
                Resolver.frozen = false;
            }
            if (Resolver.len > 0)
                Resolver.enter(null);
        }
        return result;
    };
    // how to type this?
    S.pin = function pin(fn) {
        if (arguments.length === 0) {
            return new ComputationBuilder().pin();
        }
        else if (!UpdatingComputation || UpdatingComputation.pinning) {
            return fn();
        }
        else {
            UpdatingComputation.pinning = true;
            try {
                return fn();
            }
            finally {
                UpdatingComputation.pinning = false;
            }
        }
    };
    // Run change propagation
    var FrameResolver = (function () {
        function FrameResolver() {
            this.len = 0;
            this.frozen = false;
            this.changes = [];
            this.changes2 = [];
        }
        FrameResolver.prototype.change = function (data, value) {
            if (this.frozen) {
                if (data.age === Time) {
                    if (value !== data.pending) {
                        throw new Error("conflicting changes: " + value + " !== " + data.pending);
                    }
                }
                else {
                    data.age = Time;
                    data.pending = value;
                    this.changes[this.len] = data;
                    this.len++;
                }
            }
            else {
                data.value = value;
                if (data.emitter)
                    this.enter(data);
            }
        };
        FrameResolver.prototype.enter = function (change) {
            try {
                this.run(change);
            }
            finally {
                this.frozen = false;
                this.len = 0;
                UpdatingComputation = null;
            }
        };
        FrameResolver.prototype.run = function (change) {
            var changes, count = 0, i, len;
            this.frozen = true;
            if (change) {
                Time++;
                change.emitter.mark();
                change.emitter.propagate();
            }
            // for each frame ...
            while (this.len !== 0) {
                // prepare next frame
                Time++;
                changes = this.changes;
                this.changes = this.changes2;
                this.changes2 = changes;
                len = this.len;
                this.len = 0;
                // ... set nodes' values, clear pending data, and mark them
                i = -1;
                while (++i < len) {
                    change = changes[i];
                    change.value = change.pending;
                    change.pending = undefined;
                    if (change.emitter)
                        change.emitter.mark();
                }
                // run all updates in frame
                i = -1;
                while (++i < len) {
                    change = changes[i];
                    if (change.emitter)
                        change.emitter.propagate();
                    changes[i] = null;
                }
                if (count++ > 1e5) {
                    throw new Error("Runaway frames detected");
                }
            }
        };
        return FrameResolver;
    })();
    /// Graph classes and operations
    var DataNode = (function () {
        function DataNode(value) {
            this.age = 0; // Data nodes start at a time prior to the present, or else they can't be set in the current frame
            this.value = undefined;
            this.pending = undefined;
            this.emitter = null;
            this.value = value;
        }
        return DataNode;
    })();
    var ComputationNode = (function () {
        function ComputationNode(fn, gate) {
            this.value = undefined;
            this.emitter = null;
            this.receiver = null;
            this.listening = true;
            this.pinning = false;
            this.cleanups = [];
            this.finalizers = [];
            this.fn = fn;
            this.gate = gate;
        }
        /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
        ComputationNode.prototype.update = function () {
            var i, len, edge, to, cleanups = this.cleanups;
            this.cleanups = [];
            i = -1, len = cleanups.length;
            while (++i < len) {
                cleanups[i]();
            }
            UpdatingComputation = this;
            if (this.fn)
                this.value = this.fn();
            if (this.emitter)
                this.emitter.propagate();
            if (this.receiver && this.listening) {
                i = -1, len = this.receiver.edges.length;
                while (++i < len) {
                    edge = this.receiver.edges[i];
                    if (edge.active && edge.age < Time) {
                        edge.deactivate();
                    }
                }
                if (len > 10 && len / this.receiver.active > 4)
                    this.receiver.compact();
            }
        };
        return ComputationNode;
    })();
    var Emitter = (function () {
        function Emitter(node) {
            this.id = Emitter.count++;
            this.emitting = false;
            this.edges = [];
            this.index = [];
            this.active = 0;
            this.edgesAge = 0;
            this.node = node;
        }
        Emitter.prototype.addEdge = function (to) {
            var edge = null;
            if (!to.receiver)
                to.receiver = new Receiver(to);
            else
                edge = to.receiver.index[this.id];
            if (edge)
                edge.activate(this);
            else
                new Edge(this, to.receiver, to.gate && (this.node === null || to.gate !== this.node.gate));
        };
        /// mark the node and all downstream nodes as within the range to be updated
        Emitter.prototype.mark = function () {
            var edges = this.edges, i = -1, len = edges.length, edge, to, emitter;
            this.emitting = true;
            while (++i < len) {
                edge = edges[i];
                if (edge && (!edge.boundary || edge.to.node.gate(edge.to.node))) {
                    to = edge.to;
                    emitter = to.node.emitter;
                    if (to.age < Time) {
                        to.marks = 0;
                        if (emitter) {
                            emitter.emitting = false;
                        }
                    }
                    if (emitter && emitter.emitting)
                        throw new Error("circular dependency"); // TODO: more helpful reporting
                    edge.marked = true;
                    to.marks++;
                    to.age = Time;
                    // if this is the first time node's been marked, then propagate
                    if (to.marks === 1 && emitter) {
                        emitter.mark();
                    }
                }
            }
            this.emitting = false;
        };
        Emitter.prototype.propagate = function () {
            var i = -1, len = this.edges.length, edge, to;
            while (++i < len) {
                edge = this.edges[i];
                if (edge && edge.marked) {
                    to = edge.to;
                    edge.marked = false;
                    to.marks--;
                    if (to.marks === 0) {
                        to.node.update();
                    }
                }
            }
            if (len > 10 && len / this.active > 4)
                this.compact();
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
    var Receiver = (function () {
        function Receiver(node) {
            this.id = Emitter.count++;
            this.marks = 0;
            this.age = Time;
            this.edges = [];
            this.index = [];
            this.active = 0;
            this.node = node;
        }
        /// update the given node by backtracking its dependencies to clean state and updating from there
        Receiver.prototype.backtrack = function () {
            var i = -1, len = this.edges.length, oldNode = UpdatingComputation, edge;
            while (++i < len) {
                edge = this.edges[i];
                if (edge && edge.marked) {
                    if (edge.from.node && edge.from.node.receiver.marks) {
                        // keep working backwards through the marked nodes ...
                        edge.from.node.receiver.backtrack();
                    }
                    else {
                        // ... until we find clean state, from which to start updating
                        edge.from.propagate();
                        UpdatingComputation = oldNode;
                    }
                }
            }
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
            this.age = Time;
            this.active = true;
            this.marked = false;
            this.from = from;
            this.to = to;
            this.boundary = boundary;
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
    Resolver = new FrameResolver();
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
