var X = (function () {
    "use strict";

    var count = 1,
        consumer = 0,
        bundles = [];

    // initializer
    X.lift     = lift;

    X.val      = val;
    X.proc     = proc;
    X.bundle   = bundle;
    X.peek     = peek;
    X.sub      = sub;

    // modifiers
    X.reset    = reset;
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
        val.id = count++;
        val.consumers = {};
        val.propagate = propagate;
        val.out = out;

        addToBundles(val);

        return val;

        function val(set_value) {
            if (arguments.length > 0) {
                if (value !== set_value) {
                    value = set_value;
                    val.propagate();
                }
            } else {
                attachSource(val);
            }
            return value;
        }
    }

    function proc(get, set) {
        var value,
            updating = false;

        proc.id = count++;
        proc.consumers = {};
        proc.sources = {};
        proc.propagate = propagate;
        proc.update = update;
        proc.originalUpdate = update;
        proc.in = _in;
        proc.out = out;

        update();

        addToBundles(proc);

        return proc;
        
        function proc(set_value) {
            var _consumer;

            if (arguments.length > 0) {
                if (set) {
                    _consumer = consumer;
                    consumer = null;
                    try {
                        set(set_value);
                    } finally {
                        consumer = _consumer;
                    }
                }
            } else {
                attachSource(proc);
            }

            return value;
        }

        function update() {
            var newValue,
                _consumer;
            
            if (!updating) {
                updating = true;
                _consumer = consumer;
                consumer = proc;

                proc.sources = {};

                try {
                    newValue = get();
                } finally {
                    consumer = _consumer;
                    updating = false;
                }

                if (value !== newValue) {
                    value = newValue;
                    proc.propagate();
                }
            }
        }
    }

    function out(mod) {
        this.propagate = mod(this.propagate, this, true);

        return this;
    }

    function _in(mod) {
        this.update = mod(this.update, this, false);

        return this;
    }

    function propagate() {
        var consumers = this.consumers,
            i;

        this.consumers = {};

        for (var i in consumers) {
            consumers[i].update();
        }
    }

    function attachSource(source) {
        if (consumer) {
            consumer.sources[source.id] = source;
            source.consumers[consumer.id] = consumer;
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
            try {
                bundles[id] = bundle;
            } finally {
                bundles[id] = null;
            }

            return bundle;
        }

        function add(node) {
            nodes.push(node);
            if (node.in) node.in(inMod);
            node.out(outMod);

            return bundle;
        }

        function _in(mod) {
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].in) nodes[i].in(mod);
            }

            inMod = modCompose(inMod, mod);

            return bundle;
        }

        function out(mod) {
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].out(mod);
            }

            outMod = modCompose(outMod, mod);

            return bundle;
        }
    }

    function addToBundles(node) {
        for (var i in bundles) {
            if (bundles[i]) {
                bundles[i].add(node);
            }
        }
    }

    function peek(fn) {
        var _consumer = consumer;
        consumer = null;

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
    function reset(fn, node, out) {
        fn = out ? propagate : node.originalUpdate;
        fn.apply(node);
        return fn;
    }

    function detach(fn, node, out) {
        var id, set;

        if (out) {
            for (id in node.consumers) {
                set = node.consumers[id].sources;
                delete set[node.id];
            }
        } else {
            for (id in node.sources) {
                set = node.sources[id].consumers;
                delete set[node.id];
            }
        }

        return fn;
    }

    function defer(fn) {
        return function () {
            setTimeout(fn, 0);
        };
    }

    function throttle(delay) {
        return function (fn) {
            var last = 0,
                scheduled = false;

            return function () {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) >= delay) {
                    last = now;
                    fn();
                } else {
                    scheduled = true;
                    setTimeout(function () {
                        last += delay;
                        scheduled = false;
                        fn();
                    }, delay - (now - last));
                }
            };
        };
    }

    function debounce(delay) {
        return function (fn) {
            var tout = 0;

            return function () {
                if (tout) clearTimeout(tout);

                tout = setTimeout(fn, delay);
            };
        };
    }

    function modCompose(mod1, mod2) {
        return function (fn, node, out) {
            return mod1(mod2(fn, node, out), node, out);
        };
    }

    function noop() { }

    function identity(x) { return x; }
}());