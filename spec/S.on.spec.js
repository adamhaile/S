describe("S.on(...)", function () {
    it("registers a dependency", function () {
        var d = S(1),
            spy = jasmine.createSpy("spy"),
            s = S.on(d).S(function () { spy(); });

        spy.calls.reset();

        d(2);

        expect(spy.calls.count()).toBe(1);
    });
});
