/* globals jasmine */
describe("S.on(...)", function () {
    it("registers a dependency", function () {
        var d = S.data(1),
            spy = jasmine.createSpy(),
            f = S.on(d).S(function () { spy(); });

        expect(spy.calls.count()).toBe(1);

        d(2);

        expect(spy.calls.count()).toBe(2);
    });

    it("prohibits dynamic dependencies", function () {
        var d = S.data(1),
            spy = jasmine.createSpy("spy"),
            s = S.on(function () {}).S(function () { spy(); return d(); });

        expect(spy.calls.count()).toBe(1);

        d(2);

        expect(spy.calls.count()).toBe(1);
    });

    it("allows multiple dependencies", function () {
        var a = S.data(1),
            b = S.data(2),
            c = S.data(3),
            spy = jasmine.createSpy(),
            f = S.on(function () { a(); b(); c(); }).S(function () { spy(); });

        expect(spy.calls.count()).toBe(1);

        a(4);
        b(5);
        c(6);

        expect(spy.calls.count()).toBe(4);
    });
    
    it("allows an array of dependencies", function () {
        var a = S.data(1),
            b = S.data(2),
            c = S.data(3),
            spy = jasmine.createSpy(),
            f = S.on([a, b, c]).S(function () { spy(); });

        expect(spy.calls.count()).toBe(1);

        a(4);
        b(5);
        c(6);

        expect(spy.calls.count()).toBe(4);
    });
    
    it("modifies its accumulator when reducing", function () {
        var a = S.data(1),
            c = S.on(a).S(function (sum) { return sum + a(); }, 0);
            
        expect(c()).toBe(1);
        
        a(2);
        
        expect(c()).toBe(3);
        
        a(3);
        a(4);
        
        expect(c()).toBe(10);
    });
    
    it("suppresses initial run when onchanges is true", function () {
        var a = S.data(1),
            c = S.on(a, true).S(function () { return a() * 2; }, 0);
            
        expect(c()).toBe(0);
        
        a(2);
        
        expect(c()).toBe(4);
    })
});
