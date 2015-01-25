describe("S.filter(...)", function() {
    it("cancels updates when the filter returns falsy", function () {
        var d = S(1),
            s = S.filter(function () { return d() % 2; }).S(d);

        expect(s()).toBe(1);
        d(2);
        expect(s()).toBe(1);
        d(3);
        expect(s()).toBe(3);
    });
});
