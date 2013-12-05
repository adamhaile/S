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
        var seq = X.value(array),
            delta = X({}); // can fire init, add and remove

        X(function () { delta(X.peek(delta).next = { cmd: 'init', items: set() }); });

        seq.delta = delta;

        // mutations
        seq.add = add;
        seq.remove = remove;

        return seq;

        function add(item) {
            array.push(item);
            delta(delta().next = { cmd: 'add', item: item, i: array.length - 1 });
            return seq;
        }

        function remove(item) {
            for (var i = 0; i < array.length; i++) {
                if (array[i] === item) {
                    array.splice(i, 1);
                    delta(delta().next = { cmd: 'remove', item: item, i: i });
                    return seq;
                }
            }
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

    function fluent_order(fn)  { return order(this, fn); }
    function fluent_map(fn)    { return map(this, fn); }
    function fluent_reduce(fn) { return reduce(this, fn); }
    function fluent_filter(fn) { return filter(this, fn); }
    function fluent_append(fn) { return append(this, fn); }

    function order(upstream, fn) {
        var array = upstream().slice(),
            order = X.value(array),
            delta = X({}); // can fire add, remove, init and reorder

        array.sort(fn);

        order.delta = delta;

        X(function () {
            var cmd = upstream();
            switch (cmd.cmd) {
                case 'add': break;

            }
        });

        return order;

    }

    function map(upstream, fn) {

    }

    function reduce(upstream, fn, seed) {

    }

    function filter(upstream, predicate) {

    }

    function append(/* arguments */) {

    }

})(X);