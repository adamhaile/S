(function (S) {
    S.rproc = rproc;

    function rproc(fn) {
        var region;

        return S.proc(function () {
            var val;

            if (region) region.S.detach();

            region = S.region(function () {
                val = fn();
            });

            return val;
        });
    }
})(S);
