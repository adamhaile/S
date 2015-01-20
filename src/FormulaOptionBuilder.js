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
