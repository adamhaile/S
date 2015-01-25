describe("Transformers.defer1", function () {
    it("delays updates until reaching top level", function () {
        var d = S.data(1),
            f = d.pipe().defer1().S();

        S.formula(function () {
            d(2);
            expect(S.peek(f)).toBe(1); // need to .peek, or we register a dependency to f, which causes a circular dependency
        });

        expect(f()).toBe(2);
    });
});

describe("Transformers.filter", function () {
    it("cancels updates when the predicate returns falsy", function () {
        var d = S(1),
            s = d.pipe().filter(function (v) { return v % 2; }).S();

        expect(s()).toBe(1);
        d(2);
        expect(s()).toBe(1);
        d(3);
        expect(s()).toBe(3);
    });
});

describe("Transformers.changes", function () {
    it("filters updates to only those where the value has changed", function () {

    })
});
