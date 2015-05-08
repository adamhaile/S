define('schedulers', ['core'], function (core) {

    return {
        pause:    pause,
        throttle: throttle,
        debounce: debounce,
        when:     when
    };

    function pause(region) {
        return region;
    }

    function throttle(t) {
        var region = core.region(),
            last = 0,
            scheduled = false;

        return function throttle(emitter) {
            var now = Date.now();

            region(emitter);

            if ((now - last) > t) {
                last = now;
                region.go();
            } else {
                setTimeout(function throttled() {
                    last = Date.now();
                    region.go();
                }, t - (now - last));
            }
        };
    }

    function debounce(t) {
        var region = core.region(),
            last = 0,
            tout = 0;

        return function debounce(emitter) {
            var now = Date.now();

            region(emitter);

            if (now > last) {
                last = now;
                if (tout) clearTimeout(tout);

                tout = setTimeout(region.go, t);
            }
        };
    }

    function when(preds) {
        var len = preds.length;
        return function when() {
            var i = -1;
            while (++i < len) {
                if (preds[i]() === undefined) return false;
            }
            return true;
        }
    }
});
