describe("S.subclock()", () => {
    it("runs enclosed computations to completion before returning", function () {
        S.root(() => {
            var d = S.data(1),
                f = S.subclock()(() => {
                    var out = S.data(2);
                    S(() => d() < 10 && out(d()));
                    return out;
                }),
                c = S.on(f, c => c + 1, 0);

            expect(f()).toBe(1);
            expect(c()).toBe(1);
            d(2);
            expect(f()).toBe(2);
            expect(c()).toBe(2);
            d(12);
            expect(f()).toBe(2);
            expect(c()).toBe(2);
            d(8);
            expect(f()).toBe(8);
            expect(c()).toBe(3);
        });
    });

    it("descendent computations see all states", () => {
        S.root(() => {
            var { d, f } = S.subclock(() => {
                var d = S.data(5),
                    f = S.subclock(() =>
                        S.on(d, c => c + 1, 0)
                    );

                S(() => d() >= 5 || d(d() + 1));

                return { d, f };
            });
            
            expect(f()).toBe(1);
            d(1);
            expect(f()).toBe(6);
        });
    });
    
    it("ancestor computations only see final state", function () {
        S.root(function () {
            var { d, f } = S.subclock(() => {
                var d = S.subclock(() => {
                        var d = S.data(5);
                        S(() => d() >= 5 || d(d() + 1));
                        return d;
                    }),
                    f = S.on(d, c => c + 1, 0);
                return { d, f };
            });
            
            expect(d()).toBe(5);
            expect(f()).toBe(1);
            d(1);
            expect(d()).toBe(5);
            expect(f()).toBe(2);
        });
    });

    it("sibling processes and nodes only see final state", function () {
        S.root(()=>{
            var d = S.data("abcdefgh"),
                c1 = S.subclock(()=>{
                    var d1 = S.data(""),
                        n1 = S(() => d1(d())),
                        n2 = S(() => d1().length < 6 || d1(d1().substr(1)));
                    return { d1, n1, n2 };
                }),
                c2 = S.subclock(()=>{
                    var d1 = S.data(""),
                        n1 = S(() => d1(c1.d1())),
                        n2 = S(() => d1().length < 4 || d1(d1().substr(0, d1().length - 1)));
                    return { d1, n1, n2 };
                }),
                n3 = S(() => c2.d1()),
                n3c = S.on(n3, c => c + 1, 0);
            
            expect(d()).toBe("abcdefgh");
            expect(c1.d1()).toBe("defgh");
            expect(c2.d1()).toBe("def");
            expect(n3()).toBe("def");
            expect(n3c()).toBe(1);

            d("1234567");
            expect(c1.d1()).toBe("34567");
            expect(c2.d1()).toBe("345");
            expect(n3()).toBe("345");
            expect(n3c()).toBe(2);
        });
    })

    it("handles whiteboard case", function () {
        S.root(function () {
            var t = "",
                d = S.data(1),
                p1 = S.subclock()(function () {
                    var c1 = S(() => {
                            t += 'p1c1,';
                            return d() + (d() > 1 ? c2() : 0);
                        });
                    return { c1 };
                }),
                p2 = S.subclock()(function () {
                    var d1 = S.data(1),
                        c1 = S(() => {
                            t += 'p2c1,';
                            return d1(d());
                        });
                    return { d1, c1 };
                }),
                p3 = S.subclock()(function () {
                    var d1 = S.data(1),
                        c1 = S(() => {
                            t += 'p3c1,';
                            d1(p2.d1());
                        });
                    return { d1, c1 };
                }),
                c1 = S(() => {
                    t += 'c1,';
                    return p3.d1();
                }),
                c2 = S(() => {
                    t += 'c2,';
                    return c1(); 
                });
            
            expect(p1.c1()).toBe(1);
            t = '';
            d(2);
            expect(p1.c1()).toBe(4);
            expect(t).toBe('p1c1,p2c1,p3c1,c2,c1,');
            t = '';
            d(1);
            expect(p1.c1()).toBe(1);
            expect(t).toBe('p2c1,p3c1,p1c1,c1,c2,');
            t = '';
            d(3);
            expect(p1.c1()).toBe(6);
            expect(t).toBe('p1c1,p2c1,p3c1,c2,c1,');
            t = '';
            d(2);
            expect(p1.c1()).toBe(4);
            expect(t).toBe('p2c1,p3c1,p1c1,c2,c1,');
            t = '';
            d(2);
            expect(p1.c1()).toBe(4);
            expect(t).toBe('p2c1,p3c1,p1c1,c2,c1,');
            t = '';
            d(5);
            expect(p1.c1()).toBe(10);
            expect(t).toBe('p2c1,p3c1,p1c1,c2,c1,');
        });
    });
});