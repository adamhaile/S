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

define('Source', [], function () {
    function Source(env) {
        this.id = env.count++;
        this.lineage = env.ctx ? env.ctx.lineage : [];

        this.updates = [];
    }

    Source.prototype = {
        propagate: function propagate() {
            var i, u, us = this.updates;

            for (i = 0; i < us.length; i++) {
                u = us[i];
                if (u) u();
            }
        }
    };

    return Source;
});

define('Dependency', [], function () {

    function Dependency(ctx, src) {
        this.active = true;
        this.gen = ctx.gen;
        this.updates = src.updates;
        this.offset = src.updates.length;

        // set i to the point where the lineages diverge
        for (var i = 0, len = Math.min(ctx.lineage.length, src.lineage.length);
            i < len && ctx.lineage[i] === src.lineage[i];
            i++);

        this.update = ctx.updaters[i];
        this.updates.push(this.update);

        ctx.dependencies.push(this);
        ctx.dependenciesIndex[src.id] = this;
    }

    Dependency.prototype = {
        activate: function activate(gen) {
            if (!this.active) {
                this.active = true;
                this.updates[this.offset] = this.update;
            }
            this.gen = gen;
        },
        deactivate: function deactivate() {
            if (this.active) {
                this.updates[this.offset] = null;
            }
            this.active = false;
        }
    };

    return Dependency;
});

define('Context', ['Dependency'], function (Dependency) {

    function Context(update, options, env) {
        var i, l;

        this.lineage = env.ctx ? env.ctx.lineage.slice(0) : [];
        this.lineage.push(this);
        this.mod = options.update;
        this.updaters = [];

        for (i = this.lineage.length - 1; i >= 0; i--) {
            l = this.lineage[i];
            if (l.mod) update = l.mod(update);
            this.updaters[i] = update;
        }

        this.updating = false;
        this.listening = true;
        this.gen = 1;
        this.dependencies = [];
        this.dependenciesIndex = {};
        this.cleanups = [];
        this.finalizers = [];

        if (options.sources) {
            env.runInContext(function () {
                for (var i = 0; i < options.sources.length; i++)
                    options.sources[i]();
            }, this);

            this.listening = false;
        }
    }

    Context.prototype = {
        beginUpdate: function beginUpdate() {
            this.cleanup();
            this.gen++;
            this.updating = true;
        },
        endUpdate: function endUpdate() {
            this.updating = false;

            if (!this.listening) return;

            var i, dep;

            for (i = 0; i < this.dependencies.length; i++) {
                dep = this.dependencies[i];
                if (dep.active && dep.gen < this.gen) {
                    dep.deactivate();
                }
            }
        },
        addSource: function addSource(src) {
            if (!this.listening) return;

            var dep = this.dependenciesIndex[src.id];

            if (dep) {
                dep.activate(this.gen);
            } else {
                new Dependency(this, src);
            }
        },
        addChild: function addChild(fn) {
            this.cleanups.push(fn);
        },
        cleanup: function cleanup() {
            for (var i = 0; i < this.cleanups.length; i++) {
                this.cleanups[i]();
            }
            this.cleanups = [];
        },
        dispose: function dispose() {
            var i;

            for (i = 0; i < this.finalizers.length; i++) {
                this.finalizers[i]();
            }
            for (i = this.dependencies.length - 1; i >= 0; i--) {
                this.dependencies[i].deactivate();
            }
        }
    };

    return Context;
});

