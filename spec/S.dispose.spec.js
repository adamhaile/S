describe("S.dispose()", function () {
    it("disables updates and sets computation's value to undefined", function () {
        var c = 0,
			d = S.data(0),
			dispose,
            f = S(function (disp) { c++; dispose = disp; return d(); });

		expect(c).toBe(1);
		expect(f()).toBe(0);

		d(1);

		expect(c).toBe(2);
		expect(f()).toBe(1);

		dispose();

		d(2);

		expect(c).toBe(2);
		expect(f()).toBe(undefined);
    });

	// unconventional uses of dispose -- to insure S doesn't behaves as expected in these cases

	it("works from the body of its own computation", function () {
		var c = 0,
			d = S.data(0);
			
		S(function (dispose) { c++; if (d()) dispose(); d(); });

		expect(c).toBe(1);

		d(1);

		expect(c).toBe(2);

		d(2);

		expect(c).toBe(2);
	});

	it("works from the body of a subcomputation", function () {
		var c = 0,
			d = S.data(0);
			
		S(function (dispose) {
			c++;
			d();
			S(function () {
				if (d()) dispose(); d();
			});
		});

		expect(c).toBe(1);

		d(1);

		expect(c).toBe(2);

		d(2);

		expect(c).toBe(2);
	});

	it("works from a cleanup", function () {
		var d = S.data(false);
		
		S.on(d).S(function (dispose) {
			S.cleanup(function () { dispose(); });
		});

		expect(function () { d(true); }).not.toThrow();
	});
});
