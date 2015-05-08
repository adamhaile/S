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
