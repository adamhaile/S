test("X.val atomic actions", function () {
    var o1, o2, o3;

    o1 = X();

    ok(o1, "can be created without 'new' keyword");

    ok(typeof o1 === 'function', "is a function");

    strictEqual(o1(), undefined, "unassigned X.value has value of undefined");

    o1(1);

    strictEqual(o1(), 1, "returns stored value");
    strictEqual(o1(2), 2, "returns value when stored");

    o2 = X("test");

    strictEqual(o2(), "test", "can be created with initial values");

    o3 = new X();

    ok(o3, "can be created with 'new' keyword");
});

test("X.proc atomic actions", function () {
    var o1, o2, o3, v;

    throws(function () { o1 = X.proc(); }, "throws if no getter defined");
    throws(function () { o1 = X.proc(1); }, "throws if getter is not a function");

    o1 = X(function () { return 1; });

    ok(typeof o1 === 'function', "is a function");

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
});

test("X.proc to X.val dependencies", function () {
    var v = X(1),
        p_evals = 0,
        p = X(function () { p_evals++; return v(); }, function (_v) { v(_v); });

    strictEqual(p(), 1, "reflects value of source");

    v(2);

    strictEqual(p(), 2, "reflects changes to source");

    v(3);

    strictEqual(v(), 3, "can push changes to source from a set");

    strictEqual(p(), 3, "reflects changes pushed to source by a set");

    strictEqual(p(4), 4, "re-evaluates when it changes a source");

    p_evals = 0;
    p();
    v();
    strictEqual(p_evals, 0, "uses memoized value");

    p_evals = 0;
    v(5);
    strictEqual(p_evals, 1, "re-evaluates when source changes");
});