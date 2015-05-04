define('schedulers', ['core'], function (core) {

    return {
        stop:     stop,
        pause:    pause,
        defer:    defer,
        throttle: throttle,
        debounce: debounce,
        stopsign: stopsign,
        when:     when
    };

    function stop(update) {
        return function stopped() { }
    }

    function pause(collector) {
        return function (update) {
            var scheduled = false;

            return function paused() {
                if (scheduled) return;
                scheduled = true;

                collector(function resume() {
                    scheduled = false;
                    update();
                });
            }
        };
    }

    function defer(fn) {
        return pause(core.defer);
    }

    function throttle(t) {
        return function throttle(update) {
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
        return function (update) {
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

    function stopsign() {
        var updates = [];

        collector.go = go;

        return collector;

        function collector(update) {
            updates.push(update);
        }

        function go() {
            for (var i = 0; i < updates.length; i++) {
                updates[i]();
            }
            updates = [];
        }
    }

    function when(preds) {
        var len = preds.length;
        return function boundary() {
            var i = -1;
            while (++i < len) {
                if (preds[i]() === undefined) return true;
            }
            return false;
        }
    }
});
