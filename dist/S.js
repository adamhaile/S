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

        this.updating = false;
        this.listening = true;
        this.gen = 1;
        this.dependencies = [];
        this.dependenciesIndex = {};
        this.cleanups = [];
        this.finalizers = [];

        for (i = this.lineage.length - 1; i >= 0; i--) {
            l = this.lineage[i];
            if (l.mod) update = l.mod(update, this);
            this.updaters[i] = update;
        }

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
        this.toplevel = true;
        this.ctx = null;
        this.deferred = [];
    }

    Environment.prototype = {
        runInContext: function runInContext(fn, ctx) {
            if (ctx.updating) return;

            var oldCtx, result, toplevel;

            oldCtx = this.ctx, this.ctx = ctx;
            toplevel = this.toplevel, this.toplevel = false;

            ctx.beginUpdate();
            ctx.updating = true;

            try {
                result = fn();
            } finally {
                ctx.updating = false;
                this.ctx = oldCtx;
                this.toplevel = toplevel;
            }

            ctx.endUpdate();

            return result;
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
            if (this.toplevel) {
                while (this.deferred.length !== 0) {
                    this.deferred.shift()();
                }
            }
        }
    };

    return Environment;
});

define('S', ['Environment', 'Source', 'Context'], function (Environment, Source, Context) {
    var env = new Environment();

    // initializer
    S.lift     = lift;

    S.data     = data;
    S.formula  = formula;
    S.peek     = peek;
    S.defer    = defer;
    S.proxy    = proxy;
    S.cleanup  = cleanup;
    S.finalize = finalize;
    S.toJSON   = toJSON;

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
        if (value === undefined)
            throw new Error("S.data can't be initialized with undefined.  In S, undefined is reserved for namespace lookup failures.");

        var src = new Source(env);

        data.toString = dataToString;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                if (newValue === undefined)
                    throw new Error("S.data can't be set to undefined.  In S, undefined is reserved for namespace lookup failures.");
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

        formula.dispose = dispose;
        formula.toString = toString;

        (options.init ? options.init(update) : update)();

        env.runDeferred();

        return formula;

        function formula() {
            if (env.ctx) env.ctx.addSource(src);
            return value;
        }

        function update(x) {
            env.runInContext(_update, ctx);
            //var newValue = env.runInContext(fn, ctx);

            //if (newValue !== undefined) {
            //    value = newValue;
            //    src.propagate();
            //}
        }

        function _update(x) {
            var newValue = fn();

            if (newValue !== undefined) {
                value = newValue;
                env.ctx = null;
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

    function dataToString() {
        return "[data: " + S.peek(this) + "]";
    }

    function peek(fn) {
        return env.runWithoutListening(fn);
    }

    function defer(fn) {
        if (!env.toplevel) {
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

    function proxy(getter, setter) {
        return function proxy(value) {
            if (arguments.length !== 0) setter(value);
            return getter();
        };
    }

    function toJSON(o) {
        return JSON.stringify(o, function (k, v) {
            return (typeof v === 'function' && v.S) ? v() : v;
        });
    };
});

define('modifiers', ['S'], function (S) {

    var _S_defer = S.defer;

    return {
        stop:     stop,
        defer:    defer,
        throttle: throttle,
        debounce: debounce,
        pause:    pause
    };

    function stop(update) {
        return function stopped() { }
    }

    function defer(fn) {
        if (fn !== undefined)
            return _S_defer(fn);

        return function (update, ctx) {
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

    function throttle(t) {
        return function throttle(update, ctx) {
            var last = 0,
                scheduled = false;

            return function throttle(x) {
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
        return function (update, ctx) {
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

    function pause(signal) {
        return function (update, ctx) {
            var updates = [],
                paused,
                scheduled = false,
                watcher = S.on(signal).S(function resume() {
                    while (!(paused = signal()) && updates.length) {
                        var update = updates.shift();
                        update();
                    }
                });

            ctx.finalizers.push(watcher.dispose);

            return function pause() {
                if (paused) {
                    if (scheduled) return;
                    scheduled = true;

                    updates.push(function paused() {
                        scheduled = false;
                        update();
                    });
                } else {
                    update();
                }
            }
        };
    }
});

define('FormulaOptionBuilder', ['S', 'modifiers'], function (S, modifiers) {

    function FormulaOptionBuilder() {
        this.options = {
            sources: null,
            update: null,
            init: null
        };
    }

    FormulaOptionBuilder.prototype = {
        S: function (fn) {
            return S.formula(fn, this.options);
        },
        on: function (l) {
            l = !l ? [] : !Array.isArray(l) ? [l] : l;
            this.options.sources = maybeConcat(this.options.sources, l);
            return this;
        },
        once: function () {
            this.options.sources = [];
            return this;
        },
        skipFirst: function () {
            if (this.options.sources === null || this.options.sources.length === 0)
                throw new Error("to use skipFirst, you must first have specified at least one dependency with .on(...)")
            composeInit(this, modifiers.stop);
            return this;
        }
    };

    // add methods for modifiers
    'defer throttle debounce pause'.split(' ').map(function (method) {
        FormulaOptionBuilder.prototype[method] = function (v) { composeUpdate(this, modifiers[method](v)); return this; };
    });

    // add methods to S
    'on once defer throttle debounce pause'.split(' ').map(function (method) {
        S[method] = function (v) { return new FormulaOptionBuilder()[method](v); };
    });

    return;

    function maybeCompose(f, g) { return g ? function compose(x) { return f(g(x)); } : f; }
    function maybeConcat(a, b) { return a ? a.concat(b) : b; }
    function composeUpdate(b, fn) { b.options.update = maybeCompose(fn, b.options.update); }
    function composeInit(b, fn) { b.options.init = maybeCompose(fn, b.options.init); }
});

});
