describe("S.on(...)", function () {
    it("registers a dependency", function () {
        var d = S(1),
            spy = jasmine.createSpy("spy"),
            s = S.on(d).S(function () { spy(); });

        spy.calls.reset();

        d(2);

        expect(spy.calls.count()).toBe(1);
    });

    it("prohibits organic dependencies", function () {
        var d = S(1),
            spy = jasmine.createSpy("spy"),
            s = S.on(/* nothing */).S(function () { spy(); return d(); });

            spy.calls.reset();

            d(2);

            expect(spy.calls.count()).toBe(0);
    });

    it ("allows multiple dependencies, either in one specification or many", function () {
        var a = S(1),
            b = S(2),
            c = S(3),
            spy1 = jasmine.createSpy("spy1"),
            spy2 = jasmine.createSpy("spy2"),
            s1 = S.on(a, b, c).S(function () { spy1(); }),
            s2 = S.on(a).on(b).on(c).S(function () { spy2(); });

        spy1.calls.reset();
        spy2.calls.reset();

        a(4);
        b(5);
        c(6);

        expect(spy1.calls.count()).toBe(3);
        expect(spy1.calls.count()).toBe(3);
    });
});
