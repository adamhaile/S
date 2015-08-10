describe('S.collector', function () {
    it('can resume updates halted by S.gate', function () {
        var col = S.collector(),
            d = S.data(1),
            f = S.gate(col).S(function () { return d(); });

        expect(f()).toBe(1);
        d(2);
        expect(f()).toBe(1);
        col.go();
        expect(f()).toBe(2);
    });
});
