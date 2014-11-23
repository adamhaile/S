(function (K) {
    K.rproc = rproc;

    function rproc(fn) {
        var region;

        return K.proc(function () {
            var val;

            if (region) region.K.detach();

            region = K.region(function () {
                val = fn();
            });

            return val;
        });
    }
})(K);
