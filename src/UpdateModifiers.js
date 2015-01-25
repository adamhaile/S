define('modifiers', ['S'], function (S) {

    var _S_defer = S.defer;

    return {
        stop:      stop,
        defer:     defer,
        defer1:    defer1,
        delay:     delay,
        delay1:    delay1,
        throttle:  throttle,
        throttle1: throttle1,
        debounce1: debounce1,
        pause:     pause,
        pause1:    pause1,
        map:       map,
        filter:    filter,
        changes:   changes
    };

    function stop(update) {
        return function stopped(x) { }
    }

    function defer(fn) {
        if (fn !== undefined)
            return _S_defer(fn);

        return function (update) {
            return function deferred(x) {
                _S_defer(function deferred() {
                    update(x);
                });
            };
        };
    }

    function defer1(fn) {
        return function (update) {
            var scheduled = false,
                lastx = undefined;

            return function deferred(x) {
                lastx = x;

                if (scheduled) return;
                scheduled = true;

                _S_defer(function deferred() {
                    scheduled = false;
                    update(lastx);
                });
            }
        };
    }

    function delay(t) {
        return function (update) {
            return function delayed(x) { setTimeout(update, t, x); }
        }
    }

    function delay1(t) {
        return function (update) {
            var scheduled = false,
                x = undefined;

            return function delayed(_x) {
                x = _x;

                if (scheduled) return;
                scheduled = true;

                setTimeout(function delayed() {
                    scheduled = false;
                    update(x);
                }, t);
            };
        };
    }

    function throttle(t) {
        return function (update) {
            var last = 0;
            return function throttled(x) {
                var now = Date.now();
                last += t;
                if (last <= now) {
                    last = now;
                    update(x);
                } else {
                    setTimeout(update, last - now, x);
                }
            }
        }
    }

    function throttle1(t) {
        return function throttle(update) {
            var last = 0,
                lastx = undefined,
                scheduled = false;

            return function throttle(x) {
                lastx = x;

                if (scheduled) return;

                var now = Date.now();

                if ((now - last) > t) {
                    last = now;
                    update(x);
                } else {
                    scheduled = true;
                    setTimeout(function throttled() {
                        last = Date.now();
                        scheduled = false;
                        update(lastx);
                    }, t - (now - last));
                }
            };
        };
    }

    function debounce1(t) {
        return function (update) {
            var last = 0,
                lastx = undefined,
                tout = 0;

            return function (x) {
                lastx = x;

                var now = Date.now();

                if (now > last) {
                    last = now;
                    if (tout) clearTimeout(tout);

                    tout = setTimeout(function debounce() { update(lastx); }, t);
                }
            };
        };
    }

    function pause(signal) {
        var updates = [],
            paused;

        S.on(signal).S(function resume() {
            while (!(paused = signal()) && updates.length) {
                var update = updates.shift();
                update();
            }
        });

        return function (update) {
            return function pause(x) {
                if (paused) updates.push(function pause() { update(x); });
                else update(x);
            }
        }
    }

    function pause1(signal) {
        var updates = [],
            paused;

        S.on(signal).S(function resume() {
            while (!(paused = signal()) && updates.length) {
                var update = updates.shift();
                update();
            }
        });

        return function (update) {
            var scheduled = false,
                lastx = undefined;

            return function throttledPause(x) {
                if (paused) {
                    lastx = x;

                    if (scheduled) return;
                    scheduled = true;

                    updates.push(function paused() {
                        scheduled = false;
                        update(lastx);
                    });
                } else {
                    update(x);
                }
            }
        };
    }

    function map(fn) {
        return function (update) {
            return function map(x) {
                update(x === undefined ? fn() : fn(x));
            };
        };
    }

    function filter(pred) {
        return function (update) {
            return function filter(x) {
                if (x === undefined ? pred() : pred(x)) update(x);
            };
        };
    }

    function changes(eq) {
        eq = eq || function eq(c, n) { return c === n; };
        return function (update) {
            var last = undefined;
            return function changes(x) {
                var neq = !eq(x, last);
                last = x;
                if (neq) update(x);
            };
        };
    }
});
