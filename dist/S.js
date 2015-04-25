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
        this.deferredEmitters = null;
    }

    Graph.prototype = {
        reportChange: function reportChange(emitter) {
            if (this.deferredEmitters) {
                this.deferredEmitters.push(emitter);
                return;
            }

            emitter.emitDirty();
            var oldNode = this.updatingNode;
            this.updatingNode = null;
            try {
                emitter.emitUpdate();
            } finally {
                this.updatingNode = oldNode;
            }
        },

        freeze: function freeze(fn) {
            var emitters, oldNode, i, len;

            if (this.deferredEmitters) {
                fn();
                return;
            }

            this.deferredEmitters = emitters = [];

            try {
                fn();
            } finally {
                this.deferredEmitters = null;
            }

            i = -1, len = emitters.length;
            while (++i < len) emitters[i].emitDirty();

            oldNode = this.updatingNode, this.updatingNode = null;

            i = -1;
            try {
                while (++i < len) emitters[i].emitUpdate();
            } finally {
                this.updatingNode = oldNode;
            }
        },

        addEdge: function addEdge(from) {
            var to = this.updatingNode,
                edge = null;

            if (to && to.listening) {
                edge = to.inboundIndex[from.id];
                if (!edge) edge = new Edge(from, to);
                else edge.activate(from);
            }
        },

        addEntryPoint: function addEntryPoint() {
            return new Emitter(this, null);
        },

        addNode: function addNode(payload, options, dispose) {
            var node = new Node(this, payload, options),
                i, len, oldNode;

            oldNode = this.updatingNode, this.updatingNode = node;

            if (options.sources) {
                i = -1, len = options.sources.length;
                while (++i < len) options.sources[i]();
                this.listening = false;
            }

            if (oldNode) {
                if (oldNode.pinning || options.pin) oldNode.finalizers.push(dispose);
                else oldNode.cleanups.push(dispose);
            }

            node.updating = true;
            try {
                node.value = payload();
            } finally {
                node.updating = false;
                this.updatingNode = oldNode;
            }

            return node;
        }
    };

    function Emitter(graph, node) {
        this.id = ++graph.nodeCount;
        this.node = node;
        this.outbound = [];
    }

    Emitter.prototype = {
        emitDirty: function emitDirty() {
            var i = -1, len = this.outbound.length, outbound;
            while (++i < len) {
                outbound = this.outbound[i];
                if (outbound) {
                    outbound.to.markDirty(outbound);
                }
            }
        },

        emitUpdate: function emitupdate() {
            var i = -1, len = this.outbound.length, outbound;
            while (++i < len) {
                outbound = this.outbound[i];
                if (outbound) {
                    outbound.to.update();
                }
            }
        },

        dispose: function () {
            this.node = null;
            this.outbound = null;
        }
    };

    function Node(graph, payload, options) {
        this.graph = graph;
        this.payload = payload;
        this.emitter = new Emitter(graph, this);

        this.value = undefined;
        this.gen = 1;
        this.dirty = 0;

        this.dirtying = false;
        this.updating = false;
        this.listening = true;
        this.pinning = false;

        this.inbound = [];
        this.inboundIndex = [];

        this.cleanups = [];
        this.finalizers = [];
    }

    Node.prototype = {
        markDirty: function markDirty(inbound) {
            // deactivate circular edges
            if (this.dirtying) {
                inbound.deactivate();
            } else if (++this.dirty === 1) {
                this.dirtying = true;
                this.emitter.emitDirty();
                this.dirtying = false;
            }
        },

        update: function update() {
            var i, len, outbound, edge;
            this.dirty--;
            if (this.dirty === 0 && !this.updating) {
                this.graph.updatingNode = this;

                this.cleanup();

                this.gen++;
                this.updating = true;
                this.value = this.payload();
                this.updating = false;

                if (this.listening) {
                    i = -1, len = this.inbound.length;
                    while (++i < len) {
                        edge = this.inbound[i];
                        if (edge.active && edge.gen < this.gen) {
                            edge.deactivate();
                        }
                    }
                }

                this.emitter.emitUpdate();
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
        }
    };

    function Edge(from, to) {
        this.from = from;
        this.to = to;
        this.active = true;
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
                this.from.outbound[this.outboundOffset] = null;
                this.from = null;
            }
        }
    };

    function Source(os) {
        this.id = os.count++;
        this.lineage = os.target ? os.target.lineage : [];

        this.updates = [];
    }

    Source.prototype = {
        propagate: function propagate() {
            var i,
                update,
                updates = this.updates,
                len = updates.length;

            for (i = 0; i < len; i++) {
                update = updates[i];
                if (update) update();
            }
        },
        dispose: function () {
            this.lineage = null;
            this.updates.length = 0;
        }
    };

    function Target(update, options, os) {
        var i, ancestor, oldTarget;

        this.lineage = os.target ? os.target.lineage.slice(0) : [];
        this.lineage.push(this);
        this.scheduler = options.update;

        this.listening = true;
        this.pinning = options.pinning || false;
        this.locked = true;

        this.gen = 1;
        this.dependencies = [];
        this.dependenciesIndex = {};

        this.cleanups = [];
        this.finalizers = [];

        this.updaters = new Array(this.lineage.length + 1);
        this.updaters[this.lineage.length] = update;

        for (i = this.lineage.length - 1; i >= 0; i--) {
            ancestor = this.lineage[i];
            if (ancestor.scheduler) update = ancestor.scheduler(update);
            this.updaters[i] = update;
        }

        if (options.sources) {
            oldTarget = os.target, os.target = this;
            this.locked = false;
            try {
                for (i = 0; i < options.sources.length; i++)
                    options.sources[i]();
            } finally {
                this.locked = true;
                os.target = oldTarget;
            }

            this.listening = false;
        }
    }

    Target.prototype = {
        beginUpdate: function beginUpdate() {
            this.cleanup();
            this.gen++;
        },
        endUpdate: function endUpdate() {
            if (!this.listening) return;

            var i, dep;

            for (i = 0; i < this.dependencies.length; i++) {
                dep = this.dependencies[i];
                if (dep.active && dep.gen < this.gen) {
                    dep.deactivate();
                }
            }
        },
        addSubformula: function addSubformula(dispose, pin) {
            if (this.locked)
                throw new Error("Cannot create a new subformula except while updating the parent");
            ((pin || this.pinning) ? this.finalizers : this.cleanups).push(dispose);
        },
        addSource: function addSource(src) {
            if (!this.listening || this.locked) return;

            var dep = this.dependenciesIndex[src.id];

            if (dep) {
                dep.activate(this.gen, src);
            } else {
                new Dependency(this, src);
            }
        },
        cleanup: function cleanup() {
            for (var i = 0; i < this.cleanups.length; i++) {
                this.cleanups[i]();
            }
            this.cleanups = [];
        },
        dispose: function dispose() {
            var i;

            this.cleanup();

            for (i = 0; i < this.finalizers.length; i++) {
                this.finalizers[i]();
            }

            for (i = this.dependencies.length - 1; i >= 0; i--) {
                this.dependencies[i].deactivate();
            }

            this.lineage = null;
            this.scheduler = null;
            this.updaters = null;
            this.cleanups = null;
            this.finalizers = null;
            this.dependencies = null;
            this.dependenciesIndex = null;
        }
    };

    function Dependency(target, src) {
        this.active = true;
        this.gen = target.gen;
        this.updates = src.updates;
        this.offset = src.updates.length;

        // set i to the point where the lineages diverge
        for (var i = 0, len = Math.min(target.lineage.length, src.lineage.length);
            i < len && target.lineage[i] === src.lineage[i];
            i++);

        //for (var i = 0; i < target.lineage.length && i < src.lineage.length && target.lineage[i] === src.lineage[i]; i++);

        this.update = target.updaters[i];
        this.updates.push(this.update);

        target.dependencies.push(this);
        target.dependenciesIndex[src.id] = this;
    }

    Dependency.prototype = {
        activate: function activate(gen, src) {
            if (!this.active) {
                this.active = true;
                this.updates = src.updates;
                this.updates[this.offset] = this.update;
            }
            this.gen = gen;
        },
        deactivate: function deactivate() {
            if (this.active) {
                this.updates[this.offset] = null;
                this.updates = null;
            }
            this.active = false;
        }
    };

    return {
        Graph: Graph,
        Node: Node,
        Edge: Edge
    };
});

