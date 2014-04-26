var X = (function () {
    "use strict";

    var count = 1,
        consumer = 0,
        edges = [],
        updaters = [],
        bundler = noop;

    // initializer
    X.lift     = lift;

    X.val      = val;
    X.proc     = proc;
    X.bundle   = bundle;
    X.peek     = peek;

    return X;

    function X(arg1, arg2) {
        return X.lift(arg1, arg2);
    }

    function lift(arg1, arg2) {
        return typeof arg1 === 'function' ? proc(arg1, arg2)
            : arg1 instanceof Array ? X.seq(arg1)
            : val(arg1);
    }

    function val(value) {
        var id = count++,
            propagate = propagateImmediately;

        edges[id] = {};

        val.out = out;

        bundler(val);

        return val;

        function val(set_value) {
            if (arguments.length > 0) {
                if (value !== set_value) {
                    value = set_value;
                    propagate(id);
                }
            } else {
                addEdge(id);
            }
            return value;
        }

        function out(mod) {
            propagate = mod(propagate);

            return val;
        }
    }

    function proc(get, set) {
        var id = count++,
            propagate = propagateImmediately,
            _bundler = bundler,
            updating = false,
            value;

        edges[id] = {};
        updaters[id] = update;

        proc.in = _in;
        proc.out = out;

        _bundler(proc);

        update();

        return proc;

        function proc(setValue) {
            var _consumer,
                __bundler;

            if (arguments.length > 0) {
                if (set) {
                    _consumer = consumer, consumer = 0;
                    __bundler = bundler, bundler = _bundler;
                    try {
                        set(setValue);
                    } finally {
                        consumer = _consumer;
                        bundler = __bundler;
                    }
                }
            } else {
                addEdge(id);
            }

            return value;
        }

        function _in(mod) {
            updaters[id] = mod(updaters[id]);

            return proc;
        }

        function out(mod) {
            propagate = mod(propagate);

            return proc;
        }

        function update() {
            var newValue,
                _consumer,
                __bundler;

            if (!updating) {
                updating = true;
                _consumer = consumer, consumer = id;
                __bundler = bundler, bundler = _bundler;

                try {
                    newValue = get();
                } finally {
                    updating = false;
                    consumer = _consumer;
                    bundler = __bundler;
                }

                if (value !== newValue) {
                    value = newValue;
                    propagate(id);
                }
            }
        }
    }

    function addEdge(source) {
        if (consumer) {
            edges[source][consumer] = true;
        }
    }

    function propagateImmediately(source) {
        var consumers = edges[source],
            consumer;

        for (consumer in consumers) {
            if (consumers[consumer]) {
                consumers[consumer] = false;
                updaters[consumer](consumer);
            }
        }
    }

    function bundle(fn) {
        var nodes = [],
            inMods = identity,
            outMods = identity,
            bundle = {
                in: _in,
                out: out,
                watch: watch
            };

        if (fn) watch(fn);

        return bundle;

        function watch(fn) {
            var _bundler = bundler, bundler = add;

            try {
                fn();
            } finally {
                bundler = _bundler;
            }

            function add(node) {
                if (node.in) node.in(inMods);
                if (node.out) node.out(outMods);
                nodes.push(node);
                _bundler(node);
            }
        }

        function _in(mod) {
            var i,
                node;

            inMods = compose(inMods, mod);

            for (i = 0; i < nodes.length; i++) {
                node = nodes[i];
                if (node.in) node.in(mod);
            }

            return bundle;
        }

        function out(mod) {
            var i,
                node;

            outMods = compose(outMods, mod);

            for (var i = 0; i < nodes.length; i++) {
                node = nodes[i];
                if (node.out) node.out(mod);
            }

            return bundle;
        }
    }

    function peek(fn) {
        var _consumer = consumer;

        consumer = 0;

        try {
            return fn();
        } finally {
            consumer = _consumer;
        }
    }

    function compose(g, f) {
        return function (x) {
            return g(f(x));
        };
    }

    function noop() { }

    function identity(x) { return x; }
}());