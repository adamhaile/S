describe("S() with subcomputations", function () {

    it("does not register a dependency on the subcomputation", function () {
        var d = S.data(1),
            spy = jasmine.createSpy("spy"),
            gspy = jasmine.createSpy("gspy"),
            f = S(function () { spy(); var g = S(function () { gspy(); return d(); }); })

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
            e(3);
            // h is now disposed
            expect(h()).toBe(2);
        });

        it("disposes child when it is disposed", function () {
            S.dispose(f);
            e(3);
            expect(g()).toBe(2);
        });
    });

    describe("with child and async", function () {
        var d, f, g, go;

        beforeEach(function () {
            d = S.data(1);
            go = null;
            f = S.async(function (g) { go = g; }).S(function () {
                g = S(function () {
                    return d();
                });
            });
        });

        it("applies gate to child", function () {
            d(2);
            expect(g()).toBe(1);
            go();
            expect(g()).toBe(2);
        });
    });

    describe("which disposes sub that's being updated", function () {
        it("propagates successfully", function () {
            var a = S.data(1),
                b = S(function () {
                    var c = S(function () { return a(); });
                    a();
                    return { c: c };
                }),
                d = S(function () {
                    return b().c();
                });
            
            expect(d()).toBe(1);
            a(2);
            expect(d()).toBe(2);
            a(3);
            expect(d()).toBe(3);
        });
    });
    
    describe("which disposes a sub with a dependee with a sub", function () {
        it("propagates successfully", function () {
            var a = S.data(1),
                c,
                b = S(function () {
                    c = S(function () {
                        return a();
                    });
                    a();
                    return { c : c };
                }),
                d = S(function () {
                    c();
                    var e = S(function () {
                        return a();
                    });
                    return { e : e };
                });
                
            expect(d().e()).toBe(1);
            a(2);
            expect(d().e()).toBe(2);
            a(3);
            expect(d().e()).toBe(3);
        });
    });
});
