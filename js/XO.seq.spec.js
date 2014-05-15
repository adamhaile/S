// sets, unordered and ordered, in XO

(function (X) {
    "use strict";

    X.seq = seq;

    function seq(values) {
        var seq = X.ch(values);

        seq.X = new Xcombinator(seq);

        // mutations
        seq.add = add;
        seq.remove = remove;

        return seq;

        function add(item) {
            values.push(item);
            seq(values);
            return seq;
        }

        function remove(item) {
            for (var i = 0; i < values.length; i++) {
                if (values[i] === item) {
                    values.splice(i, 1);
                    break;
                }
            }
            seq(values);
            return seq;
        }
    }

    function map(comb, enter, exit, move) {
        var items = [],
            mapped = [],
            len = 0;

        enter = enter || function (x) { return x; };

        var map = X(function () {
            var new_items = comb.seq(),
                new_len = new_items.length,
                temp = new Array(new_len),
                moved = new Array(len),
                i, j, k, item;
            
            // 1) step through all old items and see if they can be found in the new set; if so, save them in a temp array and mark them moved; if not, exit them 
            NEXT:
            for (i = 0, k = 0; i < len; i++) {
                item = mapped[i];
                for (j = 0; j < new_len; j++, k = (k + 1) % new_len) {
                    if (items[i] === new_items[k] && !temp.hasOwnProperty(k)) {
                        temp[k] = item;
                        if (i !== k) moved[i] = k;
                        k = (k + 1) % new_len;
                        continue NEXT;
                    }
                }
                if (exit) exit(item, i);
            }

            if (move && moved.length) move(moved);

            // 2) set all the new values, pulling from the temp array if copied, otherwise entering the new value
            for (i = 0; i < new_len; i++) {
                if (temp.hasOwnProperty(i)) {
                    mapped[i] = temp[i];
                } else {
                    item = new_items[i];
                    mapped[i] = enter ? enter(item, i) : item;
                }
            }

            // 3) in case the new set is shorter than the old, set the length of the mapped array
            len = mapped.length = new_len;

            // 4) saved a copy of the mapped items for the next update
            items = new_items.slice();

            return mapped;
        });

        map.X = new Xcombinator(map);

        return map;
    }

    function order(comb, fn) {
        var order = X(function () { return _.sortBy(comb.seq(), fn); });

        order.X = new Xcombinator(order);

        return order;
    }

    function filter(comb, predicate) {
        var filter = X(function () { return _.filter(comb.seq(), predicate); });

        filter.X = new Xcombinator(filter);

        return filter;
    }

    function append(comb, others) {
        var append = X(function () {
            return Array.prototype.concat.apply(comb.seq(), _.map(others, function (o) { return o(); }));
        });

        append.X = new Xcombinator(append);

        return append;
    }

    function enter(comb, fn) {
        var values = X.peek(comb.seq).map(_fn),
            outs = new Delta(),
            ch = X.ch(outs);

        var ins = getDelta(comb);

        var enter = X(function () {
            var i, exited, entered;

            comb.delta();

            while (ins.next) {
                ins = ins.next;

                exited = [], entered = [];

                for (i in ins.exited) exited[i] = values[i];
                for (i in ins.entered) entered[i] = _fn(ins.entered[i], i);

                outs = outs.next = new Delta(values, exited, ins.moved, entered, ins.length);

                applyDelta(values, outs);

                ch(outs);
            }

            return values;
        });

        enter.X = new Xcombinator(enter, ch);

        return enter;

        function _fn(x, i) {
            var v = fn(x, i);
            return v === undefined ? x : v;
        }
    }

    function exit(comb, fn) {
        return tapDelta(comb, function (delta) { delta.exited.map(fn); });
    }

    function move(comb, fn) {
        return tapDelta(comb, function (delta) { if (delta.moved.length) fn(delta.moved); });
    }

    function tapDelta(comb, fn) {
        var delta = getDelta(comb);

        var tap = X(function () {
            comb.delta();

            while (delta.next) {
                delta = delta.next;
                fn(delta);
            }

            return delta.values;
        });

        tap.X = new Xcombinator(tap, comb.delta);

        return tap;
    }

    function getDelta(comb) {
        var delta;

        if (!comb.delta) {
            delta = new Delta();

            comb.delta = X(function () {
                var current = comb.seq();

                delta = delta.next = compare(delta.values, current.slice());

                return delta;
            });
        } else {
            delta = X.peek(comb.delta);
        }

        return delta;
    }

    function compare(xs, ys) {
        var exited = [], 
            moved = [], 
            entered = [],
            found = [],
            xlen = xs.length,
            ylen = ys.length,
            i, j, k, x, y;

        NEXT:
        for (i = 0, k = 0; i < xlen; i++) {
            x = xs[i];
            for (j = 0; j < ylen; j++, k = (k + 1) % ylen) {
                y = ys[k];
                if (x === y && !found.hasOwnProperty(k)) {
                    found[k] = true;
                    if (i !== k) moved[i] = k;
                    k = (k + 1) % ylen;
                    continue NEXT;
                }
            }
            exited[i] = x;
        }

        for (k = 0; k < ylen; k++) {
            if (!found.hasOwnProperty(k)) {
                entered[k] = ys[k];
            }
        }

        return new Delta(ys, exited, moved, entered, ylen);
    }

    function Delta(values, exited, moved, entered, len) {
        this.values = values || [];
        this.exited = exited || [];
        this.moved = moved || [];
        this.entered = entered || [];
        this.length = len || 0;
        this.next = null;
    }

    function applyDelta(array, delta) {
        var temp = [],
            moved = delta.moved,
            entered = delta.entered,
            i, j;

        for (i in moved) {
            j = moved[i];
            if (j < i) array[j] = array[i];
            else temp[j] = array[i];
        }

        for (i in temp) {
            array[i] = temp[i];
        }

        for (i in entered) {
            array[i] = entered[i];
        }

        array.length = delta.length;
    }

    function reduce(source, fn, seed) {
        return X(function () { return _.reduce(source(), fn, seed); });
    }

    function Xcombinator(seq, delta) {
        this.seq = seq;
        this.delta = delta;
    }

    Xcombinator.prototype = {
        map:    function _X_map(enter, exit, move) { return map   (this, enter, exit, move); },
        order:  function _X_order(fn)              { return order (this, fn); },
        filter: function _X_filter(fn)             { return filter(this, fn); },
        append: function _X_append()               { return append(this, arguments); },
        enter:  function _X_enter(fn)              { return enter(this, fn); },
        exit:   function _X_exit(fn)               { return exit(this, fn); },
        move:   function _X_move(fn)               { return move(this, fn); },
        reduce: function _X_reduce(fn, seed)       { return reduce(this, fn, seed); }
    };

})(X);