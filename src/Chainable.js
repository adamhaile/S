define('Chainable', [], function () {

    return function Chainable(fn, prev, head) {
        this.head = head !== undefined ? head : (prev && prev.head !== undefined) ? prev.head : null;
        this.fn = (prev && prev.fn !== undefined) ? compose(fn, prev.fn) : fn;
    }

    function compose(f, g) {
        return function compose(x) { return f(g(x)); };
    }

});
