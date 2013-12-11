// sets, unordered and ordered, in XO

/*
var x = X([1, 2, 3]).orderBy(function (i) { return i % 3; }).append(X([4]));
var x = X([1, 2, 3]).orderBy(i => i % 3).append(X([4]));
var x = X.seq.append(X.seq.orderBy(function (i) { return i % 3; }, X([1, 2, 3])), X[4]);
var x = X.seq.append(X.seq.orderBy(i => i % 3, X([1, 2, 3])), X[4]);
var x = X.seq.append(X.seq.orderBy(X([1, 2, 3]), function (i) { return i % 3; }), X[4]);
var x = X.append(X.orderBy(function (i) { return i % 3; }, X([1, 2, 3])), X[4]);
var x = append(orderBy(function (i) { return i % 3; }, X([1, 2, 3])), X[4]);
var x = append(orderBy(i => i % 3, X([1, 2, 3])), X[4]);

var x = X([1, 2, 3]);
x = X.seq.orderBy(function (i) { return i % 3; }, x);
x = X.seq.append(x, X([4]));

x(); // [3,1,2,4]

map
each
sort
orderBy
orderByDesc
reverse
groupBy
filter
find
contains
all
any
append
reduce
reduceRight
max
min

// from JS
forEach
every
some
filter
map
reduce
reduceRight

// missing from JS
sort / orderBy / orderByDesc
groupBy
contains / indexOf / lastIndexOf
append
max / min
reverse

*/

(function (X) {
    "use strict";

    X.seq = seq;

    function seq(array) {
        var seq = X.val(array);

        // mutations
        seq.add = add;
        seq.remove = remove;

        addFluentMethods(seq);

        return seq;

        function add(item) {
            array = array.slice();
            array.push(item);
            seq(array);
            return seq;
        }

        function remove(item) {
            array = array.slice();
            for (var i = 0; i < array.length; i++) {
                if (array[i] === item) {
                    array.splice(i, 1);
                    break;
                }
            }
            seq(array);
            return seq;
        }
    }

    function addFluentMethods(seq) {
        seq.order  = fluent_order;
        seq.map    = fluent_map;
        seq.reduce = fluent_reduce;
        seq.filter = fluent_filter;
        seq.append = fluent_append;
    }

    function fluent_order(fn)        { return order(this, fn); }
    function fluent_map(fn)          { return map(this, fn); }
    function fluent_reduce(fn, seed) { return reduce(this, fn, seed); }
    function fluent_filter(fn)       { return filter(this, fn); }
    function fluent_append()         { return append.apply(undefined, Array.prototype.concat.apply([this], arguments)); }

    function order(upstream, fn) {
        var order = X(function () { return _.sortBy(upstream(), fn); });

        addFluentMethods(order);

        return order;
    }

    function map(upstream, enter, exit) {
        var last = [],
            lastindices = [],
            lastmapped = [];

        var map = X(function () {
            var array = upstream(),
                len = array.length,
                lastlen = last.length,
                indices = new Array(len),
                mapped = new Array(len),
                persisted = new Array(len),
                i, j, k;

            ITEM:
            for (i = 0, k = 0; i < len; i++) {
                for (j = 0; j < lastlen; j++, k = (k + 1) % lastlen) {
                    if (array[i] === last[k]) {
                        mapped[i] = lastmapped[k];
                        indices[i] = lastindices[k];
                        indices[i](i);
                        persisted[k] = true;
                        continue ITEM;
                    }
                }
                indices[i] = X(i);
                // use an IIFE to capture the current value of i
                mapped[i] = (function (v, i) { return X(function () { return enter(v, i); }); })(array[i], indices[i]);
            }

            if (exit) {
                for (j = 0; j < lastlen; j++) {
                    if (!persisted[j]) {
                        exit(last[j], lastindices[j], lastmapped[j]);
                    }
                }
            }

            last = array;
            lastmapped = mapped;

            return mapped;
        });

        addFluentMethods(map);

        return map;
    }

    function reduce(upstream, fn, seed) {
        var reduce = X(function () { return _.reduce(upstream(), fn, seed); });

        addFluentMethods(reduce);

        return reduce;
    }

    function filter(upstream, predicate) {
        var filter = X(function () { return _.filter(upstream(), predicate); });

        addFluentMethods(filter);

        return filter;
    }

    function append(/* arguments */) {
        var seqs = arguments;
        var append = X(function () {
            var arrays = _.map(seqs, function (seq) { return seq(); });
            return Array.prototype.concat.apply([], arrays);
        });

        addFluentMethods(append);

        return append;
    }

})(X);