(function () {
    "use strict";

    // UMD exporter
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = S; // CommonJS
    } else if (typeof define === 'function') {
        define([], function () { return S; }); // AMD
    } else {
        (eval || false)("this").S = S; // fallback to global object
    }

    // "Globals" used to keep track of current system state
    var NodeCount = 0,
        UpdatingNode = null,
        Freezing = null;

    function S(fn) {
        var options = this instanceof ComputationOptions ? this : new ComputationOptions(),
            parent = UpdatingNode,
            gate = options._gate || (parent && parent.gate) || null,
            payload = new Payload(fn),
            node = new Node(++NodeCount, payload, gate),
            disposed = false,
            i, len;

        UpdatingNode = node;

        if (options._sources) {
            i = -1, len = options._sources.length;
            while (++i < len) {
                try {
                    options._sources[i]();
                } catch (ex) {
                    UpdatingNode = parent;
                    throw ex;
                }
            }
            payload.listening = false;
        }

        if (parent) {
            if (parent.payload.pinning || options._pin) parent.payload.finalizers.push(dispose);
            else parent.payload.cleanups.push(dispose);
        }

        node.trigger = parent || node;
        try {
            if (!options._init || options._init(node)) {
                node.payload.value = fn();
            }
        } finally {
            if (!disposed) node.trigger = null;
            UpdatingNode = parent;
        }

        computation.dispose = dispose;
        computation.toJSON = signalToJSON;

        return computation;

        function computation() {
            if (disposed) return;
            addEdge(node);
            if (node.marks !== 0) backtrack(node, UpdatingNode);
            if (disposed) return;
            return node.payload.value;
        }

        function dispose() {
            if (disposed) return;
            disposed = true;

            var i, len;

            i = -1, len = node.inbound.length;
            while (++i < len) {
                deactivate(node.inbound[i]);
            }

            cleanup(payload);

            i = -1, len = payload.finalizers.length;
            while (++i < len) {
                payload.finalizers[i]();
            }

            payload.fn = null;
            payload.value = null;
            payload.finalizers = null;
            payload = null;

            node.payload = null;
            node.inbound = null;
            node.inboundIndex = null;
            node.outbound = null;
            node = null;
        }
    }

    S.data = function data(value) {
        var node = new Node(++NodeCount, null, UpdatingNode ? UpdatingNode.gate : null);

        data.toJSON = signalToJSON;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                if (UpdatingNode) finishUpdate(UpdatingNode);
                value = newValue;
                reportChange(node);
            } else {
                addEdge(node);
            }
            return value;
        }
    };

    function reportChange(node) {
        var oldNode;
        if (Freezing) {
            Freezing(node);
        } else {
            mark(node);

            oldNode = UpdatingNode, UpdatingNode = null;
            try {
                update(node, oldNode || node);
            } catch (ex) {
                reset(node);
                throw ex;
            } finally {
                UpdatingNode = oldNode;
            }
        }
    }

    /// Options
    function ComputationOptions() {
        this._sources = null;
        this._pin     = false;
        this._init    = null;
        this._gate    = null;
    }

    ComputationOptions.prototype = {
        pin : function ()     { this._pin  = true; return this; },
        gate: function (gate) { this._gate = gate; return this; },
        S   : S
    };

    S.on = function on(/* ...signals */) {
        var options = new ComputationOptions();
        options._sources = Array.prototype.slice.apply(arguments);
        return options;
    };

    S.when = function when(/* ...promises */) {
        var options = new ComputationOptions(),
            preds = Array.prototype.slice.apply(arguments),
            len = preds.length;

        options._sources = preds;
        options._gate = options._init = function when() {
            var i = -1;
            while (++i < len) {
                if (preds[i]() === undefined) return false;
            }
            return true;
        };

        return options;
    };

    S.gate = function gate(g) { return new ComputationOptions().gate(g); };
    S.pin  = function pin()   { return new ComputationOptions().pin();   };

    function signalToJSON() {
        return this();
    }

    S.collector = function collector() {
        var running = false,
            nodes = [],
            nodeIndex = {};

        collector.go = go;

        return collector;

        function collector(node) {
            if (!running && !nodeIndex[node.id]) {
                nodes.push(node);
                nodeIndex[node.id] = node;
            }
            return running;
        }

        function go() {
            var i, oldNode;

            running = true;

            i = -1;
            while (++i < nodes.length) {
                mark(nodes[i]);
            }

            oldNode = UpdatingNode, UpdatingNode = null;

            i = -1;
            try {
                while (++i < nodes.length) {
                    update(nodes[i], nodes[i]);
                }
            } catch (ex) {
                i--;
                while (++i < nodes.length) {
                    reset(nodes[i]);
                }
                throw ex;
            } finally {
                UpdatingNode = oldNode;
                running = false;
            }

            nodes = [];
            nodeIndex = {};
        }
    };

    S.throttle = function throttle(t) {
        var col = S.collector(),
            last = 0;

        return function throttle(emitter) {
            var now = Date.now();

            col(emitter);

            if ((now - last) > t) {
                last = now;
                col.go();
            } else {
                setTimeout(function throttled() {
                    last = Date.now();
                    col.go();
                }, t - (now - last));
            }
        };
    };
        
    S.debounce = function debounce(t) {
        var col = S.collector(),
            last = 0,
            tout = 0;

        return function debounce(node) {
            var now = Date.now();

            col(node);

            if (now > last) {
                last = now;
                if (tout) clearTimeout(tout);

                tout = setTimeout(col.go, t);
            }
        };
    };
        
    S.peek = function peek(fn) {
        if (UpdatingNode && UpdatingNode.payload && UpdatingNode.payload.listening) {
            UpdatingNode.payload.listening = false;

            try {
                return fn();
            } finally {
                if (UpdatingNode.payload) UpdatingNode.payload.listening = true;
            }
        } else {
            return fn();
        }
    };

    S.cleanup = function cleanup(fn) {
        if (UpdatingNode && UpdatingNode.payload) {
            UpdatingNode.payload.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.computation.  Cannot call it at toplevel.");
        }
    };

    S.freeze = function freeze(fn) {
        if (Freezing) {
            fn();
        } else {
            var freeze = Freezing = S.collector();

            try {
                fn();
            } finally {
                Freezing = null;
            }

            freeze.go();
        }
    };

    /// Graph classes and operations
    function Node(id, payload, gate) {
        this.id = id;
        this.payload = payload;
        this.gate = gate;

        this.marks = 0;
        this.trigger = null;
        this.cur = 0;

        this.inbound = [];
        this.inboundIndex = [];
        this.outbound = [];
        this.outboundGen = 0;
    }

    function Edge(from, to, boundary) {
        this.from = from;
        this.to = to;
        this.boundary = boundary;

        this.active = true;
        this.marked = false;
        this.gen = to.payload.gen;

        this.outboundOffset = from.outbound.length;
        this.outboundGen = from.outboundGend;

        from.outbound.push(this);
        to.inbound.push(this);
        to.inboundIndex[from.id] = this;
    }

    function Payload(fn) {
        this.fn = fn;

        this.gen = 1;
        this.value = undefined;

        this.listening = true;
        this.pinning = false;

        this.cleanups = [];
        this.finalizers = [];
    }

    function addEdge(from) {
        var to = UpdatingNode,
            edge = null;

        if (to && to.payload && to.payload.listening) {
            edge = to.inboundIndex[from.id];
            if (edge) activate(edge, from);
            else new Edge(from, to, to.gate && from.gate !== to.gate);
        }
    }

    /// mark the node and all downstream nodes as within the range to be updated
    function mark(node) {
        node.trigger = node;

        var i = -1, len = node.outbound.length, edge, to;
        while (++i < len) {
            edge = node.outbound[i];
            if (edge && !edge.marked && (!edge.boundary || edge.to.gate(edge.to))) {
                to = edge.to;

                if (to.trigger)
                    throw new Error("circular dependency"); // TODO: more helpful reporting

                edge.marked = true;
                to.marks++;

                // if this is the first time node's been marked, then propagate
                if (to.marks === 1) {
                    mark(to);
                }
            }
        }

        node.trigger = null;
    }

    /// update the given node by re-executing any payload, updating inbound links, then updating all downstream nodes
    function update(node, trigger) {
        var i, len, edge, to, payload, live, clean, cleanIndex;

        node.trigger = trigger;

        if (node.payload) {
            payload = node.payload;

            UpdatingNode = node;

            cleanup(payload);

            if (node.payload) {
                payload.gen++;

                payload.value = payload.fn();

                if (payload.listening && node.inbound) {
                    i = -1, len = node.inbound.length, live = 0;
                    while (++i < len) {
                        edge = node.inbound[i];
                        if (edge.active) {
                            if (edge.gen < payload.gen) {
                                deactivate(edge);
                            } else {
                                live++;
                            }
                        }
                    }
                    
                    if (len / live > 4) {
                        i = -1, clean = [], cleanIndex = [];
                        while (++i < len) {
                            edge = node.inbound[i];
                            if (edge.active) {
                                clean.push(edge);
                                cleanIndex[edge.from.id] = edge;
                            }
                        }
                        node.inbound = clean;
                        node.inboundIndex = cleanIndex;
                    }
                }
            }
        }

        node.cur = -1, len = node.outbound ? node.outbound.length : 0, live = 0;
        while (++node.cur < len) {
            edge = node.outbound[node.cur];
            if (edge) {
                live++;
                if (edge.marked) {
                    to = edge.to;
    
                    edge.marked = false;
                    to.marks--;
    
                    if (to.marks === 0) {
                        update(to, node);
                    }
                }
            }
        }
        
        if (len / live > 4) {
            node.outboundGen++;
            i = -1, clean = [];
            while (++i < len) {
                edge = node.outbound[i];
                if (edge) {
                    edge.outboundOffset = clean.length;
                    edge.outboundGen = node.outboundGen;
                    clean.push(edge);
                }
            }
            node.outbound = clean;
        }

        node.trigger = null;
    }

    /// update the given node by backtracking its dependencies to clean state and updating from there
    function backtrack(node, orig) {
        var i = -1, len = node.inbound.length, edge, oldNode;
        while (++i < len) {
            edge = node.inbound[i];
            if (edge && edge.marked) {
                if (edge.from.marked) {
                    // keep working backwards through the marked nodes ...
                    backtrack(edge.from, orig);
                } else {
                    // ... until we find clean state, from which to start updating
                    oldNode = UpdatingNode;
                    update(edge.from, orig);
                    UpdatingNode = oldNode;
                }
            }
        }
    }

    /// reset the given node and all downstream nodes to initial state: unmarked, not hot
    function reset(node) {
        node.marks = 0;
        node.trigger = null;
        node.cur = 0;

        var i = -1, len = node.outbound.length, edge;
        while (++i < len) {
            edge = node.outbound[i];
            if (edge && (edge.marked || edge.to.trigger)) {
                edge.marked = false;
                reset(edge.to);
            }
        }
    }

    function finishUpdate(node) {
        var len, edge, to;
        while (node !== node.trigger && (node = node.trigger)) {
            len = node.outbound.length;
            while (++node.cur < len) {
                edge = node.outbound[node.cur];
                if (edge && edge.marked) {
                    to = edge.to;

                    edge.marked = false;
                    to.marks--;

                    if (to.marks === 0) {
                        update(to, node);
                    }
                }
            }
        }
    }

    function cleanup(payload) {
        var i = -1, fns = payload.cleanups, len = fns.length;
        payload.cleanups = [];
        while (++i < len) {
            fns[i]();
        }
    }

    function activate(edge, from) {
        if (!edge.active) {
            edge.active = true;
            if (edge.outboundGen === from.outboundGen) {
                from.outbound[edge.outboundOffset] = edge;
            } else {
                edge.outboundGen = from.outboundGen;
                edge.outboundOffset = from.outbound.length;
                from.outbound.push(edge);
            }
            edge.from = from;
        }
        edge.gen = edge.to.payload.gen;
    }

    function deactivate(edge) {
        if (!edge.active) return;
        edge.active = false;
        if (edge.from.outbound) edge.from.outbound[edge.outboundOffset] = null;
        edge.from = null;
    }
})();
