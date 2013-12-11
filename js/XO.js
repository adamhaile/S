var X = (function () {
    "use strict";

    var count = 1,
        consumer = 0,
        consumers = [],
        sources = [],
        updaters = [],
        updating = [],
        bundles = [];

    X.lift = lift;
    X.val = val;
    X.proc = proc;
    X.bundle = bundle;
    X.peek = peek;
    X.sub = sub;
    X.mod = {
        reset: mod_reset,
        detach: mod_detach,
        defer: mod_defer,
        throttle: mod_throttle,
        debounce: mod_debounce
    };

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
            propagater = propagateImmediately;

        consumers[id] = {};

        val.out = out;

        addToBundles(val);

        return val;

        function val(set_value) {
            if (arguments.length > 0) {
                if (value !== set_value) {
                    value = set_value;
                    propagater(id);
                }
            } else {
                attachUpstream(id);
            }
            return value;
        }

        function out(mod) {
            propagater = mod(propagater, propagateImmediately, id);

            return val;
        }
    }

    function proc(get, set) {
        var id = count++,
            propagater = propagateImmediately,
            value;

        consumers[id] = {};
        sources[id] = {};
        updaters[id] = update;
        updating[id] = false;

        update();

        proc.in = _in;
        proc.out = out;

        addToBundles(proc);

        return proc;
        
        function proc(set_value) {
            if (arguments.length > 0) {
                if (set) {
                    withConsumer(0, set, set_value);
                }
            } else {
                attachUpstream(id);
            }

            return value;
        }

        function _in(mod) {
            updaters[id] = mod(updaters[id], update, id);

            return proc;
        }

        function out(mod) {
            propagater = mod(propagater, propagateImmediately, id);

            return proc;
        }

        function update() {
            var newValue;
                
            detachDownstream(id);

            newValue = withConsumer(id, get);

            if (value !== newValue) {
                value = newValue;
                propagater(id);
            }
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
            if (node.id) {
                node.in(inMod);
            }
            node.out(outMod);

            return bundle;
        }

        function _in(mod) {
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].in) {
                    nodes[i].in(mod);
                }
            }

            inMod = mod_compose(inMod, mod);

            return bundle;
        }

        function out(mod) {
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].out(mod);
            }

            outMod = mod_compose(outMod, mod);

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
        return withConsumer(0, fn);
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

    function attachUpstream(id) {
        if (consumer) {
            consumers[id][consumer] = true;
            sources[consumer][id] = true;
        }
    }

    function detachDownstream(id) {
        for (var i in sources[id]) {
            consumers[i][id] = false;
        }
        sources[id] = {};
    }

    function withConsumer(id, fn, arg) {
        var _consumer,
            result;

        try {
            updating[id] = true;
            _consumer = consumer;
            consumer = id;

            result = fn(arg);

        } finally {
            updating[id] = false;
            consumer = _consumer;
        }

        return result;
    }

    function propagateImmediately(id) {
        for (var i in consumers[id]) {
            if (consumers[id][i] && !updating[i]) {
                updaters[i](id);
            }
        }
    }

    // in/out modifiers
    function mod_reset(fn, orig, id) {
        orig(id);
        return orig;
    }

    function mod_detach(fn, orig, id) {
        detachDownstream(id);
        return noop;
    }

    function mod_defer(fn) {
        return function (id) {
            setTimeout(fn, 0, id);
        };
    }

    function mod_throttle(delay) {
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

    function mod_debounce(delay) {
        return function (fn) {
            var tout = 0;

            return function (id) {
                if (tout) clearTimeout(tout);

                tout = setTimeout(fn, delay, id);
            };
        };
    }

    function mod_compose(mod1, mod2) {
        return function (fn, orig, id) {
            return mod1(mod2(fn, orig, id), orig, id);
        };
    }

    function noop() { }

    function identity(x) { return x; }
}());