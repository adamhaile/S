describe("S() with subcomputations", function () {

    it("does not register a dependency on the subcomputation", function () {
        var d = S.data(1),
            spy = jasmine.createSpy("spy"),
            gspy = jasmine.createSpy("gspy"),
            f = S(function () { spy(); g = S(function () { gspy(); return d(); }); })

        spy.calls.reset();
        gspy.calls.reset();

        d(2);

        expect(gspy.calls.count()).toBe(1);
        expect(spy.calls.count()).toBe(0);
    });

    describe("with child", function () {
        var d, e, fspy, f, gspy, g, h;

        beforeEach(function () {
            d = S.data(1);
            e = S.data(2);
            fspy = jasmine.createSpy("fspy");
            gspy = jasmine.createSpy("gspy");
            f = S(function () {
                fspy();
                d();
                g = S(function () {
                    gspy();
                    return e();
                });
            });
            h = g;
        });

        it("creates child on initialization", function () {
            expect(h).toEqual(jasmine.any(Function));
            expect(h()).toBe(2);
        });

        it("does not depend on child's dependencies", function () {
            e(3);
            expect(fspy.calls.count()).toBe(1);
            expect(gspy.calls.count()).toBe(2);
        });

        it("disposes old child when updated", function () {
            // re-evalue parent, thereby disposing stale g, which we've stored at h
            d(2);
            // h is now disposed
            expect(h()).not.toBeDefined();
        });

        it("disposes child when it is disposed", function () {
            f.dispose();
            expect(g()).not.toBeDefined();
        });
    });

    describe("with child and gate", function () {
        var d, f, g, c;

        beforeEach(function () {
            d = S.data(1);
            c = S.collector();
            f = S.gate(c).S(function () {
                g = S(function () {
                    return d();
                });
            });
        });

        it("applies gate to child", function () {
            d(2);
            expect(g()).toBe(1);
            c.go();
            expect(g()).toBe(2);
        });
    });

});
