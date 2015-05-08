define('core', ['graph'], function (Graph) {
    var graph = new Graph();

    return {
        data:           data,
        FormulaOptions: FormulaOptions,
        formula:        formula,
        region:         region,
        freeze:         freeze,
        peek:           peek,
        pin:            pin,
        cleanup:        cleanup,
        finalize:       finalize
    }

    function data(value) {
        var entry = graph.addEntryPoint(null, null);

        data.toJSON = signalToJSON;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                value = newValue;
                graph.reportChange(entry);
            } else {
                graph.addEdge(entry);
            }
            return value;
        }
    }

    function FormulaOptions() {
        this.sources = null;
        this.pin     = false;
        this.region  = null;
    }

    function formula(fn, options) {
        var node = graph.addNode(fn, options, dispose);

        formula.dispose = dispose;
        //formula.toString = toString;
        formula.toJSON = signalToJSON;

        return formula;

        function formula() {
            if (!node) return;
            graph.addEdge(node.emitter);
            if (node.damage !== 0) graph.backtrack(node);
            return node.value;
        }

        function dispose() {
            if (!node) return;
            node.dispose();
            node = undefined;
        }

        //function toString() {
        //    return "[formula: " + (value !== undefined ? value + " - " : "") + fn + "]";
        //}
    }

    function signalToJSON() {
        return this();
    }

    function region() {
        var cs = graph.addChangeset();

        region.go = go;

        return region;

        function region(emitter) {
            cs.add(emitter);
        }

        function go() {
            graph.flushChangeset(cs);
        }
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