define('Environment', [], function () {

    function Environment() {
        this.count = 1;
        this.ctx = null;
        this.deferred = [];
    }

    Environment.prototype = {
        runInContext: function runInContext(fn, ctx) {
            if (ctx.updating) return;

            var oldCtx;

            oldCtx = this.ctx, this.ctx = ctx;

            ctx.beginUpdate();

            try {
                return fn();
            } finally {
                ctx.endUpdate();
                this.ctx = oldCtx;
            }
        },
        runWithoutListening: function runWithoutListening(fn) {
            var oldListening;

            if (this.ctx) oldListening = this.ctx.listening, this.ctx.listening = false;

            try {
                return fn();
            } finally {
                if (this.ctx) this.ctx.listening = oldListening;
            }
        },
        runDeferred: function runDeferred() {
            if (this.ctx) return;
            while (this.deferred.length !== 0) {
                this.deferred.shift()();
            }
        }
    };

    return Environment;
});

define('S', ['Environment', 'Source', 'Context'], function (Environment, Source, Context) {
    var env = new Environment();

    // initializer
    S.lift     = lift;

    S.data    = data;
    S.formula = formula;
    S.peek    = peek;
    S.defer   = defer;
    S.cleanup = cleanup;
    S.finalize = finalize;
    S.toJSON   = toJSON;

    S.data.S = DataCombinator;
    S.formula.S = FormulaCombinator;

    FormulaCombinator.prototype = new DataCombinator();

    return S;

    function S(arg1, arg2) {
        return S.lift(arg1, arg2);
    }

    function lift(arg1, arg2) {
        return typeof arg1 === 'function' ? formula(arg1, arg2)
            : arg1 instanceof Array ? S.seq(arg1)
            : data(arg1);
    }

    function data(value) {
        if (value === undefined) throw new Error("S.data can't be initialized with undefined.  In S, undefined is reserved for namespace lookup failures.");

        var src = new Source(env);

        data.S = new DataCombinator(data);
        data.toString = dataToString;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                if (newValue === undefined) throw new Error("S.data can't be set to undefined.  In S, undefined is reserved for namespace lookup failures.");
                value = newValue;
                src.propagate();
                env.runDeferred();
            } else {
                if (env.ctx) env.ctx.addSource(src);
            }
            return value;
        }
    }

    function formula(fn, options) {
        options = options || {};

        var src = new Source(env),
            ctx = new Context(update, options, env),
            value;

        if (env.ctx) env.ctx.addChild(dispose);

        formula.S = new FormulaCombinator(formula, dispose);
        formula.toString = toString;

        if (!options.skipFirst) update();

        env.runDeferred();

        return formula;

        function formula() {
            if (env.ctx) env.ctx.addSource(src);
            return value;
        }

        function update() {
            env.runInContext(_update, ctx);
        }

        function _update() {
            var newValue = fn();

            if (newValue !== undefined) {
                value = newValue;
                src.propagate();
            }
        }

        function dispose() {
            ctx.cleanup();
            ctx.dispose();
        }

        function toString() {
            return "[formula: " + (value !== undefined ? value + " - " : "")+ fn + "]";
        }
    }

    function DataCombinator(signal) {
        this.signal = signal;
    }

    function FormulaCombinator(formula, dispose) {
        DataCombinator.call(this, formula);
        this.dispose = dispose;
    }

    function dataToString() {
        return "[data: " + S.peek(this) + "]";
    }

    function peek(fn) {
        return env.runWithoutListening(fn);
    }

    function defer(fn) {
        if (env.ctx) {
            env.deferred.push(fn);
        } else {
            fn();
        }
    }

    function cleanup(fn) {
        if (env.ctx) {
            env.ctx.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    function finalize(fn) {
        if (env.ctx) {
            env.ctx.finalizers.push(fn);
        } else {
            throw new Error("S.finalize() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    function toJSON(o) {
        return JSON.stringify(o, function (k, v) {
            return (typeof v === 'function' && v.S) ? v() : v;
        });
    };
});

define('schedulers', ['S'], function (S) {

    var _S_defer = S.defer;

    return {
        defer: defer,
        delay: delay,
        throttle: throttle,
        debounce: debounce,
        pause: pause,
        throttledPause: throttledPause
    };

    function defer(fn) {
        if (fn !== undefined) return _S_defer(fn);

        return function (update, id) {
            var scheduled = false;

            return function deferred() {
                if (scheduled) return;

                scheduled = true;

                _S_defer(function deferred() {
                    scheduled = false;
                    update();
                });
            }
        };
    }

    function delay(t) {
        return function (update, id) {
            return function delayed() { setTimeout(update, t); }
        }
    }

    function throttle(t) {
        return function throttle(fn) {
            var last = 0,
            scheduled = false;

            return function () {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) > t) {
                    last = now;
                    fn();
                } else {
                    scheduled = true;
                    setTimeout(function throttled() {
                        last = Date.now();
                        scheduled = false;
                        fn();
                    }, t - (now - last));
                }
            };
        };
    }

    function debounce(t) {
        return function (fn) {
            var last = 0,
            tout = 0;

            return function () {
                var now = Date.now();

                if (now > last) {
                    last = now;
                    if (tout) clearTimeout(tout);

                    tout = setTimeout(fn, t);
                }
            };
        };
    }

    function pause(signal) {
        var fns = [];

        S.formula(function resume() {
            if (!signal()) return;

            for (var i = 0; i < fns.length; i++) {
                fns[i]();
            }

            fns = [];
        });

        return function (fn) {
            return function () {
                fns.push(fn);
            }
        }
    }

    function throttledPause(signal) {
        var fns = [];

        S.formula(function resume() {
            if (!signal()) return;

            for (var i = 0; i < fns.length; i++) {
                fns[i]();
            }

            fns = [];
        });

        return function (fn) {
            var scheduled = false;

            return function () {
                if (scheduled) return;

                scheduled = true;

                fns.push(function paused() {
                    scheduled = false;

                    fn();
                });
            }
        };
    }
});

