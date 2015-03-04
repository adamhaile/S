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
