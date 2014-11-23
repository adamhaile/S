(function (K) {
    K.Chainable = Chainable;

    return;

    function Chainable(fn, prev, head) {
        this.head = head !== undefined ? head : (prev && prev.hasOwnProperty('head')) ? prev.head : null;
        this.fn = (prev && prev.hasOwnProperty('fn')) ? compose(fn, prev.fn) : fn;
    }

    function compose(f, g) {
        return function(x) { return f(g(x)); };
    }

})(K);
