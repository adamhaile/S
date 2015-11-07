describe("S.dispose()", function () {
    it("disables updates and sets computation's value to undefined", function () {
        var c = 0,
			d = S.data(0),
            f = S(function () { c++; return d(); });

		expect(c).toBe(1);
		expect(f()).toBe(0);

		d(1);

		expect(c).toBe(2);
		expect(f()).toBe(1);

		S.dispose(f);

		d(2);

		expect(c).toBe(2);
		expect(f()).toBe(1);
    });

	// unconventional uses of dispose -- to insure S doesn't behaves as expected in these cases

	it("works from the body of its own computation", function () {
		var c = 0,
			d = S.data(0),
			f = S(function () { c++; if (d()) S.dispose(f); d(); });

		expect(c).toBe(1);

		d(1);

		expect(c).toBe(2);

		d(2);

		expect(c).toBe(2);
	});

	it("works from the body of a subcomputation", function () {
		var c = 0,
			d = S.data(0),
			f = S(function () {
				c++;
				d();
				S(function () {	if (d()) S.dispose(f); });
			});

		expect(c).toBe(1);

		d(1);

		expect(c).toBe(2);

		d(2);

		expect(c).toBe(2);
	});
});
