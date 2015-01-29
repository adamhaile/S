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

    function Overseer() {
        this.count = 1;
        this.target = null;
        this.deferred = [];
    }

    Overseer.prototype = {
        reportReference: function reportReference(src) {
            if (this.target) this.target.addSource(src);
        },
        reportFormula: function reportFormula(dispose) {
            if (this.target) this.target.addChild(dispose);
        },
        runWithTarget: function runWithTarget(fn, target) {
            if (target.updating) return;

            var oldTarget, result;

            oldTarget = this.target, this.target = target;

            target.beginUpdate();
            target.updating = true;

            result = this.runWithTargetInner(fn, oldTarget);

            target.endUpdate();

            return result;
        },
        // Chrome can't optimize a function with a try { } statement, so we move
        // the minimal set of needed ops into a separate function.
        runWithTargetInner: function runWithTargetInner(fn, oldTarget) {
            try {
                return fn();
            } finally {
                this.target.updating = false;
                this.target = oldTarget;
            }
        },
        peek: function runWithoutListening(fn) {
            var oldListening;

            if (this.target) {
                oldListening = this.target.listening, this.target.listening = false;

                try {
                    return fn();
                } finally {
                    this.target.listening = oldListening;
                }
            } else {
                return fn();
            }
        },
        runDeferred: function runDeferred() {
            if (!this.target) {
                while (this.deferred.length !== 0) {
                    this.deferred.shift()();
                }
            }
        }
    };

    function Source(recorder) {
        this.id = recorder.count++;
        this.lineage = recorder.target ? recorder.target.lineage : [];

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

    function Target(update, options, recorder) {
        var i, l;

        this.lineage = recorder.target ? recorder.target.lineage.slice(0) : [];
        this.lineage.push(this);
        this.mod = options.update;
        this.updaters = [];

        this.updating = false;
        this.listening = true;
        this.generator = !!options.generator;
        this.gen = 1;
        this.dependencies = [];
        this.dependenciesIndex = {};
        this.cleanups = [];
        this.finalizers = [];

        for (i = this.lineage.length - 1; i >= 0; i--) {
            l = this.lineage[i];
            if (l.mod) update = l.mod(update);
            this.updaters[i] = update;
        }

        if (options.sources) {
            recorder.runWithTarget(function () {
                for (var i = 0; i < options.sources.length; i++)
                    options.sources[i]();
            }, this);

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
        addSource: function addSource(src) {
            if (!this.listening) return;

            var dep = this.dependenciesIndex[src.id];

            if (dep) {
                dep.activate(this.gen);
            } else {
                new Dependency(this, src);
            }
        },
        addChild: function addChild(disposeChild) {
            (this.generator ? this.finalizers : this.cleanups).push(disposeChild);
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

    function Dependency(target, src) {
        this.active = true;
        this.gen = target.gen;
        this.updates = src.updates;
        this.offset = src.updates.length;

        // set i to the point where the lineages diverge
        for (var i = 0, len = Math.min(target.lineage.length, src.lineage.length);
            i < len && target.lineage[i] === src.lineage[i];
            i++);

        this.update = target.updaters[i];
        this.updates.push(this.update);

        target.dependencies.push(this);
        target.dependenciesIndex[src.id] = this;
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

    return {
        Overseer: Overseer,
        Source: Source,
        Target: Target,
        Dependency: Dependency
    };
});

define('S', ['graph'], function (graph) {
    var os = new graph.Overseer();

    // initializer
    S.data     = data;
    S.peek     = peek;
    S.defer    = defer;
    S.proxy    = proxy;
    S.cleanup  = cleanup;
    S.finalize = finalize;
    S.toJSON   = toJSON;

    return S;

    function data(value) {
        if (value === undefined)
            throw new Error("S.data can't be initialized with undefined.  In S, undefined is reserved for namespace lookup failures.");

        var src = new graph.Source(os);

        data.toString = dataToString;

        if (Array.isArray(value)) arrayify(data);

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                if (newValue === undefined)
                    throw new Error("S.data can't be set to undefined.  In S, undefined is reserved for namespace lookup failures.");
                value = newValue;
                src.propagate();
                os.runDeferred();
            } else {
                os.reportReference(src);
            }
            return value;
        }
    }

    function S(fn, options) {
        options = options || {};

        var src = new graph.Source(os),
            tgt = new graph.Target(update, options, os),
            value;

        os.reportFormula(dispose);

        formula.dispose = dispose;
        formula.toString = toString;

        (options.init ? options.init(update) : update)();

        os.runDeferred();

        return formula;

        function formula() {
            os.reportReference(src);
            return value;
        }

        function update() {
            os.runWithTarget(updateInner, tgt);
        }

        function updateInner() {
            var newValue = fn();

            if (newValue !== undefined) {
                value = newValue;
                src.propagate();
            }
        }

        function dispose() {
            tgt.cleanup();
            tgt.dispose();
        }

        function toString() {
            return "[formula: " + (value !== undefined ? value + " - " : "") + fn + "]";
        }
    }

    function dataToString() {
        return "[data: " + S.peek(this) + "]";
    }

    function peek(fn) {
        return os.peek(fn);
    }

    function defer(fn) {
        if (os.target) {
            os.deferred.push(fn);
        } else {
            fn();
        }
    }

    function cleanup(fn) {
        if (os.target) {
            os.target.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    function finalize(fn) {
        if (os.target) {
            os.target.finalizers.push(fn);
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
            return (typeof v === 'function') ? v() : v;
        });
    }

    function arrayify(s) {
        s.push    = push;
        s.pop     = pop;
        s.shift   = shift;
        s.unshift = unshift;
        s.splice  = splice;
        s.remove  = remove;
    }

    function push(v)         { var l = peek(this); l.push(v);     this(l); return v; }
    function pop()           { var l = peek(this), v = l.pop();   this(l); return v; }
    function shift()         { var l = peek(this), v = l.shift(); this(l); return v; }
    function unshift(v)      { var l = peek(this); l.unshift(v);  this(l); return v; }
    function splice(/*...*/) { var l = peek(this), v = l.splice.apply(l, arguments); this(l); return v;}
    function remove(v)       { var l = peek(this), i = l.indexOf(v); if (i !== -1) { l.splice(i, 1); this(l); return v; } }
});

define('schedulers', ['S'], function (S) {

    var _S_defer = S.defer;

    return {
        stop:     stop,
        defer:    defer,
        throttle: throttle,
        debounce: debounce,
        pause:    pause,
        stopsign: stopsign
    };

    function stop(update) {
        return function stopped() { }
    }

    function defer(fn) {
        if (fn !== undefined)
            return _S_defer(fn);

        return function (update) {
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
});

define('FormulaOptionBuilder', ['S', 'schedulers'], function (S, schedulers) {

    function FormulaOptionBuilder() {
        this.options = {
            sources: null,
            update: null,
            init: null,
            generator: false
        };
    }

    FormulaOptionBuilder.prototype = {
        S: function (fn) {
            return S(fn, this.options);
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
        },
        generator: function () {
            this.options.generator = true;
            return this;
        }
    };

    // add methods for modifiers
    'defer throttle debounce pause'.split(' ').map(function (method) {
        FormulaOptionBuilder.prototype[method] = function (v) { composeUpdate(this, schedulers[method](v)); return this; };
    });

    // add methods to S
    'on once generator defer throttle debounce pause'.split(' ').map(function (method) {
        S[method] = function (v) { return new FormulaOptionBuilder()[method](v); };
    });

    S.stopsign = schedulers.stopsign;

    return;

    function maybeCompose(f, g) { return g ? function compose() { return f(g()); } : f; }
    function maybeConcat(a, b) { return a ? a.concat(b) : b; }
    function composeUpdate(b, fn) { b.options.update = maybeCompose(fn, b.options.update); }
    function composeInit(b, fn) { b.options.init = maybeCompose(fn, b.options.init); }
});

});
