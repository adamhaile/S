(function (S) {
    S.deferMod       = S.Chainable.prototype.defer          = chainableDefer;
    S.delay          = S.Chainable.prototype.delay          = chainableDelay;
    S.debounce       = S.Chainable.prototype.debounce       = chainableDebounce;
    S.throttle       = S.Chainable.prototype.throttle       = chainableThrottle;
    S.pause          = S.Chainable.prototype.pause          = chainablePause;
    S.throttledPause = S.Chainable.prototype.throttledPause = chainableThrottledPause;

    return;

    function chainableDefer()     { return new S.Chainable(defer,       this); }
    function chainableDelay(t)    { return new S.Chainable(delay(t),    this); }
    function chainableDebounce(t) { return new S.Chainable(debounce(t), this); }
    function chainableThrottle(t) { return new S.Chainable(throttle(t), this); }
    function chainablePause(s)    { return new S.Chainable(pause(s),    this); }
    function chainableThrottledPause(s) { return new S.Chainable(throttledPause(s), this); }

    function defer() {
        var scheduled = false;

        return function (fn) {
            if (scheduled) return;

            scheduled = true;

            S.defer(function deferred() {
                scheduled = false;
                fn();
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
})(S);
