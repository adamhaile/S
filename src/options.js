define('FormulaOptionBuilder', ['S', 'schedulers'], function (S, schedulers) {

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
        FormulaOptionBuilder.prototype[method] = function (v) { composeUpdate(this, schedulers[method](v)); return this; };
    });

    // add methods to S
    'on once defer throttle debounce pause'.split(' ').map(function (method) {
        S[method] = function (v) { return new FormulaOptionBuilder()[method](v); };
    });

    return;

    function maybeCompose(f, g) { return g ? function compose() { return f(g()); } : f; }
    function maybeConcat(a, b) { return a ? a.concat(b) : b; }
    function composeUpdate(b, fn) { b.options.update = maybeCompose(fn, b.options.update); }
    function composeInit(b, fn) { b.options.init = maybeCompose(fn, b.options.init); }
});
