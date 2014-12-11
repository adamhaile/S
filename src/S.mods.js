define('S.mods', ['S', 'Chainable'], function (S, Chainable) {

    var _S_defer = S.defer;

    ChainableMod.prototype = new Chainable();
    ChainableMod.prototype.S = S.formula;

    S.defer          = ChainableMod.prototype.defer          = chainableDefer;
    S.delay          = ChainableMod.prototype.delay          = chainableDelay;
    S.debounce       = ChainableMod.prototype.debounce       = chainableDebounce;
    S.throttle       = ChainableMod.prototype.throttle       = chainableThrottle;
    S.pause          = ChainableMod.prototype.pause          = chainablePause;
    S.throttledPause = ChainableMod.prototype.throttledPause = chainableThrottledPause;

    return;

    function ChainableMod(fn, prev) {
        Chainable.call(this, fn, prev);
    }

    function chainableDefer()     { return new ChainableMod(defer(),     this); }
    function chainableDelay(t)    { return new ChainableMod(delay(t),    this); }
    function chainableDebounce(t) { return new ChainableMod(debounce(t), this); }
    function chainableThrottle(t) { return new ChainableMod(throttle(t), this); }
    function chainablePause(s)    { return new ChainableMod(pause(s),    this); }
    function chainableThrottledPause(s) { return new ChainableMod(throttledPause(s), this); }

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
