define('Transformers', ['S', 'modifiers'], function (S, modifiers) {

    S.data.pipe = function pipe() { return new TransBuilder(this); };
    S.formula.pipe = function pipe() { return new FormulaTransBuilder(this); };

    function TransBuilder(s) {
        var m = modifiers.map(s);
        this.signal = s;
        this.options = {
            sources: [s],
            update: m,
            init: m
        };
    }

    TransBuilder.prototype = {
        S: function (fn) {
            return S.proxy(S.formula(fn || identity, this.options), this.signal);
        }
    };

    function FormulaTransBuilder(f) {
        TransBuilder.call(this, f);
    }

    FormulaTransBuilder.prototype = new TransBuilder();
    FormulaTransBuilder.prototype.S = function (fn) { return S.formula(fn || identity, this.options); };

    'defer defer1 delay delay1 throttle throttle1 debounce1 pause pause1 map filter changes'.split(' ').map(function (method) {
        TransBuilder.prototype[method] = function (v) {
            composeUpdate(this, modifiers[method](v));
            return this;
        };
    });

    TransBuilder.prototype.map = function (fn) {
        var m = modifiers.map(fn);
        composeInit(this, m);
        composeUpdate(this, m);
        return this;
    };

    return;

    function maybeCompose(f, g) { return g ? function compose(x) { return f(g(x)); } : f; }
    function composeUpdate(b, fn) { b.options.update = maybeCompose(fn, b.options.update); }
    function composeInit(b, fn) { b.options.init = maybeCompose(fn, b.options.init); }
    function identity(x) { return x; }
});
