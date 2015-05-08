describe("S.freeze", function () {
	it("halts propagation within its scope", function () {
		var d = S.data(1),
			f = S(function() { return d(); });
			
		S.freeze(function () {
			d(2);
			expect(f()).toBe(1);
		});
		
		expect(f()).toBe(2);
	});
});