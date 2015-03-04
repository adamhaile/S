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
