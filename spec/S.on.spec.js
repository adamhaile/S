describe("S.on(...)", function () {
    it("registers a dependency", function () {
        var d = S.data(1),
            spy = jasmine.createSpy(),
            f = S.on(d).S(function () { spy(); });

        spy.calls.reset();

        d(2);

        expect(spy.calls.count()).toBe(1);
    });

    it("prohibits dynamic dependencies", function () {
        var d = S.data(1),
            spy = jasmine.createSpy("spy"),
            s = S.on(/* nothing */).S(function () { spy(); return d(); });

        spy.calls.reset();

        d(2);

        expect(spy.calls.count()).toBe(0);
    });

    it ("allows multiple dependencies", function () {
        var a = S.data(1),
            b = S.data(2),
            c = S.data(3),
            spy = jasmine.createSpy(),
            f = S.on(a, b, c).S(function () { spy(); });

        spy.calls.reset();

        a(4);
        b(5);
        c(6);

        expect(spy.calls.count()).toBe(3);
    });
});
