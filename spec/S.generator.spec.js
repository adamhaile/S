describe("S.generator", function () {
    it("marks a region in which generated formulas are tied to the lifespan (not update cycle) of any parent formula", function () {
        var outerTrigger = S.data(null),
            innerTrigger = S.data(null),
            outer,
            innerRuns = 0;

        outer = S(function () {
            // register dependency to outer trigger
            outerTrigger();
            // generator
            S.generator(function () {
                // inner formula
                S(function () {
                    // register dependency on inner trigger
                    innerTrigger();
                    // count total runs
                    innerRuns++;
                });
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
});
