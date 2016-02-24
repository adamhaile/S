describe("S.hold()", function () {
    it("allows computations to report that they want to maintain their current value", function () {
        var a = S.data(1),
            b = S(function () { return a() === 2 ? S.hold() : a(); });
            
        expect(b()).toBe(1);
        
        a(2);
        
        expect(b()).toBe(1);
        
        a(3);
        
        expect(b()).toBe(3);
    });
    
    it("aborts downstream updates when a computation holds", function () {
        var a = S.data(1),
            b = S(function () { return a() === 2 ? S.hold() : a(); }),
            spy = jasmine.createSpy(),
            c = S(function () { spy(); b(); });
            
        expect(spy.calls.count()).toBe(1);
        
        a(2);
        
        expect(spy.calls.count()).toBe(1);
        
        a(3);
        
        expect(spy.calls.count()).toBe(2);
    });
});