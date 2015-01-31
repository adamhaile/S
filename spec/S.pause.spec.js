describe('S.pause', function () {
    it('hands update execution off to the supplied collector function', function () {
        var resume,
            collector = function (fn) { resume = fn; },
            trigger = S.data(1),
            fruns = 0,
            f = S.pause(collector).S(function () { trigger(); fruns++; });

        // at first, no updates have run, so no resume collected
        expect(resume).not.toBeDefined();
        expect(fruns).toBe(1);

        // trigger an update
        trigger(2);

        // resume collected, but f still not updated
        expect(resume).toEqual(jasmine.any(Function));
        expect(fruns).toBe(1);

        // trigger resume
        resume();

        // now f is updated
        expect(fruns).toBe(2);
    });
});
