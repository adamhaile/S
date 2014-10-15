var K = (function () {
    "use strict";

    var count = 1,
        listener = undefined,
        region = [];

    // initializer
    K.lift     = lift;

    K.ch       = ch;
    K.proc     = proc;
    K.region   = _region;
    K.peek     = peek;

    K.ch.K = chCombinator;
    procCombinator.prototype = new chCombinator();
    K.proc.K = procCombinator;

    return K;

    function K(arg1, arg2) {
        return K.lift(arg1, arg2);
    }

    function lift(arg1, arg2) {
        return typeof arg1 === 'function' ? proc(arg1, arg2)
            : arg1 instanceof Array ? K.seq(arg1)
            : ch(arg1);
    }

    function ch(msg) {
        var id = count++,
            listeners = [],
            our_region = region;

        ch.K = new chCombinator();

        return ch;

        function ch(new_msg) {
            if (arguments.length > 0) {
                msg = new_msg;
                propagate(listeners);
            } else {
                if (listener) listener(id, our_region, listeners);
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
            our_region = region,
            updaters = initUpdaters(update, id, this);

        proc.K = new procCombinator(detach);

        updaters[updaters.length - 1]();

        return proc;

        function proc() {
            if (listener) listener(id, our_region, listeners);
            return msg;
        }

        function update() {
            var new_msg,
                prev_listener,
                prev_region;

            if (!updating) {
                updating = true;
                prev_listener = listener, listener = our_listener;
                prev_region = region, region = our_region;

                gen++;

                try {
                    new_msg = fn();

                    if (new_msg !== undefined) {
                        msg = new_msg;
                        propagate(listeners);
                    }
                } finally {
                    updating = false;
                    listener = prev_listener;
                    region = prev_region;
                }

                pruneStaleSources(gen, source_gens, source_offsets, source_listeners);
            }
        }

        function our_listener(sid, source_region, listeners) {
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

            // set i to the point where the region paths diverge
            for (i = 0, len = Math.min(our_region.length, source_region.length);
                 i < len && our_region[i] === source_region[i];
                 i++);

            listeners.push(updaters[i]);

            for (len = our_region.length; i < len; i++) {
                our_region[i].offsets.push(offset);
                our_region[i].listeners.push(listeners);
            }
        }

        function detach() {
            var i, len;

            for (i = 0, len = source_offsets.length; i < len; i++) {
                source_listeners[i][source_offsets[i]] = undefined;
                source_listeners[i] = undefined;
            }
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

    function initUpdaters(update, id, mod) {
        var i, updaters = [];

        if (mod && mod.mod) update = mod.mod(update, id);

        updaters[region.length] = update;

        for (i = region.length - 1; i >= 0; i--) {
            if (region.mod) update = region.mod(update, id);
            updaters[i] = update;
        }

        return updaters;
    }

    function chCombinator() { }

    function procCombinator(detach) {
        this.detach = detach;
    }

    function regionCombinator(detach) {
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

    function _region(fn) {
        var prev_region = region,
            offsets = [],
            listeners = [];

        region = region.slice();

        region.push({
            mod: this && this.mod ? this.mod : null,
            offsets: offsets,
            listeners: listeners
        });

        try {
            fn();
        } finally {
            region = prev_region;
        }

        return {
            K: new regionCombinator(detach)
        }

        function detach() {
            var i, len;

            for (i = 0, len = listeners.length; i < len; i++) {
                listeners[i][offsets[i]] = undefined;
            }
        }
    }

    function peek(fn) {
        var prev_listener,
            val;

        if (!listener) {
            val = fn();
        } else {
            prev_listener = listener, listener = undefined;

            try {
                val = fn();
            } finally {
                listener = prev_listener;
            }
        }

        return val;
    }
}());
