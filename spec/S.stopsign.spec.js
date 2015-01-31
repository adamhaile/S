describe('S.stopsign', function () {
    it('can resume updates halted by S.pause', function () {
        var ss = S.stopsign(),
            d = S.data(1),
            f = S.pause(ss).S(function () { return d(); });

        expect(f()).toBe(1);
        d(2);
        expect(f()).toBe(1);
        ss.go();
        expect(f()).toBe(2);
    });
});
