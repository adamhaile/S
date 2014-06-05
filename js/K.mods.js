(function (K) {
    "use strict";

    // modifiers
    K.detach = detach;
    K.defer = defer;
    K.throttle = throttle;
    K.debounce = debounce;
    K.ticker = ticker;
    K.throttledTicker = throttledTicker;

    return;

    // in/out modifiers
    function detach(fn) {
        return noop;
    }

    function defer(fn) {
        return function (id) {
            setTimeout(fn, 0, id);
        };
    }

    function throttle(delay) {
        return function (fn) {
            var last = 0,
                scheduled = false;

            return function (id) {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) >= delay) {
                    last = now;
                    fn(id);
                } else {
                    scheduled = true;
                    setTimeout(function () {
                        last += delay;
                        scheduled = false;
                        fn(id);
                    }, delay - (now - last));
                }
            };
        };
    }

    function debounce(delay) {
        return function (fn) {
            var tout = 0;

            return function (id) {
                if (tout) clearTimeout(tout);

                tout = setTimeout(fn, delay, id);
            };
        };
    }

    function ticker() {
        var fns = [],
            ids = [];

        ticker.mod = mod;

        return ticker;

        function ticker() {
            var _fns = fns,
                _ids = ids;

            fns = [];
            ids = [];

            for (var i = 0; i < _fns.length; i++) {
                _fns[i](_ids[i]);
            }
        }

        function mod(fn) {
            return function (id) {
                fns.push(fn);
                ids.push(id);
            }
        }
    }

    function throttledTicker() {
        var fns = {};

        ticker.mod = mod;

        return ticker;

        function ticker() {
            var _fns = fns;

            fns = [];

            for (var i in _fns) {
                _fns[i](i);
            }
        }

        function mod(fn) {
            return function (id) {
                fns[id] = fn;
            }
        }
    }
}(K));
