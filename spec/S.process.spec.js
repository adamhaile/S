describe("S.process", function () {
    it("runs enclosed computations to completion before returning", function () {
        S.root(function () {
            var d = S.data(1),
                f = S.process()(function () {
                    var out = S.data(2),
                        c = S(function () {
                            if (d() < 10) out(d());
                        });
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

    it("handles whiteboard case", function () {
        S.root(function () {
            var t = "",
                d = S.data(1),
                p1 = S.process()(function () {
                    var c1 = S(() => {
                            t += 'p1c1,';
                            return d() + (d() > 1 ? c2() : 0);
                        });
                    return { c1 };
                }),
                p2 = S.process()(function () {
                    var d1 = S.data(1),
                        c1 = S(() => {
                            t += 'p2c1,';
                            return d1(d());
                        });
                    return { d1, c1 };
                }),
                p3 = S.process()(function () {
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