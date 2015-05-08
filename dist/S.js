(function (package) {
    // nano-implementation of require.js-like define(name, deps, impl) for internal use
    var definitions = {};

    package(function define(name, deps, fn) {
        if (definitions.hasOwnProperty(name)) throw new Error("define: cannot redefine module " + name);
        definitions[name] = fn.apply(null, deps.map(function (dep) {
            if (!definitions.hasOwnProperty(dep)) throw new Error("define: module " + dep + " required by " + name + " has not been defined.");
            return definitions[dep];
        }));
    });

    if (typeof module === 'object' && typeof module.exports === 'object') module.exports = definitions.S; // CommonJS
    else if (typeof define === 'function') define([], function () { return definitions.S; }); // AMD
    else this.S = definitions.S; // fallback to global object

})(function (define) {
    "use strict";

define('graph', [], function () {
    function Graph() {
        this.nodeCount = 0;
        this.updatingNode = null;
        this.freezeChangeset = null;
    }

    Graph.prototype = {
        reportChange: function reportChange(emitter) {
            if (this.freezeChangeset) {
                this.freezeChangeset.add(emitter);
                return;
            }

            emitter.damage();

            var oldNode = this.updatingNode;
            this.updatingNode = null;
            try {
                emitter.repair();
            } catch (ex) {
                emitter.reset();
                throw ex;
            } finally {
                this.updatingNode = oldNode;
            }
        },

        backtrack: function backtrack(node) {
            var oldNode = this.updatingNode;

            var i = -1, len = node.inbound.length, edge;
            while (++i < len) {
                edge = node.inbound[i];
                if (edge && edge.damaged) {
                    if (edge.from.node && edge.from.node.damage) {
                        // keep working backwards through the damage ...
                        backtrack(edge.from.node);
                    } else {
                        // ... until we find clean state, from which to send repair
                        edge.from.repair();
                    }
                }
            }

            this.currentNode = oldNode;
        },

        freeze: function freeze(fn) {
            if (this.freezeChangeset) {
                fn();
                return;
            }

            var collector = this.freezeChangeset = new Changeset();

            try {
                fn();
            } finally {
                this.freezeChangeset = null;
            }

            this.applyChangeset(collector);
        },

        addEdge: function addEdge(from) {
            var to = this.updatingNode,
                edge = null;

            if (to && to.listening) {
                edge = to.inboundIndex[from.id];
                if (!edge) edge = new Edge(from, to, to.emitter.region && from.region !== to.emitter.region);
                else edge.activate(from);
            }
        },

        addEntryPoint: function addEntryPoint() {
            return new Emitter(this, null, this.updatingNode ? this.updatingNode.emitter.region : null);
        },

        addNode: function addNode(payload, options, dispose) {
            var oldNode = this.updatingNode,
                region = options.region || (oldNode && oldNode.emitter.region) || null,
                node = new Node(this, payload, region),
                i, len;

            this.updatingNode = node;

            if (options.sources) {
                i = -1, len = options.sources.length;
                while (++i < len) options.sources[i]();
                node.listening = false;
            }

            if (oldNode) {
                if (oldNode.pinning || options.pin) oldNode.finalizers.push(dispose);
                else oldNode.cleanups.push(dispose);
            }

            node.emitter.active = true;
            try {
                node.value = payload();
            } catch (ex) {
                node.emitter.reset();
                throw ex;
            } finally {
                node.emitter.active = false;
                this.updatingNode = oldNode;
            }

            return node;
        },

        addChangeset: function addChangeset() {
            return new Changeset();
        },

        flushChangeset: function flushChangeset(cs) {
            var i, emitter, oldNode;

            i = -1;
            while (++i < cs.emitters.length) {
                cs.emitters[i].damage();
            }

            oldNode = this.updatingNode, this.updatingNode = null;

            i = -1;
            try {
                while (++i < cs.emitters.length) {
                    emitter = cs.emitters[i];
                    if (emitter.node) emitter.node.update();
                    emitter.repair();
                }
            } catch (ex) {
                i--;
                while (++i < cs.emitters.length) {
                    cs.emitters[i].reset();
                }
                throw ex;
            } finally {
                this.updatingNode = oldNode;
            }

            cs.emitters = [];
            cs.emitterIndex = {};
        }
    };

    function Emitter(graph, node, region) {
        this.id = ++graph.nodeCount;
        this.node = node;
        this.region = region;

        this.active = false;
        this.outbound = [];
    }

    Emitter.prototype = {
        damage: function damage() {
            this.active = true;

            var i = -1, len = this.outbound.length, edge, to;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && !edge.damaged && (!edge.boundary || edge.to.emitter.region(edge.to.emitter))) {
                    to = edge.to;

                    if (to.emitter.active)
                        throw new Error("circular dependency"); // TODO: more helpful reporting

                    edge.damaged = true;
                    to.damage++;

                    // if this is the first time node's been dirtied, then propagate
                    if (to.damage === 1) {
                        to.emitter.damage();
                    }
                }
            }

            this.active = false;
        },

        repair: function repair() {
            this.active = true;

            var i = -1, len = this.outbound.length, edge, to;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.damaged) {
                    to = edge.to;

                    edge.damaged = false;
                    to.damage--;

                    // if node's inbound edges are now clean, update and propagate
                    if (to.damage === 0) {
                        to.update();
                        if (to.emitter) to.emitter.repair();
                    }
                }
            }

            this.active = false;
        },

        reset: function reset() {
            this.active = false;

            var i = -1, len = this.outbound.length, edge, to;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.damaged) {
                    to = edge.to;
                    edge.damaged = false;
                    to.damage = 0;

                    to.emitter.reset();
                }
            }
        },

        dispose: function () {
            this.node = null;
            this.outbound = null;
        }
    };

    function Node(graph, payload, region) {
        this.graph = graph;
        this.payload = payload;

        this.emitter = new Emitter(graph, this, region);

        this.value = undefined;
        this.gen = 1;
        this.damage = 0;

        this.listening = true;
        this.pinning = false;

        this.inbound = [];
        this.inboundIndex = [];

        this.cleanups = [];
        this.finalizers = [];
    }

    Node.prototype = {
        update: function update() {
            var i, len, edge;

            this.graph.updatingNode = this;

            this.cleanup();

            this.gen++;

            this.value = this.payload();

            if (this.listening && this.inbound) {
                // deactivate any edges that weren't refreshed
                i = -1, len = this.inbound.length;
                while (++i < len) {
                    edge = this.inbound[i];
                    if (edge.active && edge.gen < this.gen) {
                        edge.deactivate();
                    }
                }
            }
        },

        cleanup: function cleanup() {
            var i = -1, len = this.cleanups.length;
            while (++i < len) {
                this.cleanups[i]();
            }
            this.cleanups = [];
        },

        dispose: function dispose() {
            var i, len;

            this.cleanup();

            i = -1, len = this.finalizers.length;
            while (++i < len) {
                this.finalizers[i]();
            }

            i = -1, len = this.inbound.length;
            while (++i < len) {
                this.inbound[i].deactivate();
            }

            this.graph = null;
            this.payload = null;
            this.inbound = null;
            this.inboundIndex = null;
            this.cleanups = null;
            this.finalizers = null;

            this.emitter.dispose();
            this.emitter = null;
        }
    };

    function Edge(from, to, boundary) {
        this.from = from;
        this.to = to;
        this.boundary = boundary;

        this.active = true;
        this.damaged = false;
        this.gen = to.gen;

        this.outboundOffset = from.outbound.length;

        from.outbound.push(this);
        to.inbound.push(this);
        to.inboundIndex[from.id] = this;
    }

    Edge.prototype = {
        activate: function activateEdge(from) {
            if (!this.active) {
                this.active = true;
                from.outbound[this.outboundOffset] = this;
                this.from = from;
            }
            this.gen = this.to.gen;
        },

        deactivate: function deactivateEdge() {
            if (this.active) {
                this.active = false;
                if (this.from.outbound) this.from.outbound[this.outboundOffset] = null;
                this.from = null;
            }
        }
    };

    function Changeset() {
        this.emitters = [],
        this.emitterIndex = {};
    }

    Changeset.prototype = {
        add: function add(emitter) {
            if (!this.emitterIndex[emitter.id]) {
                this.emitters.push(emitter);
                this.emitterIndex[emitter.id] = emitter;
            }
        }
    };

    return Graph;
});

