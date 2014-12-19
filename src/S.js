define('S', [], function () {
    var count = 1,
        path = [],
        deferred = [];

    // initializer
    S.lift     = lift;

    S.data    = data;
    S.formula = formula;
    S.peek    = peek;
    S.defer   = defer;

    S.data.S = dataCombinator;
    formulaCombinator.prototype = new dataCombinator();
    S.formula.S = formulaCombinator;

    return S;

    function S(arg1, arg2) {
        return S.lift(arg1, arg2);
    }

    function lift(arg1, arg2) {
        return typeof arg1 === 'function' ? formula(arg1, arg2)
            : arg1 instanceof Array ? S.seq(arg1)
            : data(arg1);
    }

    function data(msg) {
        if (msg === undefined) throw new Error("S.data can't be initialized with undefined.  In S, undefined is reserved for namespace lookup failures.");

        var id = count++,
            listeners = [],
            our_path = path;

        data.S = new dataCombinator();
        data.toString = dataToString;

        return data;

        function data(new_msg) {
            if (arguments.length > 0) {
                if (new_msg === undefined) throw new Error("S.data can't be set to undefined.  In S, undefined is reserved for namespace lookup failures.");
                //console.log("[S.data: " + JSON.stringify(msg) + " -> " + JSON.stringify(new_msg) + "]");
                msg = new_msg;
                propagate(listeners);
                runDeferred();
            } else {
                if (path.length) path[path.length - 1].listener(id, our_path, listeners);
            }
            return msg;
        }
    }

    function formula(fn) {
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
            our = { listener: our_listener, mod: (this && this.fn) || null, children: [] },
            our_path = path.slice(0),
            updaters;

        if (path.length) path[path.length - 1].children.push(detach);

        our_path.push(our);

        updaters = initUpdaters(our_path, update, id);

        formula.S = new formulaCombinator(detach);
        formula.toString = toString;

        //updaters[updaters.length - 1]();
        update();

        runDeferred();

        return formula;

        function formula() {
            if (path.length) path[path.length - 1].listener(id, our_path, listeners);
            return msg;
        }

        function update() {
            var i,
                new_msg,
                prev_path;

            if (!updating) {
                updating = true;
                prev_path = path, path = our_path;

                for (i = 0; i < our.children.length; i++) {
                    our.children[i]();
                }
                our.children = [];

                gen++;

                try {
                    new_msg = fn();

                    //console.log("[S.formula: " + JSON.stringify(msg) + " -> " + JSON.stringify(new_msg) + " - " + fn.toString().replace(/\s+/g, " ").substr(0, 60) + "]");

                    if (new_msg !== undefined) {
                        msg = new_msg;
                        propagate(listeners);
                    }
                } finally {
                    updating = false;
                    path = prev_path;
                }

                pruneStaleSources(gen, source_gens, source_offsets, source_listeners);
            }
        }

        function our_listener(sid, source_path, listeners) {
            var i, j, len, offset;

            for (i = 0, len = source_ids.length; i < len; i++) {
                if (sid === source_ids[i]) {
                    offset = source_offsets[i];
                    if (listeners[offset] === null) {
                        listeners[offset] = source_listeners[i];
                        source_listeners[i] = listeners;
                    }
                    source_gens[i] = gen;
                    return;
                }
            }

            offset = listeners.length;

            source_ids.push(sid);
            source_gens.push(gen);
            source_offsets.push(offset);
            source_listeners.push(listeners);

            // set i to the point where the paths diverge
            for (i = 0, len = Math.min(our_path.length, source_path.length);
                 i < len && our_path[i] === source_path[i];
                 i++);

            listeners.push(updaters[i]);
        }

        function detach() {
            var i, len;

            for (i = 0, len = source_offsets.length; i < len; i++) {
                source_listeners[i][source_offsets[i]] = undefined;
                source_listeners[i] = undefined;
            }

            for (i = 0; i < our.children.length; i++) {
                our.children[i]();
            }
        }

        function toString() {
            return "[formula: " + fn + "]";
        }
    }

    function pruneStaleSources(gen, source_gens, source_offsets, source_listeners) {
        var i, len, source_gen, listeners, offset;

        for (i = 0, len = source_gens.length; i < len; i++) {
            source_gen = source_gens[i];
            if (source_gen !== 0 && source_gen < gen) {
                listeners = source_listeners[i];
                offset = source_offsets[i];
                source_listeners[i] = listeners[offset];
                listeners[offset] = null;
                source_gens[i] = 0;
            }
        }
    }

    function initUpdaters(path, update, id) {
        var i, p, updaters = [];

        for (i = path.length - 1; i >= 0; i--) {
            p = path[i];
            if (p.mod) update = p.mod(update, id);
            updaters[i] = update;
        }

        return updaters;
    }

    function dataCombinator() { }

    function formulaCombinator(detach) {
        this.detach = detach;
    }

    function propagate(listeners) {
        var i, len, listener;

        for (i = 0, len = listeners.length; i < len; i++) {
            listener = listeners[i];
            if (listener) {
                listener();
            }
        }
    }

    function dataToString() {
        return "[data: " + S.peek(this) + "]";
    }

    function peek(fn) {
        var cur,
            prev_listener,
            val;

        if (!path.length) {
            val = fn();
        } else {
            cur = path[path.length - 1];
            prev_listener = cur.listener, cur.listener = function () {};

            try {
                val = fn();
            } finally {
                cur.listener = prev_listener;
            }
        }

        return val;
    }

    function defer(fn) {
        if (path.length) {
            deferred.push(fn);
        } else {
            fn();
        }
    }

    function runDeferred() {
        if (path.length) return;
        while (deferred.length !== 0) {
            deferred.shift()();
        }
    }
});
