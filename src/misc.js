define('misc', [], function () {
    return {
        proxy: proxy
    };

    function proxy(getter, setter) {
        return function proxy(value) {
            if (arguments.length !== 0) setter(value);
            return getter();
        };
    }
});
