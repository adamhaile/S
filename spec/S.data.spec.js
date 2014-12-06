describe("S.data", function () {
    describe("creation", function () {
        it("throws if no initial value is passed", function () {
            expect(function () { S.data(); }).toThrow();
        });

        it("throws if initial value is undefined", function () {
            expect(function () { S.data(undefined); }).toThrow();
        });

        it("generates a function", function () {
            expect(S.data(1)).toEqual(jasmine.any(Function));
        });

        it("returns initial value", function () {
            expect(S.data(1)()).toBe(1);
        });
    });

    describe("update", function () {
        var d;

        beforeEach(function () {
            d = S.data(1);
            d(2);
        });

        it("changes returned value", function () {
            expect(d()).toBe(2);
        });

        it("cannot be set to undefined", function () {
            expect(function () { d(undefined); }).toThrow();
        });

        it("returns value being updated", function () {
            expect(d(3)).toBe(3);
        });
    });
});
/*
test("K.region creation and detach", function () {
    var a = K(1),
        b,
        c,
        r = K.region(function () {
            b = K(2);
            c = K(function () { return a() + b(); });
        });

    strictEqual(c(), 3, "procs inside regions are initialized");

    a(3);
    b(4);
    strictEqual(c(), 7, "procs inside regions update");

    r.K.detach();

    a(99);

    strictEqual(c(), 7, "detaching a region detaches its procs");

    b(100);
    strictEqual(c(), 199, "updating a source within a detached region still updates a proc");

    a(9);
    strictEqual(c(), 199, "detached procs stay detached");
});

test("K.seq creation", function () {
    var s = K.seq([1, 2, 3]);

    ok(s, "can be created");

    deepEqual(s(), [1, 2, 3], "contains expected values");

    var t = K([1, 2, 3, 4]);

    ok(t, "can be created with K([...]) shorthand");

    deepEqual(t(), [1, 2, 3, 4], "object created by K([...]) shorthand contains expected values");
});

test("K.seq reset", function () {
    var s = K.seq([1, 2, 3]);

    s([4, 5, 6]);

    deepEqual(s(), [4,5,6], "seq reflects reset values");
});

test("K.seq.add", function () {
    var s = K.seq([1, 2, 3]);

    s.add(4);

    deepEqual(s(), [1, 2, 3, 4], "added item appears in values");
});

test("K.seq.remove", function () {
    var s = K.seq([1, 2, 3, 4, 5]);

    s.remove(5);

    deepEqual(s(), [1, 2, 3, 4], "value removed from end is gone");

    s.remove(3);

    deepEqual(s(), [1, 2, 4], "value removed from middle is gone");

    s.remove(1);

    deepEqual(s(), [2, 4], "value removed from beginning is gone");
});

test("K.seq.map creation", function () {
    var s = K.seq([1, 2, 3]),
        m = s .K. map(function (i) { return i * 2; });

    ok(m, "map returns object");

    ok(m.K, "object returned by map is a seq");

    deepEqual(m(), [2, 4, 6], "map contains expected values");
});

test("K.seq.map with add", function () {
    var s = K.seq([1, 2, 3]),
        m = s .K. map(function (i) { return i * 2; });

    s.add(4);

    deepEqual(m(), [2, 4, 6, 8], "map updates with expected added value");
});

test("K.seq.map with remove", function () {
    var s = K.seq([1, 2, 3, 4, 5]),
        exited = [],
        m = s .K. map(function (i) { return i * 2; }, function (i) { exited.push(i); });

    s.remove(5);

    deepEqual(m(), [2, 4, 6, 8], "map responds to removal from end");
    deepEqual(exited, [10], "exit called for value removed from end");

    s.remove(3);

    deepEqual(m(), [2, 4, 8], "map responds to removal from middle");
    deepEqual(exited, [10, 6], "exit called for value removed from middle");

    s.remove(1);

    deepEqual(m(), [4, 8], "map responds to removal from start");
    deepEqual(exited, [10, 6, 2], "exit called for value removed from start");
});

test("K.seq.enter creation", function () {
    var s = K.seq([1, 2, 3]),
        m = s .K. enter(function (i) { return i * 2; });

    ok(m, "enter returns object");

    ok(m.K, "object returned by enter is a seq");

    deepEqual(m(), [2, 4, 6], "enter contains expected values");
});

test("K.seq.enter with add", function () {
    var s = K.seq([1, 2, 3]),
        m = s .K. enter(function (i) { return i * 2; });

    s.add(4);

    deepEqual(m(), [2, 4, 6, 8], "enter updates with expected added value");
});

test("K.seq.enter with reset", function () {
    var s = K.seq([1, 2, 3]),
        m = s .K. enter(function (i) { return i * 2; });

    s([4, 5, 6]);

    deepEqual(m(), [8, 10, 12], "enter updates with expected added value");
});

test("K.seq.exit with reset", function () {
    var s = K.seq([1, 2, 3]),
        exited = [],
        m = s .K. exit(function (i) { exited.push(i); });

    s([3, 4, 5, 6]);

    deepEqual(m(), [3, 4, 5, 6], "exit returns correct array value");
    deepEqual(exited, [1, 2], "exit called for removed values");
});

test("K.seq.exit with remove", function () {
    var s = K.seq([1, 2, 3, 4, 5]),
        exited = [],
        m = s .K. exit(function (i) { exited.push(i); });

    s.remove(5);

    deepEqual(m(), [1, 2, 3, 4], "map responds to removal from end");
    deepEqual(exited, [5], "exit called for value removed from end");

    s.remove(3);

    deepEqual(m(), [1, 2, 4], "map responds to removal from middle");
    deepEqual(exited, [5, 3], "exit called for value removed from middle");

    s.remove(1);

    deepEqual(m(), [2, 4], "map responds to removal from start");
    deepEqual(exited, [5, 3, 1], "exit called for value removed from start");
});

test("K.seq.filter", function () {
    var s = K.seq([1, 2, 3, 4, 5, 6]),
        f = s .K. filter(function (n) { return n % 2; });

    deepEqual(f(), [1, 3, 5]);
});

test("K.seq.map with chanels", function () {
    var c = K(true),
        s = K([c]),
        f = function (c) { return c(); },
        m = s .K. map(f);

    c(false);

    deepEqual(m(), [true]);

    deepEqual(_.map(s(), f), [false]);

});

test("K.rproc - inner proc management", function () {
    var outer = K(),
        inner = K(),
        evals = 0,
        p = K(function () {
                outer();
                K(function () {
                    inner();
                    evals++;
                });
            });

    strictEqual(evals, 1, "inner proc runs once for initialization");

    evals = 0;
    inner(1);

    strictEqual(evals, 1, "inner proc runs once on inner trigger");

    evals = 0;
    outer(1);

    strictEqual(evals, 1, "inner proc duplicated and evaluated on outer trigger");

    evals = 0;
    inner(1);

    strictEqual(evals, 2, "inner proc now exists twice and is evaluation twice");

    // re-perform tests using an rproc
    outer = K();
    inner = K();
    evals = 0;
    p = K.rproc(function () {
            outer();
            K(function () {
                inner();
                evals++;
            });
        });

    strictEqual(evals, 1, "inner proc runs once for initialization");

    evals = 0;
    inner(1);

    strictEqual(evals, 1, "inner proc runs once on inner trigger");

    evals = 0;
    outer(1);

    strictEqual(evals, 1, "inner proc recreated and evaluated on outer trigger");

    evals = 0;
    inner(1);

    strictEqual(evals, 1, "inner proc now exists only once");
});

function mapSpeed() {
    var i, j, s, m, c = 0;

    for (i = 1; i <= 10000; i++) {
        s = K.seq([]);
        m = s.K.map(function (v) { c++; return v * 2; });
        for (j = 0; j < 50; j++) {
            s.add(j);
        }
    }

    return c;
}

function enterSpeed() {
    var i, j, s, m, c = 0;

    for (i = 1; i <= 10000; i++) {
        s = K.seq([]);
        m = s.K.enter(function (v) { c++; return v * 2; });
        for (j = 0; j < 50; j++) {
            s.add(j);
        }
    }

    return c;
}
*/

function propagateSpeed(nary, depth) {
    console.time("propagateSpeed");

    var root = S(0), c = 0, i;

    tree(root, nary, depth);

    for (i = 1; i <= 10000; i++) {
        root(i);
    }

    console.timeEnd("propagateSpeed");

    return c;

    function tree(node, nary, depth) {
        if (depth <= 0) return;
        for (var i = 0; i < nary; i++) {
            tree(S(function () { c++; return node() + 1; }), nary, depth - 1);
        }
    }
}

function dataCreateSpeed(count) {
    console.time("dataCreateSpeed");

    var i;

    for (i = 0; i < count; i++) {
        S.data(i);
    }

    console.timeEnd("dataCreateSpeed");
}

function formulaCreateSpeed(count) {
    console.time("formulaCreateSpeed");

    var i;

    for (i = 0; i < count; i++) {
        S.formula(function () { });
    }

    console.timeEnd("formulaCreateSpeed");
}
