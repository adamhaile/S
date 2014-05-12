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

    function map(source, enter, exit, move) {
        var items = [],
            mapped = [],
            len = 0;

        enter = enter || function (x) { return x; };

        var map = X(function () {
            var new_items = source(),
                new_len = new_items.length,
                temp = new Array(new_len),
                i, j, k, item;
            
            // 1) step through all old items and see if they can be found in the new set; if so, save them in a temp array and mark them moved; if not, exit them 
            NEXT:
            for (i = 0, k = 0; i < len; i++) {
                item = mapped[i];
                for (j = 0; j < new_len; j++, k = (k + 1) % new_len) {
                    if (items[i] === new_items[k] && !temp.hasOwnProperty(k)) {
                        temp[k] = item;
                        if (move) move(item, i, k)
                        continue NEXT;
                    }
                }
                if (exit) exit(item, i);
            }

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

    function order(source, fn) {
        var order = X(function () { return _.sortBy(source(), fn); });

        order.X = new Xcombinator(order);

        return order;
    }

    function filter(source, predicate) {
        var filter = X(function () { return _.filter(source(), predicate); });

        filter.X = new Xcombinator(filter);

        return filter;
    }

    function append(source, others) {
        var append = X(function () {
            return Array.prototype.concat.apply(source(), _.map(others, function (o) { return o(); }));
        });

        append.X = new Xcombinator(append);

        return append;
    }

    function reduce(source, fn, seed) {
        return X(function () { return _.reduce(source(), fn, seed); });
    }

    function Xcombinator(seq) {
        this.seq = seq;
    }

    Xcombinator.prototype = {
        map:    function _X_map(enter, exit, move) { return map   (this.seq, enter, exit, move); },
        order:  function _X_order(fn)              { return order (this.seq, fn); },
        filter: function _X_filter(fn)             { return filter(this.seq, fn); },
        append: function _X_append()               { return append(this.seq, arguments); },
        reduce: function _X_reduce(fn, seed)       { return reduce(this.seq, fn, seed); }
    };

})(X);