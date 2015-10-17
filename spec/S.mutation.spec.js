describe("Computations which modify data", function () {
    it("freeze data while executing computation", function () {
        var a = S.data(false),
            b = S.data(0),
            cb,
            c = S.watch(a).S(function () { b(b() + 1); cb = b(); });
        
        b(0);
        a(true);
        
        expect(b()).toBe(1);
        expect(cb).toBe(0);
    });
    
    it("freeze data while propagating", function () {
        var seq = "",
            a = S.data(false),
            b = S.data(0),
            db,
            c = S.watch(a).S(function () { seq += "c"; b(b() + 1); }),
            d = S.watch(a).S(function () { seq += "d"; db = b(); });
        
        b(0);
        seq = "";
        a(true);
        
        expect(seq).toBe("cd");
        expect(b()).toBe(1);
        expect(db).toBe(0); // d saw b(0) even though it ran after c whcih modified b() to b(1)
    });
    
    it("continue running until changes stop", function () {
        var seq = "",
            a = S.data(0);
       
        S(function () { seq += a(); if (a() < 10) a(a() + 1); });
        
        expect(seq).toBe("012345678910");
        expect(a()).toBe(10);
    });
    
    it("propagate changes topologically", function () {
        //
        //    d1      d2
        //    |  \  /  |
        //    |   c1   |
        //    |   ^    |
        //    |   :    |
        //    b1  b2  b3 
        //      \ | /
        //        a1
        //
        var seq = "",
            a1 = S.data(0),
            c1 = S.data(0),
            b1 = S.watch(a1).S(function () { }),
            b2 = S.watch(a1).S(function () { c1(a1()); }),
            b3 = S.watch(a1).S(function () { }),
            d1 = S.watch(b1, c1).S(function () { seq += "c4(" + c1() + ")"; }),
            d2 = S.watch(b3, c1).S(function () { seq += "c5(" + c1() + ")"; });

        seq = "";
        a1(1);

        expect(seq).toBe("c4(0)c5(0)c4(1)c5(1)");
    });

})
