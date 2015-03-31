define('core', ['graph'], function (graph) {
    var os = new graph.Overseer();

    return {
        data:           data,
        FormulaOptions: FormulaOptions,
        formula:        formula,
        defer:          defer,
        peek:           peek,
        pin:            pin,
        cleanup:        cleanup,
        finalize:       finalize
    }

    function data(value) {
        var src = new graph.Source(os);

        data.toJSON = signalToJSON;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
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
        this.pin     = false;
        this.update  = null;
        this.init    = null;
    }

    function formula(fn, options) {
        var src = new graph.Source(os),
            tgt = new graph.Target(update, options, os),
            value,
            updating;

        // register dispose before running fn, in case it throws
        os.reportFormula(dispose, options.pin);

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

            var oldTarget;

            oldTarget = os.target, os.target = tgt;

            tgt.beginUpdate();
            tgt.locked = false;

            try {
                value = fn();
                if (tgt) tgt.locked = true;
                if (src) src.propagate(); // executing fn might have disposed us (!)
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
});
