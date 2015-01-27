describe("S.data", function () {
    it("takes and returns an initial value", function () {
        expect(S.data(1)()).toBe(1);
    });

    it("requires that an initial value is specified'", function () {
        expect(function () { S.data(); }).toThrow();
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

    it("does not acccept undefined as an initial or new value", function () {
        expect(function () { d.data(undefined); }).toThrow();
        expect(function () { d.data(1)(undefined); }).toThrow();
    });
});
