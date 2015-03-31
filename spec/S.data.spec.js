describe("S.data", function () {
    it("takes and returns an initial value", function () {
        expect(S.data(1)()).toBe(1);
    });

    it("can be set by passing in a new value", function () {
        var d = S.data(1);
        d(2);
        expect(d()).toBe(2);
    });

    it("returns value being set", function () {
        var d = S.data(1);
        expect(d(2)).toBe(2);
    });
});
