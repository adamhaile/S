/* globals S, describe, it, expect */

describe("S.root()", function () {
    it("allows subcomputations to escape their parents", function () {
        S.root(function () {
            var outerTrigger = S.data(null),
                innerTrigger = S.data(null),
                outer,
                innerRuns = 0;

            outer = S(function () {
                // register dependency to outer trigger
                outerTrigger();
                // inner computation
                S.root(function () {
                    S(function () {
                        // register dependency on inner trigger
                        innerTrigger();
                        // count total runs
                        innerRuns++;
                    });
                });
            });

            // at start, we have one inner computation, that's run once
            expect(innerRuns).toBe(1);

            // trigger the outer computation, making more inners
            outerTrigger(null);
            outerTrigger(null);

            expect(innerRuns).toBe(3);

            // now trigger inner signal: three orphaned computations should equal three runs
            innerRuns = 0;
            innerTrigger(null);

            expect(innerRuns).toBe(3);
        });
    });
});
