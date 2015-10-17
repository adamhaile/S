/* globals S, describe, it, expect */

describe("S.pin", function () {
    it("called as a computation option (no argument) ties a subcomputation to the lifespan (not update cycle) of its parent computation", function () {
        var outerTrigger = S.data(null),
            innerTrigger = S.data(null),
            outer,
            innerRuns = 0;

        outer = S(function (outer) {
            // register dependency to outer trigger
            outerTrigger();
            // inner computation
            S.pin(outer).S(function () {
                // register dependency on inner trigger
                innerTrigger();
                // count total runs
                innerRuns++;
            });
        });

        // at start, we have one inner computation, that's run once
        expect(innerRuns).toBe(1);

        // trigger the outer computation, making more inners
        outerTrigger(null);
        outerTrigger(null);

        expect(innerRuns).toBe(3);

        // now trigger inner signal: three registered computations should equal three runs
        innerRuns = 0;
        innerTrigger(null);

        expect(innerRuns).toBe(3);

        // now dispose outer computation, which should dispose all inner children
        S.dispose(outer);

        innerRuns = 0;
        innerTrigger(null);

        expect(innerRuns).toBe(0);
    });
});
