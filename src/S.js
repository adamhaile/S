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

    // stubs for our combinators
    S.data.pipe = null;
    S.formula.pipe = null;

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

        data.pipe = S.data.pipe;
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

        formula.pipe = S.formula.pipe;
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
            env.runInContext(_update, x, ctx);
            //var newValue = env.runInContext(fn, x, ctx);

            //if (newValue !== undefined) {
            //    value = newValue;
            //    src.propagate();
            //}
        }

        function _update(x) {
            var newValue = x === undefined ? fn() : fn(x);

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
