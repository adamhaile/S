test("X.value atomic actions", function () {
    var o1, o2, o3;

    o1 = X();

    ok(o1, "can be created without 'new' keyword");

    ok(typeof o1 === 'function', "is a function");

    ok(typeof (o1.id) === 'number', "exposes its numeric id");

    strictEqual(o1(), undefined, "unassigned X.value has value of undefined");

    o1(1);

    strictEqual(o1(), 1, "returns stored value");
    strictEqual(o1(2), 2, "returns value when stored");

    o2 = X("test");

    strictEqual(o2(), "test", "can be created with initial values");

    o3 = new X();

    ok(o3, "can be created with 'new' keyword");

    ok(o1.id !== o2.id && o2.id !== o3.id && o1.id !== o3.id, "has a unique id");
});

test("X.property atomic actions", function () {
    var o1, o2, o3, v;

    throws(function () { o1 = X.property(); }, "throws if no getter defined");
    throws(function () { o1 = X.property(1); }, "throws if getter is not a function");

    o1 = X(function () { return 1; });

    ok(typeof o1 === 'function', "is a function");

    ok(typeof (o1.id) === 'number', "exposes its numeric id");

    strictEqual(o1(), 1, "returns value of getter function");

    o1(3);

    strictEqual(o1(), 1, "ignores sets if it doesn't have a setter");

    strictEqual(o1(4), 1, "returns stored value after a set");

    v = 5;
    o2 = X(function () { return v; });

    strictEqual(o2(), 5, "returns value of getter function, when getter references non-tracked values");

    v = 6;
    strictEqual(o2(), 5, "does not re-calculate when non-tracked values change, even if they would change the value returned by the getter");

    o3 = X(function () { return v; }, function (_v) { v = _v; });

    strictEqual(o3(), 6, "returns value of getter function, when getter references non-tracked values and when a setter is present");
    
    o3(7);

    strictEqual(o3(), 6, "does not re-calculate when non-tracked values change, even when they were changed through a set");

    strictEqual(v, 7, "set can perform untracked side effects");

    ok(o1.id !== o2.id && o2.id !== o3.id && o1.id !== o3.id, "has a unique id");
});

test("X.property to X.value dependencies", function () {
    var l1 = X(1),
        n1_evals = 0,
        n1 = X(function () { n1_evals++; return l1(); }, function (v) { l1(v); });

    strictEqual(n1(), 1, "reflects value of source");

    l1(2);

    strictEqual(n1(), 2, "reflects changes to source");

    n1(3);

    strictEqual(l1(), 3, "can push changes to source from a set");

    strictEqual(n1(), 3, "reflects changes pushed to source by a set");

    strictEqual(n1(4), 4, "re-evaluates when it changes a source");

    n1_evals = 0;
    n1();
    l1();
    strictEqual(n1_evals, 0, "uses memoized value");

    n1_evals = 0;
    l1(5);
    strictEqual(n1_evals, 1, "re-evaluates when source changes");
});