define('core', ['graph'], function (graph) {
    var graph = new graph.Graph();

    return {
        data:           data,
        FormulaOptions: FormulaOptions,
        formula:        formula,
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
        this.update  = null;
        this.init    = null;
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
        stop:     stop,
        pause:    pause,
        defer:    defer,
        throttle: throttle,
        debounce: debounce,
        stopsign: stopsign,
        when:     when
    };

    function stop(update) {
        return function stopped() { }
    }

    function pause(collector) {
        return function (update) {
            var scheduled = false;

            return function paused() {
                if (scheduled) return;
                scheduled = true;

                collector(function resume() {
                    scheduled = false;
                    update();
                });
            }
        };
    }

    function defer(fn) {
        return pause(core.defer);
    }

    function throttle(t) {
        return function throttle(update) {
            var last = 0,
            scheduled = false;

            return function throttle() {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) > t) {
                    last = now;
                    update();
                } else {
                    scheduled = true;
                    setTimeout(function throttled() {
                        last = Date.now();
                        scheduled = false;
                        update();
                    }, t - (now - last));
                }
            };
        };
    }

    function debounce(t) {
        return function (update) {
            var last = 0,
                tout = 0;

            return function () {
                var now = Date.now();

                if (now > last) {
                    last = now;
                    if (tout) clearTimeout(tout);

                    tout = setTimeout(function debounce() { update(); }, t);
                }
            };
        };
    }

    function stopsign() {
        var updates = [];

        collector.go = go;

        return collector;

        function collector(update) {
            updates.push(update);
        }

        function go() {
            for (var i = 0; i < updates.length; i++) {
                updates[i]();
            }
            updates = [];
        }
    }

    function when(preds) {
        return function when(update) {
            for (var i = 0; i < preds.length; i++) {
                if (preds[i]() === undefined) return;
            }
            update();
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
            var scheduler = schedulers.pause(schedulers.when(l));
            composeInit(this, scheduler);
            composeUpdate(this, scheduler);
            return this;
        }
    };

    // add methods for schedulers
    'defer throttle debounce pause'.split(' ').map(function (method) {
        FormulaOptionsBuilder.prototype[method] = function (v) { composeUpdate(this, schedulers[method](v)); return this; };
    });

    return {
        FormulaOptionsBuilder: FormulaOptionsBuilder
    };

    function maybeCompose(f, g) { return g ? function compose() { return f(g()); } : f; }
    function maybeConcat(a, b) { return a ? a.concat(b) : b; }
    function composeUpdate(b, fn) { b.options.update = maybeCompose(fn, b.options.update); }
    function composeInit(b, fn) { b.options.init = maybeCompose(fn, b.options.init); }
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
    S.peek      = core.peek;
    S.cleanup   = core.cleanup;
    S.finalize  = core.finalize;

    // add methods to S for formula options builder
    'on once when defer throttle debounce pause'.split(' ').map(function (method) {
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

    S.stopsign = schedulers.stopsign;

    S.proxy = misc.proxy;

    return S;
})

});
