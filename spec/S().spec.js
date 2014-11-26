describe("S()", function () {
    describe("with a non-function parameter", function() {
        var s;

        beforeEach(function () {
            s = S(1);
        });

        it("generates a function", function () {
            expect(s).toEqual(jasmine.any(Function));
        });

        it("returns value of initial parameter", function () {
            expect(s()).toBe(1);
        });
    });

    describe("with a function parameter", function() {
        var s;

        beforeEach(function () {
            s = S(function () { return 1; });
        });

        it("generates a function", function () {
            expect(s).toEqual(jasmine.any(Function));
        });

        it("returns value of evaluating function", function () {
            expect(s()).toBe(1);
        });
    });
});
