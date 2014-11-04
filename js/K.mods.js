(function (K) {
    "use strict";

    K.defer          = Chainable.prototype.defer          = chainableDefer;
    K.delay          = Chainable.prototype.delay          = chainableDelay;
    K.debounce       = Chainable.prototype.debounce       = chainableDebounce;
    K.throttle       = Chainable.prototype.throttle       = chainableThrottle;
    K.pause          = Chainable.prototype.pause          = chainablePause;
    K.throttledPause = Chainable.prototype.throttledPause = chainableThrottledPause;

    return;

    function chainableDefer()     { return new Chainable(defer,       this); }
    function chainableDelay(t)    { return new Chainable(delay(t),    this); }
    function chainableDebounce(t) { return new Chainable(debounce(t), this); }
    function chainableThrottle(t) { return new Chainable(throttle(t), this); }
    function chainablePause(s)    { return new Chainable(pause(s),    this); }
    function chainableThrottledPause(s) { return new Chainable(throttledPause(s), this); }

    function defer(fn) {
        var scheduled = false;

        return function (x) {
            if (scheduled) return;

            scheduled = true;

            K.defer(function deferred() {
                scheduled = false;
                fn(x);
            });
        };
    }

    function delay(t) {
        return function (fn) {
            return function delayed() { setTimeout(fn, t); }
        }
    }

    function throttle(t) {
        return function throttle(fn) {
            var last = 0,
                scheduled = false;

            return function (x) {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) >= t) {
                    last = now;
                    fn();
                } else {
                    scheduled = true;
                    setTimeout(function throttled() {
                        last = Date.now();
                        scheduled = false;
                        fn(x);
                    }, t - (now - last));
                }
            };
        };
    }

    function debounce(t) {
        return function (fn) {
            var tout = 0;

            return function (x) {
                if (tout) clearTimeout(tout);

                tout = setTimeout(function debounced() {
                    fn(x);
                }, t);
            };
        };
    }

    function pause(signal) {
        var fns = [];

        signal.go = go;

        return function (fn) {
            return function (x) {
                fns.push(function paused() { fn(x); });
            }
        }

        function go() {
            var i;

            for (i = 0; i < fns.length; i++) {
                fns[i]();
            }
        }
    }


    function throttledPause(signal) {
        var fns = [];

        signal.go = go;

        return function (fn) {
            var scheduled = false;

            return function (x) {
                if (scheduled) return;

                scheduled = true;

                fns.push(function paused() {
                    scheduled = false;

                    fn(x);
                });
            }
        }

        function go() {
            var i;

            for (i = 0; i < fns.length; i++) {
                fns[i]();
            }
        }
    }
}(K));
