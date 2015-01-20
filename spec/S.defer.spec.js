describe("S.defer", function () {
    it("delays updates until reaching top level", function () {
        var d = S.data(1),
            f = S.defer().S(function () {
                return d();
            });

        S.formula(function () {
            d(2);
            expect(S.peek(f)).toBe(1); // need to .peek, or we register a dependency to f, which causes a circular dependency
        });

        expect(f()).toBe(2);
    });

    it("can avoid duplicated updates", function () {
        //     d
        //     |
        // +---+---+
        // v   v   v
        // f1  f2  f3
        // |   |   |
        // +---+---+
        //     |
        //  (defer)
        //     |
        //     v
        //     g
        var d = S(0),
            f1 = S.formula(function () { return d(); }),
            f2 = S.formula(function () { return d(); }),
            f3 = S.formula(function () { return d(); }),
            eagerSpy = jasmine.createSpy(""),
            deferredSpy = jasmine.createSpy(""),
            eager = S(function () { eagerSpy(); f1(); f2(); f3(); });
            deferred = S.defer().S(function () { deferredSpy(); f1(); f2(); f3(); });

        eagerSpy.calls.reset();
        deferredSpy.calls.reset();

        d(0);

        expect(eagerSpy.calls.count()).toBe(3);
        expect(deferredSpy.calls.count()).toBe(1);
    });
});
