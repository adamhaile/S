describe('S.stopsign', function () {
    it('can resume updates halted by S.pause', function () {
        var sign = S.stopsign(),
            d = S.data(1),
            f = S.pause(sign).S(function () { return d(); });

        expect(f()).toBe(1);
        d(2);
        expect(f()).toBe(1);
        sign.go();
        expect(f()).toBe(2);
    });
});
