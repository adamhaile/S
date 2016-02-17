/* globals jasmine */
describe("S.on(...)", function () {
    it("registers a dependency", function () {
        var d = S.data(1),
            spy = jasmine.createSpy(),
            f = S.on(d, function () { spy(); }, null);

        expect(spy.calls.count()).toBe(0);

        d(2);

        expect(spy.calls.count()).toBe(1);
    });

    it("prohibits dynamic dependencies", function () {
        var d = S.data(1),
            spy = jasmine.createSpy("spy"),
            s = S.on(function () {}, function () { spy(); return d(); }, null);

        expect(spy.calls.count()).toBe(0);

        d(2);

        expect(spy.calls.count()).toBe(0);
    });

    it("allows multiple dependencies", function () {
        var a = S.data(1),
            b = S.data(2),
            c = S.data(3),
            spy = jasmine.createSpy(),
            f = S.on(function () { a(); b(); c(); }, function () { spy(); }, null);

        expect(spy.calls.count()).toBe(0);

        a(4);
        b(5);
        c(6);

        expect(spy.calls.count()).toBe(3);
    });
    
    it("modifies its accumulator", function () {
        var a = S.data(1),
            c = S.on(a, function (sum) { return sum + a(); }, 0);
            
        expect(c()).toBe(0);
        
        a(2);
        
        expect(c()).toBe(2);
        
        a(3);
        a(4);
        
        expect(c()).toBe(9);
    })
});
