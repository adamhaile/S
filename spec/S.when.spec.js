describe("S.when", function () {
    it("stops propagation when the signal returns undefined", function () {
        var count = 0,
            d = S.data(true),
            f = S.when(d).S(function () { count++; });

        expect(count).toBe(1);
        d(undefined);
        expect(count).toBe(1);
        d(1);
        expect(count).toBe(2);
    });
})
