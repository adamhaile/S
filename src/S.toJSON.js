define('S.toJSON', ['S'], function (S) {
    S.toJSON = function toJSON(o) {
        return JSON.stringify(o, function (k, v) {
            return (typeof v === 'function' && v.S) ? v() : v;
        });
    };
});
