define('schedulers', ['S'], function (S) {

    var _S_defer = S.defer;

    return {
        defer: defer,
        delay: delay,
        throttle: throttle,
        debounce: debounce,
        pause: pause,
        throttledPause: throttledPause
    };

    function defer(fn) {
        if (fn !== undefined) return _S_defer(fn);

        return function (update, id) {
            var scheduled = false;

            return function deferred() {
                if (scheduled) return;

                scheduled = true;

                _S_defer(function deferred() {
                    scheduled = false;
                    update();
                });
            }
        };
    }

    function delay(t) {
        return function (update, id) {
            return function delayed() { setTimeout(update, t); }
        }
    }

    function throttle(t) {
        return function throttle(fn) {
            var last = 0,
            scheduled = false;

            return function () {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) > t) {
                    last = now;
                    fn();
                } else {
                    scheduled = true;
                    setTimeout(function throttled() {
                        last = Date.now();
                        scheduled = false;
                        fn();
                    }, t - (now - last));
                }
            };
        };
    }

    function debounce(t) {
        return function (fn) {
            var last = 0,
            tout = 0;

            return function () {
                var now = Date.now();

                if (now > last) {
                    last = now;
                    if (tout) clearTimeout(tout);

                    tout = setTimeout(fn, t);
                }
            };
        };
    }

    function pause(signal) {
        var fns = [];

        S.formula(function resume() {
            if (!signal()) return;

            for (var i = 0; i < fns.length; i++) {
                fns[i]();
            }

            fns = [];
        });

        return function (fn) {
            return function () {
                fns.push(fn);
            }
        }
    }

    function throttledPause(signal) {
        var fns = [];

        S.formula(function resume() {
            if (!signal()) return;

            for (var i = 0; i < fns.length; i++) {
                fns[i]();
            }

            fns = [];
        });

        return function (fn) {
            var scheduled = false;

            return function () {
                if (scheduled) return;

                scheduled = true;

                fns.push(function paused() {
                    scheduled = false;

                    fn();
                });
            }
        };
    }
});
