define('S', ['graph'], function (graph) {
    var os = new graph.Overseer();

    // add methods to S
    S.data     = data;
    S.peek     = peek;
    S.defer    = defer;
    S.proxy    = proxy;
    S.cleanup  = cleanup;
    S.finalize = finalize;
    S.generator = generator;
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
            value,
            updating;

        // register dispose before running fn, in case it throws
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
            if (updating) return;
            updating = true;

            var oldTarget, newValue;

            oldTarget = os.target, os.target = tgt;

            tgt.beginUpdate();

            try {
                newValue = fn();

                if (newValue !== undefined) {
                    value = newValue;
                    src.propagate();
                }
            } finally {
                updating = false;
                os.target = oldTarget;
            }

            tgt.endUpdate();
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
        return "[data: " + peek(this) + "]";
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

    function generator(fn) {
        if (os.target && !os.target.generating) {
            os.target.generating = true;

            try {
                return fn();
            } finally {
                os.target.generating = false;
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
