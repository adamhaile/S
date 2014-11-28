(function (S) {
    S.Chainable = Chainable;

    return;

    function Chainable(fn, prev, head) {
        this.head = head !== undefined ? head : (prev && prev.head !== undefined) ? prev.head : null;
        this.fn = (prev && prev.fn !== undefined) ? compose(prev.fn, fn) : fn;
    }

    function compose(f, g) {
        return function compose(x) { return f(g(x)); };
    }

})(S);
