var X = (function () {
    "use strict";

    var count = 1,
        consumer = 0,
        edges = [],
        updaters = [],
        bundles = [];

    // initializer
    X.lift     = lift;

    X.val      = val;
    X.proc     = proc;
    X.bundle   = bundle;
    X.peek     = peek;
    X.sub      = sub;

    // modifiers
    X.detach   = detach;
    X.defer    = defer;
    X.throttle = throttle;
    X.debounce = debounce;

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

        addToBundles(val);

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
            updating = false,
            value;

        edges[id] = {};
        updaters[id] = update;

        proc.in = _in;
        proc.out = out;

        update();

        addToBundles(proc);

        return proc;

        function proc(setValue) {
            var _consumer;

            if (arguments.length > 0) {
                if (set) {
                    _consumer = consumer;
                    consumer = 0;
                    try {
                        set(setValue);
                    } finally {
                        consumer = _consumer;
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
                _consumer;

            if (!updating) {
                updating = true;
                _consumer = consumer;
                consumer = id;

                try {
                    newValue = get();
                } finally {
                    consumer = _consumer;
                    updating = false;
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

        edges[source] = {};

        for (consumer in consumers) {
            updaters[consumer]();
        }
    }

    function bundle(fn) {
        var id = count++,
            nodes = [],
            inMod = identity,
            outMod = identity,
            bundle = {
                in: _in,
                out: out,
                watch: watch,
                add: add
            };

        if (fn) watch(fn);

        return bundle;

        function watch(fn) {
            bundles.push(add);
            try {
                fn();
            } finally {
                bundles.pop();
            }

            return bundle;
        }

        function add(node) {
            nodes.push(node);
            if (node.in) node.in(inMod);
            if (node.out) node.out(outMod);

            return bundle;
        }

        function _in(mod) {
            var i = nodes.length, _in;
            while (i--) {
                _in = nodes[i].in;
                if (_in) _in(mod);
            }

            inMod = compose(inMod, mod);

            return bundle;
        }

        function out(mod) {
            var i = nodes.length, out;
            while (i--) {
                out = nodes[i].out;
                if (out) out(mod);
            }

            outMod = compose(outMod, mod);

            return bundle;
        }
    }

    function addToBundles(node) {
        var i = bundles.length;
        while (i--) {
            bundles[i](node);
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

    function sub(/* arg1, arg2, ... argn, fn */) {
        var args = arguments.slice(),
            fn = noop,
            realFn = args.pop(),
            sub = proc(function () {
                var values = [],
                    i;

                for (i = 0; i < args.length; i++) {
                    values.push(args[i]());
                }

                return X.peek(function () {
                    return fn.apply(undefined, values);
                });
            });

        fn = realFn;

        return sub;
    }

    // in/out modifiers
    function detach(fn) {
        return noop;
    }

    function defer(fn) {
        return function (id) {
            setTimeout(fn, 0, id);
        };
    }

    function throttle(delay) {
        return function (fn) {
            var last = 0,
                scheduled = false;

            return function (id) {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) >= delay) {
                    last = now;
                    fn(id);
                } else {
                    scheduled = true;
                    setTimeout(function () {
                        last += delay;
                        scheduled = false;
                        fn(id);
                    }, delay - (now - last));
                }
            };
        };
    }

    function debounce(delay) {
        return function (fn) {
            var tout = 0;

            return function (id) {
                if (tout) clearTimeout(tout);

                tout = setTimeout(fn, delay, id);
            };
        };
    }

    function compose(g, f) {
        return function (x) {
            return g(f(x));
        };
    }

    function noop() { }

    function identity(x) { return x; }
}());