define('core', ['graph'], function (Graph) {
    var graph = new Graph();

    return {
        data:           data,
        FormulaOptions: FormulaOptions,
        formula:        formula,
        region:         region,
        freeze:         freeze,
        peek:           peek,
        pin:            pin,
        cleanup:        cleanup,
        finalize:       finalize
    }

    function data(value) {
        var entry = graph.addEntryPoint(null, null);

        data.toJSON = signalToJSON;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                value = newValue;
                graph.reportChange(entry);
            } else {
                graph.addEdge(entry);
            }
            return value;
        }
    }

    function FormulaOptions() {
        this.sources = null;
        this.pin     = false;
        this.region  = null;
    }

    function formula(fn, options) {
        var node = graph.addNode(fn, options, dispose);

        formula.dispose = dispose;
        //formula.toString = toString;
        formula.toJSON = signalToJSON;

        return formula;

        function formula() {
            if (!node) return;
            graph.addEdge(node.emitter);
            if (node.damage !== 0) graph.backtrack(node);
            return node.value;
        }

        function dispose() {
            if (!node) return;
            node.dispose();
            node = undefined;
        }

        //function toString() {
        //    return "[formula: " + (value !== undefined ? value + " - " : "") + fn + "]";
        //}
    }

    function signalToJSON() {
        return this();
    }

    function region() {
        var cs = graph.addChangeset();

        region.go = go;

        return region;

        function region(emitter) {
            cs.add(emitter);
        }

        function go() {
            graph.flushChangeset(cs);
        }
    }

    function peek(fn) {
        if (graph.updatingNode && graph.updatingNode.listening) {
            graph.updatingNode.listening = false;

            try {
                return fn();
            } finally {
                graph.updatingNode.listening = true;
            }
        } else {
            return fn();
        }
    }

    function pin(fn) {
        if (graph.updatingNode && !graph.updatingNode.pinning) {
            graph.updatingNode.pinning = true;

            try {
                return fn();
            } finally {
                graph.updatingNode.pinning = false;
            }
        } else {
            return fn();
        }
    }

    function freeze(fn) {
        graph.freeze(fn);
    }

    function cleanup(fn) {
        if (graph.updatingNode) {
            graph.updatingNode.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    function finalize(fn) {
        if (graph.updatingNode) {
            graph.updatingNode.finalizers.push(fn);
        } else {
            throw new Error("S.finalize() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }
});

define('schedulers', ['core'], function (core) {

    return {
        pause:    pause,
        throttle: throttle,
        debounce: debounce,
        when:     when
    };

    function pause(region) {
        return region;
    }

    function throttle(t) {
        var region = core.region(),
            last = 0,
            scheduled = false;

        return function throttle(emitter) {
            var now = Date.now();

            region(emitter);

            if ((now - last) > t) {
                last = now;
                region.go();
            } else {
                setTimeout(function throttled() {
                    last = Date.now();
                    region.go();
                }, t - (now - last));
            }
        };
    }

    function debounce(t) {
        var region = core.region(),
            last = 0,
            tout = 0;

        return function debounce(emitter) {
            var now = Date.now();

            region(emitter);

            if (now > last) {
                last = now;
                if (tout) clearTimeout(tout);

                tout = setTimeout(region.go, t);
            }
        };
    }

    function when(preds) {
        var len = preds.length;
        return function when() {
            var i = -1;
            while (++i < len) {
                if (preds[i]() === undefined) return false;
            }
            return true;
        }
    }
});

define('options', ['core', 'schedulers'], function (core, schedulers) {

    function FormulaOptionsBuilder() {
        this.options = new core.FormulaOptions();
    }

    FormulaOptionsBuilder.prototype = {
        on: function (l) {
            l = !l ? [] : !Array.isArray(l) ? [l] : l;
            this.options.sources = maybeConcat(this.options.sources, l);
            return this;
        },
        once: function () {
            this.options.sources = [];
            return this;
        },
        pin: function () {
            this.options.pin = true;
            return this;
        },
        when: function (l) {
            l = !l ? [] : !Array.isArray(l) ? [l] : l;
            this.options.sources = maybeConcat(this.options.sources, l);
            this.options.region = schedulers.when(l);
            return this;
        },
        defer: function () { return this; }
    };

    // add methods for schedulers
    'throttle debounce pause'.split(' ').map(function (method) {
        FormulaOptionsBuilder.prototype[method] = function (v) {
            this.options.region = schedulers[method](v);
            return this;
        };
    });

    return {
        FormulaOptionsBuilder: FormulaOptionsBuilder
    };

    function maybeConcat(a, b) { return a ? a.concat(b) : b; }
});

define('misc', [], function () {
    return {
        proxy: proxy
    };

    function proxy(getter, setter) {
        return function proxy(value) {
            if (arguments.length !== 0) setter(value);
            return getter();
        };
    }
});

define('S', ['core', 'options', 'schedulers', 'misc'], function (core, options, schedulers, misc) {
    // build our top-level object S
    function S(fn /*, ...args */) {
        var _fn, _args;
        if (arguments.length > 1) {
            _fn = fn;
            _args = Array.prototype.slice.call(arguments, 1);
            fn = function () { return _fn.apply(null, _args); };
        }

        return core.formula(fn, new core.FormulaOptions());
    }

    S.data      = core.data;
    S.region    = core.region;
    S.peek      = core.peek;
    S.cleanup   = core.cleanup;
    S.finalize  = core.finalize;

    // add methods to S for formula options builder
    'on once when throttle debounce pause defer'.split(' ').map(function (method) {
        S[method] = function (v) { return new options.FormulaOptionsBuilder()[method](v); };
    });

    // S.pin is either an option for a formula being created or the marker of a region where all subs are pinned
    S.pin = function pin(fn) {
        if (arguments.length === 0) {
            return new options.FormulaOptionsBuilder().pin();
        } else {
            core.pin(fn);
        }
    }

    // enable creation of formula from options builder
    options.FormulaOptionsBuilder.prototype.S = function S(fn /*, args */) {
        var _fn, _args;
        if (arguments.length > 1) {
            _fn = fn;
            _args = Array.prototype.slice.call(arguments, 1);
            fn = function () { return _fn.apply(null, _args); };
        }

        return core.formula(fn, this.options);
    }

    S.proxy = misc.proxy;

    return S;
})

});