define('FormulaOptionBuilder', ['S', 'schedulers'], function (S, schedulers) {

    var _S_defer = S.defer;

    S.on             = function ()  { return new FormulaOptionBuilder().on([].slice.call(arguments)); };
    S.once           = function ()  { return new FormulaOptionBuilder().once(); };
    S.defer          = function ()  { return new FormulaOptionBuilder().defer(); };
    S.delay          = function (t) { return new FormulaOptionBuilder().delay(t); };
    S.debounce       = function (t) { return new FormulaOptionBuilder().debounce(t); };
    S.throttle       = function (t) { return new FormulaOptionBuilder().throttle(t); };
    S.pause          = function (s) { return new FormulaOptionBuilder().pause(s); };
    S.throttledPause = function (s) { return new FormulaOptionBuilder().throttledPause(s); };

    function FormulaOptionBuilder() {
        this.options = {
            sources: null,
            update: null,
            skipFirst: false
        };
    }

    FormulaOptionBuilder.prototype = {
        S:              function (fn) { return S.formula(fn, this.options); },
        on:             function (s)  { this.options.sources = maybeAppend(this.options.sources, Array.isArray(s) ? s : [].slice.call(arguments)); return this; },
        once:           function ()   { this.options.sources = [];                         return this; },
        skipFirst:      function ()   { this.options.skipFirst = true;                     return this; },
        defer:          function ()   { composeUpdate(this, schedulers.defer());           return this; },
        delay:          function (t)  { composeUpdate(this, schedulers.delay(t));          return this; },
        debounce:       function (t)  { composeUpdate(this, schedulers.debounce(t));       return this; },
        throttle:       function (t)  { composeUpdate(this, schedulers.throttle(t));       return this; },
        pause:          function (s)  { composeUpdate(this, schedulers.pause(s));          return this; },
        throttledPause: function (s)  { composeUpdate(this, schedulers.throttledPause(s)); return this; },
    };

    return;

    function maybeCompose(f, g) { return g ? function compose(x) { return f(g(x)); } : f; }
    function maybeAppend(a, b) { return a ? a.concat(b) : b; }
    function composeUpdate(b, fn) { b.options.update = maybeCompose(fn, b.options.update); }
});

});
