(function (S) {
    "use strict";

    S.sub = sub;

    return;

    function sub(/* arg1, arg2, ... argn, fn */) {
        var args = Array.prototype.slice.call(arguments),
            fn = function () { },
            realFn = args.pop(),
            len = args.length,
            values = new Array(len),
            sub = S(function () {
                for (var i = 0; i < len; i++) {
                    values[i] = args[i]();
                }

                return S.peek(function () {
                    return fn.apply(undefined, values);
                });
            });

        fn = realFn;

        return sub;
    }
}(S));
