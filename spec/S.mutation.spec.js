describe("S.computations which modify S.data", function () {
    it("propagates in topological order", function () {
        //
        //      c1
        //     / \
        //   /    \
        //  b1.    b2
        //   \ `. /\
        //    \ /.  \
        //    a1  `> a2
        //
        var seq = "",
            a1 = S.data(true),
            a2 = S.data(1),
            b1 = S.on(a1)    .S(function () { seq += "(b1:" + a2(); a2(a2() + 1); seq += ")"; }),
            b2 = S.on(a1, a2).S(function () { seq += "(b2:" + a2()                    +  ")"; }),
            c1 = S.on(b1, b2).S(function () { seq += "(c1:" + a2()                    +  ")"; });

        a2(1);
        seq = "";
        a1(true);

        expect(seq).toBe("(b1:1)(b2:1)(c1:1)(b2:2)(c1:2)");
    });

    it("strings all mutations onto the call stack", function () {
        var a1 = S.data(true),
            a2 = S.data(1),
            bs = [],
            c = 0;

        for (var i = 0; i < 3000; i++) {
            bs.push(S.on(a1).S(function () { c++; a2(a2() + 1); }));
        }

        c = 0;
        a2(1);
        a1(true);

        expect(a2()).toBe(2);
        expect(c).toBe(3000);
    });
    
    it("clears subsequent mutations before responding to mutation", function () {
        // Despite parallel structure, c4 runs once while c5 runs twice, 
        // b/c the set from c1 blocks further propagation until the set
        // from c2 to its right has finished.
        //
        //        c4      c5
        //        |  \  /  |
        //        |   d3   |
        //        |   ^    |
        //        |   :    |
        // d2 <.. c1  c2  c3 ..> d4
        //          \ | /
        //            d1
        //
        var seq = "",
            x = 1,
            d1 = S.data(x++),
            d2 = S.data(x++),
            d3 = S.data(x++),
            d4 = S.data(x++),
            c1 = S.on(d1).S(function () { d2(x++); }),
            c2 = S.on(d1).S(function () { d3(x++); }),
            c3 = S.on(d1).S(function () { d4(x++); }),
            c4 = S.on(c1, d3).S(function () { seq += "c4"; }),
            c5 = S.on(c3, d3).S(function () { seq += "c5"; });

        seq = "";
        d1(x++);

        expect(seq).toBe("c4c5c4c5");
    });

})
