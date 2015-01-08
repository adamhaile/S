define('Chainable', [], function () {

    return function Chainable(fn, key, prev, head) {
        this.head = head !== undefined ? head : (prev && prev.head !== undefined) ? prev.head : null;
        this[key] = (prev && prev[key] !== undefined) ? compose(fn, prev[key]) : fn;
    }

    function compose(f, g) {
        return function compose(x) { return f(g(x)); };
    }

});
