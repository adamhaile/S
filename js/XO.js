var X = (function () {
    "use strict";

    var count = 1,
        listener = undefined,
        bundler = undefined;

    // initializer
    X.lift     = lift;

    X.ch       = ch;
    X.proc     = proc;
    X.bundle   = bundle;
    X.peek     = peek;

    X.ch.X = chX;
    procX.prototype = new chX();
    X.proc.X = procX;

    return X;

    function X(arg1, arg2) {
        return X.lift(arg1, arg2);
    }

    function lift(arg1, arg2) {
        return typeof arg1 === 'function' ? proc(arg1, arg2)
            : arg1 instanceof Array ? X.seq(arg1)
            : ch(arg1);
    }

    function ch(msg) {
        var id = count++,
            listeners = [];

        ch.X = new chX();

        return ch;

        function ch(new_msg) {
            if (arguments.length > 0) {
                msg = new_msg;
                propagate(listeners);
            } else {
                if (listener) listener(id, listeners);
            }
            return msg;
        }
    }

    function proc(fn) {
        var id = count++,
            gen = 1,
            updating = false,
            msg,
            // for sources, use parallel arrays instead of array of objects so that we can scan ids and gens fast
            source_ids = [],
            source_gens = [],
            source_offsets = [],
            source_listeners = [],
            listeners = [],
            our_bundler = bundler;

        proc.X = new procX(update, source_offsets, source_listeners);

        if (our_bundler) our_bundler(proc);

        update();

        return proc;

        function proc() {
            if (listener) listener(id, listeners);
            return msg;
        }

        function update() {
            var new_msg,
                prev_listener,
                prev_bundler;

            if (!updating) {
                updating = true;
                prev_listener = listener, listener = our_listener;
                prev_bundler = bundler, bundler = our_bundler;

                gen++;

                try {
                    new_msg = fn();
                } finally {
                    updating = false;
                    listener = prev_listener;
                    bundler = prev_bundler;
                }

                prune_stale_sources();

                if (new_msg !== undefined) {
                    msg = new_msg;
                    propagate(listeners);
                }
            }
        }

        function our_listener(sid, listeners) {
            var i, len, source_gen;

            for (i = 0, len = source_ids.length; i < len; i++) {
                if (sid === source_ids[i]) {
                    source_gen = source_gens[i];
                    if (source_gen === 0) {
                        source_listeners[i] = listeners;
                        listeners[source_offsets[i]] = proc.X;
                    }
                    source_gens[i] = gen;
                    return;
                }
            }

            source_ids.push(sid);
            source_gens.push(gen);
            source_offsets.push(listeners.length);
            source_listeners.push(listeners);

            listeners.push(proc.X);
        }

        function prune_stale_sources() {
            var i, len, source_gen;

            for (i = 0, len = source_gens.length; i < len; i++) {
                source_gen = source_gens[i];
                if (source_gen !== 0 && source_gen < gen) {
                    source_listeners[i][source_offsets[i]] = undefined;
                    source_listeners[i] = undefined;
                    source_gens[i] = 0;
                }
            }
        }
    }

    function chX() { }

    function procX(update, source_offsets, source_listeners) {
        this._update = update;
        this._source_offsets = source_offsets;
        this._source_listeners = source_listeners;
    }

    function propagate(listeners) {
        var i, len, listener;

        for (i = 0, len = listeners.length; i < len; i++) {
            listener = listeners[i];
            if (listener) {
                listener._update();
            }
        }
    }

    function bundle(fn) {
        var nodes = [],
            inMods = identity,
            bundle = {
                in: _in,
                watch: watch
            };

        if (fn) watch(fn);

        return bundle;

        function watch(fn) {
            var prev_bundler = bundler, bundler = add;

            try {
                fn();
            } finally {
                bundler = prev_bundler;
            }

            function add(node) {
                node.in(inMods);
                nodes.push(node);
                prev_bundler(node);
            }
        }

        function _in(mod) {
            var i;

            inMods = compose(inMods, mod);

            for (i = 0; i < nodes.length; i++) {
                nodes[i].in(mod);
            }

            return bundle;
        }
    }

    function peek(fn) {
        var prev_listener;

        if (!listener) {
            return fn();
        } else {
            prev_listener = listener;
            listener = undefined;

            try {
                return fn();
            } finally {
                listener = prev_listener;
            }
        }
    }

    function compose(g, f) {
        return function compose(x, y) {
            return g(f(x, y), y);
        };
    }

    function identity(x) { return x; }
}());
