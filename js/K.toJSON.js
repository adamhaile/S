(function (K) {
    K.toJSON = function toJSON(o) {
        return JSON.stringify(o, function (k, v) {
            return (typeof v === 'function' && v.K) ? v() : v;
        });
    };
})(K);
