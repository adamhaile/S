define('core', ['graph'], function (graph) {
    var graph = new graph.Graph();

    return {
        data:           data,
        FormulaOptions: FormulaOptions,
        formula:        formula,
        freeze:         freeze,
        peek:           peek,
        pin:            pin,
        cleanup:        cleanup,
        finalize:       finalize
    }

    function data(value) {
        var node = graph.addNode(null, null);

        data.toJSON = signalToJSON;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                value = newValue;
                graph.reportChange(node);
            } else {
                graph.addEdge(node);
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
        var node = graph.addNode(update, options),
            value;

        formula.dispose = dispose;
        //formula.toString = toString;
        formula.toJSON = signalToJSON;

        return formula;

        function formula() {
            if (node) graph.addEdge(node);
            return value;
        }

        function update() {
            value = fn();
        }

        function dispose() {
            if (node) node.dispose();
            node = fn = value = undefined;
        }

        //function toString() {
        //    return "[formula: " + (value !== undefined ? value + " - " : "") + fn + "]";
        //}
    }

    function signalToJSON() {
        return this();
    }

    function peek(fn) {
        if (graph.updatingNode && graph.updatingNode.listening) {
            graph.updatingNode.listening = false;

            try {
                return fn();
            } finally {
                graph.updatingNode.listening = true;
            }
        } else {
            return fn();
        }
    }

    function pin(fn) {
        if (graph.updatingNode && !graph.updatingNode.pinning) {
            graph.updatingNode.pinning = true;

            try {
                return fn();
            } finally {
                graph.updatingNode.pinning = false;
            }
        } else {
            return fn();
        }
    }

    function freeze(fn) {
        graph.freeze(fn);
    }

    function cleanup(fn) {
        if (graph.updatingNode) {
            graph.updatingNode.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    function finalize(fn) {
        if (graph.updatingNode) {
            graph.updatingNode.finalizers.push(fn);
        } else {
            throw new Error("S.finalize() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }
});
