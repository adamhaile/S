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
            if (this.target) this.target.addSubformula(dispose);
        },
        runDeferred: function runDeferred() {
            if (!this.target) {
                while (this.deferred.length !== 0) {
                    this.deferred.shift()();
                }
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
                updates = this.updates;

            for (i = 0; i < updates.length; i++) {
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
        this.pinning = false;
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
        addSubformula: function addSubformula(dispose) {
            if (this.locked)
                throw new Error("Cannot create a new subformula except while updating the parent");
            (this.pinning ? this.finalizers : this.cleanups).push(dispose);
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
        Overseer: Overseer,
        Source: Source,
        Target: Target,
        Dependency: Dependency
    };
});

define('core', ['graph'], function (graph) {
    var os = new graph.Overseer();

    return {
        data: data,
        promise: promise,
        FormulaOptions: FormulaOptions,
        formula: formula,
        defer: defer,
        peek: peek,
        cleanup: cleanup,
        finalize: finalize,
        pin: pin
    }

    function data(value) {
        if (value === undefined)
            throw new Error("S.data can't be initialized with undefined.  In S, undefined is reserved for namespace lookup failures.");

        var src = new graph.Source(os);

        data.toJSON = signalToJSON;

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

    function promise() {
        var value = undefined,
            src = new graph.Source(os);

        promise.toJSON = signalToJSON;

        return promise;

        function promise(newValue) {
            if (arguments.length > 0) {
                if (newValue === undefined)
                throw new Error("S.promise can't be resolved with undefined.  In S, undefined is reserved for namespace lookup failures.");
                value = newValue;
                src.propagate();
                os.runDeferred();
            } else {
                os.reportReference(src);
            }
            return value;
        }
    }

    function FormulaOptions() {
        this.sources = null;
        this.update = null;
        this.init = null;
    }

    function formula(fn, options) {
        var src = new graph.Source(os),
            tgt = new graph.Target(update, options, os),
            value,
            updating;

        // register dispose before running fn, in case it throws
        os.reportFormula(dispose);

        formula.dispose = dispose;
        //formula.toString = toString;
        formula.toJSON = signalToJSON;

        (options.init ? options.init(update) : update)();

        os.runDeferred();

        return formula;

        function formula() {
            if (src) os.reportReference(src);
            return value;
        }

        function update() {
            if (updating || !tgt) return;
            updating = true;

            var oldTarget, newValue;

            oldTarget = os.target, os.target = tgt;

            tgt.beginUpdate();
            tgt.locked = false;

            try {
                newValue = fn();
                if (tgt) tgt.locked = true;

                if (newValue !== undefined) {
                    value = newValue;
                    if (src) src.propagate(); // executing fn might have disposed us (!)
                }
            } finally {
                updating = false;
                if (tgt) tgt.locked = true;
                os.target = oldTarget;
            }

            if (tgt) tgt.endUpdate();
        }

        function dispose() {
            if (src) {
                src.dispose();
                tgt.dispose();
            }
            src = tgt = fn = value = undefined;
        }

        //function toString() {
        //    return "[formula: " + (value !== undefined ? value + " - " : "") + fn + "]";
        //}
    }

    function signalToJSON() {
        return this();
    }

    function peek(fn) {
        if (os.target && os.target.listening) {
            os.target.listening = false;

            try {
                return fn();
            } finally {
                os.target.listening = true;
            }
        } else {
            return fn();
        }
    }

    function pin(fn) {
        if (os.target && !os.target.pinning) {
            os.target.pinning = true;

            try {
                return fn();
            } finally {
                os.target.pinning = false;
            }
        } else {
            return fn();
        }
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
        skipFirst: function () {
            if (this.options.sources === null || this.options.sources.length === 0)
                throw new Error("to use skipFirst, you must first have specified at least one dependency with .on(...)")
            composeInit(this, schedulers.stop);
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
    function S(fn /*, args */) {
        if (arguments.length > 1) {
            var _fn = fn;
            var _args = Array.prototype.slice.call(arguments, 1);
            fn = function () { return _fn.apply(null, _args); };
        }

        return core.formula(fn, new core.FormulaOptions());
    }

    S.data      = core.data;
    S.promise   = core.promise;
    S.peek      = core.peek;
    S.cleanup   = core.cleanup;
    S.finalize  = core.finalize;
    S.pin       = core.pin;

    // add methods to S for formula options builder
    'on once when defer throttle debounce pause'.split(' ').map(function (method) {
        S[method] = function (v) { return new options.FormulaOptionsBuilder()[method](v); };
    });

    // enable creation of formula from options builder
    options.FormulaOptionsBuilder.prototype.S = function S(fn /*, args */) {
        if (arguments.length > 1) {
            var _fn = fn;
            var _args = Array.prototype.slice.call(arguments, 1);
            fn = function () { return _fn.apply(null, _args); };
        }

        return core.formula(fn, this.options);
    }

    S.stopsign = schedulers.stopsign;

    S.proxy = misc.proxy;

    return S;
})

});
