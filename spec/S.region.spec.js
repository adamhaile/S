describe('S.region', function () {
    it('can resume updates halted by S.pause', function () {
        var region = S.region(),
            d = S.data(1),
            f = S.pause(region).S(function () { return d(); });

        expect(f()).toBe(1);
        d(2);
        expect(f()).toBe(1);
        region.go();
        expect(f()).toBe(2);
    });
});
