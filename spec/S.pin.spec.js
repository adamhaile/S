describe("S.pin", function () {
    it("called with no arg (as a formula option) ties a subformula to the lifespan (not update cycle) of its parent formula", function () {
        var outerTrigger = S.data(null),
            innerTrigger = S.data(null),
            outer,
            innerRuns = 0;

        outer = S(function () {
            // register dependency to outer trigger
            outerTrigger();
            // inner formula
            S.pin().S(function () {
                // register dependency on inner trigger
                innerTrigger();
                // count total runs
                innerRuns++;
            });
        });

        // at start, we have one inner formula, that's run once
        expect(innerRuns).toBe(1);

        // trigger the outer formula, making more inners
        outerTrigger(null);
        outerTrigger(null);

        expect(innerRuns).toBe(3);

        // now trigger inner signal: three registered formulas should equal three runs
        innerRuns = 0;
        innerTrigger(null);

        expect(innerRuns).toBe(3);

        // now dispose outer formula, which should dispose all inner children
        outer.dispose();

        innerRuns = 0;
        innerTrigger(null);

        expect(innerRuns).toBe(0);
    });

    it("called with a function marks a region in which all new subformulas are tied to the lifespan (not update cycle) of their parent formula", function () {
        var outerTrigger = S.data(null),
            innerTrigger = S.data(null),
            outer,
            innerRuns = 0;

        outer = S(function () {
            // register dependency to outer trigger
            outerTrigger();
            // inner formula
            S.pin(function () {
                S(function () {
                    // register dependency on inner trigger
                    innerTrigger();
                    // count total runs
                    innerRuns++;
                });
                S(function () {
                    // register dependency on inner trigger
                    innerTrigger();
                    // count total runs
                    innerRuns++;
                });
            });
        });

        // at start, we have two subformulas, that're run once each
        expect(innerRuns).toBe(2);

        // trigger the outer formula, making more inners
        outerTrigger(null);
        outerTrigger(null);

        expect(innerRuns).toBe(6);

        // now trigger inner signal: three registered formulas should equal three runs
        innerRuns = 0;
        innerTrigger(null);

        expect(innerRuns).toBe(6);

        // now dispose outer formula, which should dispose all inner children
        outer.dispose();

        innerRuns = 0;
        innerTrigger(null);

        expect(innerRuns).toBe(0);
    });
});
