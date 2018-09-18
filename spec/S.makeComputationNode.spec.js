describe("S.makeComputationNode()", () => S.root(() => {
    it("returns null if function doesn't reference a signal", () => {
        const { node, value } = S.makeComputationNode(() => 1, undefined, false, false);

        expect(node).toBe(null);
        expect(value).toBe(1);
    });

    it("returns a node if function does reference a signal", () => {
        const
            d = S.makeDataNode(1), 
            { node, value } = S.makeComputationNode(() => d.current(), undefined, false, false);

        expect(node).not.toBe(null);
        expect(value).toBe(1);
        expect(node.current()).toBe(1);
    });

    it("is listening", () => {
        S.makeComputationNode(() => {
            expect(S.isListening()).toBe(true);
        })
    });

    it("is frozen", () => {
        S.makeComputationNode(() => {
            expect(S.isFrozen()).toBe(true);
        })
    });
}));