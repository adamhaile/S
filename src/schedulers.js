define('schedulers', ['S'], function (S) {

    var _S_defer = S.defer;

    return {
        stop:     stop,
        defer:    defer,
        throttle: throttle,
        debounce: debounce,
        pause:    pause
    };

    function stop(update) {
        return function stopped() { }
    }

    function defer(fn) {
        if (fn !== undefined)
            return _S_defer(fn);

        return function (update, ctx) {
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

    function throttle(t) {
        return function throttle(update, ctx) {
            var last = 0,
                scheduled = false;

            return function throttle() {
                if (scheduled) return;

                var now = Date.now();

                if ((now - last) > t) {
                    last = now;
                    update();
                } else {
                    scheduled = true;
                    setTimeout(function throttled() {
                        last = Date.now();
                        scheduled = false;
                        update();
                    }, t - (now - last));
                }
            };
        };
    }

    function debounce(t) {
        return function (update, ctx) {
            var last = 0,
                tout = 0;

            return function () {
                var now = Date.now();

                if (now > last) {
                    last = now;
                    if (tout) clearTimeout(tout);

                    tout = setTimeout(function debounce() { update(); }, t);
                }
            };
        };
    }

    function pause(signal) {
        return function (update, ctx) {
            var updates = [],
                paused,
                scheduled = false,
                watcher = S.on(signal).S(function resume() {
                    while (!(paused = signal()) && updates.length) {
                        var update = updates.shift();
                        update();
                    }
                });

            ctx.finalizers.push(watcher.dispose);

            return function pause() {
                if (paused) {
                    if (scheduled) return;
                    scheduled = true;

                    updates.push(function paused() {
                        scheduled = false;
                        update();
                    });
                } else {
                    update();
                }
            }
        };
    }
});
