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
