describe("S.dispose()", function () {
    it("disables updates and sets formula's value to undefined", function () {
        var c = 0,
			d = S.data(0),
            f = S(function () { c++; return d(); });
			
		expect(c).toBe(1);
		expect(f()).toBe(0);
		
		d(1);
		
		expect(c).toBe(2);
		expect(f()).toBe(1);
		
		f.dispose();
		
		d(2);
		
		expect(c).toBe(2);
		expect(f()).toBe(undefined);
    });
	
	// unconventional uses of dispose -- to insure S doesn't behaves as expected in these cases
	
	it("works from the body of its own formula", function () {
		var c = 0,
			d = S.data(0),
			f = S(function () { c++; if (d()) f.dispose(); d(); });

		expect(c).toBe(1);

		d(1);

		expect(c).toBe(2);

		d(2);

		expect(c).toBe(2);
	});

	it("works from the body of a subformula", function () {
		var c = 0,
			d = S.data(0),
			f = S(function () {
					c++;
					d();
					S(function () {
						if (d()) f.dispose(); d();
					});
				});

		expect(c).toBe(1);

		d(1);

		expect(c).toBe(2);

		d(2);

		expect(c).toBe(2);
	});

	it("works from a cleanup", function () {
		var d = S.data(false),
			f = S.on(d).S(function () {
				S.cleanup(function () { f.dispose(); });
			});

		expect(function () { d(true); }).not.toThrow();
	});

	it("works from a finalizer", function () {
		var d = S.data(false),
			f = S.on(d).S(function () {
				S.finalize(function () { f.dispose(); });
			});

		expect(f.dispose).not.toThrow();
	});
});
