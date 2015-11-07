describe("S.event", function () {
	it("batches changes until end", function () {
		var d = S.data(1);
			
		S.event(function () {
			d(2);
			expect(d()).toBe(1);
		});
		
		expect(d()).toBe(2);
	});
	
	it("halts propagation within its scope", function () {
		var d = S.data(1),
			f = S(function() { return d(); });
			
		S.event(function () {
			d(2);
			expect(f()).toBe(1);
		});
		
		expect(f()).toBe(2);
	});
});