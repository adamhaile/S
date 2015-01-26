define('S', ['graph'], function (graph) {
    var rec = new graph.Recorder();

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

        var src = new graph.Source(rec);

        data.toString = dataToString;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                if (newValue === undefined)
                    throw new Error("S.data can't be set to undefined.  In S, undefined is reserved for namespace lookup failures.");
                value = newValue;
                src.propagate();
                rec.runDeferred();
            } else {
                rec.addSource(src);
            }
            return value;
        }
    }

    function formula(fn, options) {
        options = options || {};

        var src = new graph.Source(rec),
            tgt = new graph.Target(update, options, rec),
            value;

        rec.addChild(dispose);

        formula.dispose = dispose;
        formula.toString = toString;

        (options.init ? options.init(update) : update)();

        rec.runDeferred();

        return formula;

        function formula() {
            rec.addSource(src);
            return value;
        }

        function update() {
            rec.runWithTarget(_update, tgt);
        }

        function _update() {
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
        return rec.peek(fn);
    }

    function defer(fn) {
        if (rec.target) {
            rec.deferred.push(fn);
        } else {
            fn();
        }
    }

    function cleanup(fn) {
        if (rec.target) {
            rec.target.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    function finalize(fn) {
        if (rec.target) {
            rec.target.finalizers.push(fn);
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
    };
});
