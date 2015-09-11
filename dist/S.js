/// <reference path="../S.d.ts" />
(function () {
    "use strict";
    // "Globals" used to keep track of current system state
    var UpdatingNode = null, Frame = null;
    var S = function S(fn) {
        var options = this instanceof ComputationBuilder ? this : new ComputationBuilder(), parent = UpdatingNode, framing = Frame.collecting, gate = options._gate || (parent && parent.gate) || null, node = new GraphComputation(fn, gate), i, len, computation;
        UpdatingNode = node;
        if (options._sources) {
            i = -1, len = options._sources.length;
            while (++i < len) {
                try {
                    options._sources[i]();
                }
                catch (ex) {
                    UpdatingNode = parent;
                    throw ex;
                }
            }
            node.listening = false;
        }
        if (parent) {
            if (parent.pinning || options._pin)
                parent.finalizers.push(dispose);
            else
                parent.cleanups.push(dispose);
        }
        if (!framing)
            Frame.collecting = true;
        try {
            if (!options._init || options._init(node)) {
                node.value = fn();
            }
        }
        finally {
            UpdatingNode = parent;
            if (!framing)
                Frame.collecting = false;
        }
        if (!framing && Frame.len !== 0)
            Frame.run(null, null);
        computation = function computation() {
            if (!node)
                return;
            if (UpdatingNode) {
                if (!node.emitter)
                    node.emitter = new Emitter(node);
                addEdge(node.emitter, node.gate);
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
            var _node = node, receiver = _node.receiver, i, len;
            node = null;
            if (UpdatingNode === _node)
                UpdatingNode = null;
            if (receiver) {
                i = -1, len = receiver.inbound.length;
                while (++i < len) {
                    receiver.inbound[i].deactivate();
                }
            }
            _node.cleanup();
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
    S.data = function data(value) {
        var node = new Data(value), data;
        node.value = value;
        data = function data(value) {
            if (arguments.length > 0) {
                if (Frame.collecting)
                    Frame.add(node, value);
                else
                    Frame.run(node, value);
            }
            else {
                if (UpdatingNode) {
                    if (!node.emitter)
                        node.emitter = new Emitter(null);
                    addEdge(node.emitter, null);
                }
            }
            return node.value;
        };
        data.toJSON = signalToJSON;
        return data;
    };
    /// Options
    var ComputationBuilder = (function () {
        function ComputationBuilder() {
            this._sources = null;
            this._pin = false;
            this._init = null;
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
    S.when = function when() {
        var preds = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            preds[_i - 0] = arguments[_i];
        }
        var options = new ComputationBuilder(), len = preds.length;
        options._sources = preds;
        options._gate = options._init = function when() {
            var i = -1;
            while (++i < len) {
                if (preds[i]() === undefined)
                    return false;
            }
            return true;
        };
        return options;
    };
    S.gate = function gate(g) {
        return new ComputationBuilder().gate(g);
    };
    function signalToJSON() {
        return this();
    }
    S.collector = function collector() {
        var running = false, nodes = [], nodeIndex = [], collector;
        collector = function collector(token) {
            var node = token;
            if (!running && !nodeIndex[node.receiver.id]) {
                nodes.push(node);
                nodeIndex[node.receiver.id] = node;
            }
            return running;
        };
        collector.go = go;
        return collector;
        function go() {
            var i, node, oldNode;
            running = true;
            i = -1;
            while (++i < nodes.length) {
                node = nodes[i];
                if (node.emitter)
                    node.emitter.mark();
            }
            oldNode = UpdatingNode, UpdatingNode = null;
            i = -1;
            try {
                while (++i < nodes.length) {
                    nodes[i].update();
                }
            }
            catch (ex) {
                i--;
                while (++i < nodes.length) {
                    reset(nodes[i]);
                }
                throw ex;
            }
            finally {
                UpdatingNode = oldNode;
                running = false;
            }
            nodes = [];
            nodeIndex = [];
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
        if (UpdatingNode && UpdatingNode.listening) {
            UpdatingNode.listening = false;
            try {
                return fn();
            }
            finally {
                UpdatingNode.listening = true;
            }
        }
        else {
            return fn();
        }
    };
    S.cleanup = function cleanup(fn) {
        if (UpdatingNode) {
            UpdatingNode.cleanups.push(fn);
        }
        else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };
    S.freeze = function freeze(fn) {
        var result;
        if (Frame.collecting) {
            fn();
        }
        else {
            Frame.collecting = true;
            try {
                result = fn();
            }
            finally {
                Frame.collecting = false;
            }
            Frame.run(null, null);
            return result;
        }
    };
    // how to type this?
    S.pin = function pin(fn) {
        if (arguments.length === 0) {
            return new ComputationBuilder().pin();
        }
        else if (!UpdatingNode || UpdatingNode.pinning) {
            return fn();
        }
        else {
            UpdatingNode.pinning = true;
            try {
                return fn();
            }
            finally {
                UpdatingNode.pinning = false;
            }
        }
    };
    // Run change propagation
    var RunFrame = (function () {
        function RunFrame() {
            this.len = 0;
            this.collecting = false;
            this.nodes = [];
            this.nodes2 = [];
        }
        RunFrame.prototype.add = function (node, value) {
            if (node.pending) {
                if (value !== node.pendingValue) {
                    throw new Error("conflicting mutations: " + value + " !== " + node.pendingValue);
                }
            }
            else {
                node.pending = true;
                node.pendingValue = value;
                this.nodes[this.len] = node;
                this.len++;
            }
        };
        RunFrame.prototype.run = function (node, value) {
            var nodes, count = 0, success = false, i, len;
            if (node) {
                node.value = value;
                if (!node.emitter)
                    return;
                node.emitter.mark();
                this.collecting = true;
                try {
                    node.emitter.propagate();
                    success = true;
                }
                finally {
                    if (!success) {
                        reset(node);
                    }
                    this.collecting = false;
                    UpdatingNode = null;
                }
            }
            // for each frame ...
            while ((nodes = this.nodes, len = this.len) !== 0) {
                // ... set nodes' values, clear their entry in the values array, and mark them
                i = -1;
                while (++i < len) {
                    node = nodes[i];
                    node.value = node.pendingValue;
                    node.pending = false;
                    if (node.emitter)
                        node.emitter.mark();
                }
                // reset frame
                this.nodes = this.nodes2;
                this.nodes2 = nodes;
                this.len = 0;
                // run all updates in frame
                this.collecting = true;
                i = -1;
                try {
                    while (++i < len) {
                        node = nodes[i];
                        if (node.emitter)
                            node.emitter.propagate();
                        nodes[i] = null;
                    }
                }
                finally {
                    // in case we had an error, make sure all remaining marked nodes are reset
                    i--;
                    while (++i < len) {
                        reset(nodes[i]);
                        nodes[i] = null;
                    }
                    this.collecting = false;
                    UpdatingNode = null;
                }
                if (++count > 1e5) {
                    i = -1;
                    while (++i < this.len) {
                        this.nodes[i] = null;
                    }
                    this.len = 0;
                    throw new Error("Runaway frames detected");
                }
            }
        };
        return RunFrame;
    })();
    Frame = new RunFrame();
    /// Graph classes and operations
    var Data = (function () {
        function Data(value) {
            this.value = undefined;
            this.pending = false;
            this.pendingValue = undefined;
            this.emitter = null;
            this.value = value;
        }
        return Data;
    })();
    var GraphComputation = (function () {
        function GraphComputation(fn, gate) {
            this.value = undefined;
            this.gen = 1;
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
        GraphComputation.prototype.update = function () {
            var i, len, edge, to;
            this.cleanup();
            UpdatingNode = this;
            this.gen++;
            if (this.fn)
                this.value = this.fn();
            if (this.receiver && this.listening) {
                i = -1, len = this.receiver.inbound.length;
                while (++i < len) {
                    edge = this.receiver.inbound[i];
                    if (edge.active && edge.gen < this.gen) {
                        edge.deactivate();
                    }
                }
                if (len > 10 && len / this.receiver.inboundActive > 4)
                    this.receiver.compact();
            }
            if (this.emitter)
                this.emitter.propagate();
        };
        GraphComputation.prototype.cleanup = function () {
            var i = -1, fns = this.cleanups, len = fns.length;
            this.cleanups = [];
            while (++i < len) {
                fns[i]();
            }
        };
        return GraphComputation;
    })();
    var Emitter = (function () {
        function Emitter(node) {
            this.id = Emitter.count++;
            this.emitting = false;
            this.outbound = [];
            this.outboundIndex = [];
            this.outboundActive = 0;
            this.outboundCompaction = 0;
            this.node = node;
        }
        /// mark the node and all downstream nodes as within the range to be updated
        Emitter.prototype.mark = function () {
            this.emitting = true;
            var outbound = this.outbound, i = -1, len = outbound.length, edge, to;
            while (++i < len) {
                edge = outbound[i];
                if (edge && (!edge.boundary || edge.to.node.gate(edge.to.node))) {
                    to = edge.to;
                    if (to.node.emitter && to.node.emitter.emitting)
                        throw new Error("circular dependency"); // TODO: more helpful reporting
                    edge.marked = true;
                    to.marks++;
                    // if this is the first time node's been marked, then propagate
                    if (to.marks === 1 && to.node.emitter) {
                        to.node.emitter.mark();
                    }
                }
            }
            this.emitting = false;
        };
        Emitter.prototype.propagate = function () {
            var i = -1, len = this.outbound.length, edge, to;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.marked) {
                    to = edge.to;
                    edge.marked = false;
                    to.marks--;
                    if (to.marks === 0) {
                        to.node.update();
                    }
                }
            }
            if (len > 10 && len / this.outboundActive > 4)
                this.compact();
        };
        Emitter.prototype.compact = function () {
            var i = -1, len = this.outbound.length, compact = [], compaction = ++this.outboundCompaction, edge;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge) {
                    edge.outboundOffset = compact.length;
                    edge.outboundCompaction = compaction;
                    compact.push(edge);
                }
            }
            this.outbound = compact;
        };
        Emitter.count = 0;
        return Emitter;
    })();
    var Receiver = (function () {
        function Receiver(node) {
            this.id = Emitter.count++;
            this.marks = 0;
            this.inbound = [];
            this.inboundIndex = [];
            this.inboundActive = 0;
            this.node = node;
        }
        /// update the given node by backtracking its dependencies to clean state and updating from there
        Receiver.prototype.backtrack = function () {
            var i = -1, len = this.inbound.length, oldNode = UpdatingNode, edge;
            while (++i < len) {
                edge = this.inbound[i];
                if (edge && edge.marked) {
                    if (edge.from.node && edge.from.node.receiver.marks) {
                        // keep working backwards through the marked nodes ...
                        edge.from.node.receiver.backtrack();
                    }
                    else {
                        // ... until we find clean state, from which to start updating
                        edge.from.propagate();
                        UpdatingNode = oldNode;
                    }
                }
            }
        };
        Receiver.prototype.compact = function () {
            var i = -1, len = this.inbound.length, compact = [], compactIndex = [], edge;
            while (++i < len) {
                edge = this.inbound[i];
                if (edge.active) {
                    compact.push(edge);
                    compactIndex[edge.from.id] = edge;
                }
            }
            this.inbound = compact;
            this.inboundIndex = compactIndex;
        };
        Receiver.count = 0;
        return Receiver;
    })();
    var Edge = (function () {
        function Edge(from, to, boundary) {
            this.active = true;
            this.marked = false;
            this.from = from;
            this.to = to;
            this.boundary = boundary;
            this.gen = to.node.gen;
            this.outboundOffset = from.outbound.length;
            this.outboundCompaction = from.outboundCompaction;
            from.outbound.push(this);
            to.inbound.push(this);
            to.inboundIndex[from.id] = this;
            from.outboundActive++;
            to.inboundActive++;
        }
        Edge.prototype.activate = function (from) {
            if (!this.active) {
                this.active = true;
                if (this.outboundCompaction === from.outboundCompaction) {
                    from.outbound[this.outboundOffset] = this;
                }
                else {
                    this.outboundCompaction = from.outboundCompaction;
                    this.outboundOffset = from.outbound.length;
                    from.outbound.push(this);
                }
                this.to.inboundActive++;
                from.outboundActive++;
                this.from = from;
            }
            this.gen = this.to.node.gen;
        };
        Edge.prototype.deactivate = function () {
            if (!this.active)
                return;
            var from = this.from, to = this.to;
            this.active = false;
            from.outbound[this.outboundOffset] = null;
            from.outboundActive--;
            to.inboundActive--;
            this.from = null;
        };
        return Edge;
    })();
    function addEdge(from, gate) {
        var to = UpdatingNode, edge = null;
        if (to && to.listening) {
            if (!to.receiver)
                to.receiver = new Receiver(to);
            else
                edge = to.receiver.inboundIndex[from.id];
            if (edge)
                edge.activate(from);
            else
                new Edge(from, to.receiver, to.gate && to.gate !== gate);
        }
    }
    /// reset the given node and all downstream nodes to initial state: unmarked, not updating
    function reset(node) {
        node.marks = 0;
        node.updating = false;
        node.cur = 0;
        var i = -1, len = node.outbound ? node.outbound.length : 0, edge;
        while (++i < len) {
            edge = node.outbound[i];
            if (edge && (edge.marked || edge.to.updating)) {
                edge.marked = false;
                reset(edge.to);
            }
        }
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
