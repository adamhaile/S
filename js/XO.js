var X = (function () {
    "use strict";

    var count = 1,
        linker = undefined,
        bundler = undefined;

    // initializer
    X.lift     = lift;

    X.ch       = ch;
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
            : ch(arg1);
    }

    function ch(msg) {
        var id = count++,
            updaters = [];

        return ch;

        function ch(new_msg) {
            if (arguments.length > 0) {
                msg = new_msg;
                propagate(updaters);
            } else {
                if (linker) linker(id, updaters);
            }
            return msg;
        }
    }

    function proc(fn) {
        var id = count++,
            gen = 1,
            updating = false,
            msg,
            source_ids = [],
            source_gens = [],
            source_offsets = [],
            source_updaters = [],
            updaters = [],
            our_bundler = bundler;

        proc.in = _in;

        if (our_bundler) our_bundler(proc);

        update();

        return proc;

        function proc() {
            if (linker) linker(id, updaters);
            return msg;
        }

        function update() {
            var new_msg,
                prev_linker,
                prev_bundler;

            if (!updating) {
                updating = true;
                prev_linker = linker, linker = our_linker;
                prev_bundler = bundler, bundler = our_bundler;

                gen++;

                try {
                    new_msg = fn();
                } finally {
                    updating = false;
                    linker = prev_linker;
                    bundler = prev_bundler;
                }

                prune_stale_sources();

                if (new_msg !== undefined) {
                    msg = new_msg;
                    propagate(updaters);
                }
            }
        }

        function _in(mod) {
            update = mod(update, sources);

            return proc;
        }

        function updateref() {
            update();
        }

        function our_linker(sid, updaters) {
            var i, len, source_gen;

            for (i = 0, len = source_ids.length; i < len; i++) {
                if (sid === source_ids[i]) {
                    source_gen = source_gens[i];
                    if (source_gen === 0) {
                        source_updaters[i] = updaters;
                        updaters[source_offsets[i]] = updateref;
                    }
                    source_gens[i] = gen;
                    return;
                }
            }

            source_ids.push(sid);
            source_gens.push(gen);
            source_offsets.push(updaters.length);
            source_updaters.push(updaters);

            updaters.push(updateref);
        }

        function prune_stale_sources() {
            var i, len, source_gen;

            for (i = 0, len = source_gens.length; i < len; i++) {
                source_gen = source_gens[i];
                if (source_gen !== 0 && source_gen < gen) {
                    source_updaters[i][source_offsets[i]] = undefined;
                    source_updaters[i] = undefined;
                    source_gens[i] = 0;
                }
            }
        }
    }

    function propagate(updaters) {
        var i, len, updater;

        for (i = 0, len = updaters.length; i < len; i++) {
            updater = updaters[i];
            if (updater) {
                updater();
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
        var prev_linker = linker;

        linker = undefined;

        try {
            return fn();
        } finally {
            linker = prev_linker;
        }
    }

    function compose(g, f) {
        return function compose(x, y) {
            return g(f(x, y), y);
        };
    }

    function identity(x) { return x; }
}());