describe("S.computations which modify S.data", function () {
    it("propagates in topological order", function () {
        //
        //      c2
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
            c1 = S.on(b1, a2).S(function () { seq += "(c1:" + a2()                    +  ")"; });

        a2(1);
        seq = "";
        a1(true);

        expect(seq).toBe("(b1:1(b2:1)(b2:2))(c1:2)");
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
})
