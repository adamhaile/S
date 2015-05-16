describe("S.dispose()", function () {
	it("works from inside its own formula", function () {
		var c = 0,
			d = S.data(0),
			f = S(function () { c++; if (d()) f.dispose(); d(); });
			
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
});