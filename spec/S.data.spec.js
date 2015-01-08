describe("S.data", function () {
    describe("creation", function () {
        it("throws if no initial value is passed", function () {
            expect(function () { S.data(); }).toThrow();
        });

        it("throws if initial value is undefined", function () {
            expect(function () { S.data(undefined); }).toThrow();
        });

        it("generates a function", function () {
            expect(S.data(1)).toEqual(jasmine.any(Function));
        });

        it("returns initial value", function () {
            expect(S.data(1)()).toBe(1);
        });
    });

    describe("update", function () {
        var d;

        beforeEach(function () {
            d = S.data(1);
            d(2);
        });

        it("changes returned value", function () {
            expect(d()).toBe(2);
        });

        it("cannot be set to undefined", function () {
            expect(function () { d(undefined); }).toThrow();
        });

        it("returns value being updated", function () {
            expect(d(3)).toBe(3);
        });
    });
});

function propagateSpeed(nary, depth) {
    console.time("propagateSpeed");

    var root = S(0), c = 0, i;

    tree(root, nary, depth);

    for (i = 1; i <= 10000; i++) {
        root(i);
    }

    console.timeEnd("propagateSpeed");

    return c;

    function tree(node, nary, depth) {
        if (depth <= 0) return;
        for (var i = 0; i < nary; i++) {
            tree(S(function () { c++; return node() + 1; }), nary, depth - 1);
        }
    }
}

function propagateSpeed2(nary) {
    console.time("propagateSpeed");

    var sources = [], c = 0, i, j;

    for (i = 0; i < nary; i++) {
        sources.push(S(i));
    }

    var f = S(function () {
        c++;
        for (var i = 0; i < sources.length; i++) {
            sources[i]();
        }
    })

    for (i = 1; i <= 10000; i++) {
        for (j = 0; j < sources.length; j++) {
            sources[j](j);
        }
    }

    console.timeEnd("propagateSpeed");

    return c;
}

function dataCreateSpeed(count) {
    console.time("dataCreateSpeed");

    var i;

    for (i = 0; i < count; i++) {
        S.data(i);
    }

    console.timeEnd("dataCreateSpeed");
}

function formulaCreateSpeed(count) {
    console.time("formulaCreateSpeed");

    var i;

    for (i = 0; i < count; i++) {
        S.formula(function () { });
    }

    console.timeEnd("formulaCreateSpeed");
}
