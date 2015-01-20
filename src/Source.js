define('Source', [], function () {
    function Source(env) {
        this.id = env.count++;
        this.lineage = env.ctx ? env.ctx.lineage : [];

        this.updates = [];
    }

    Source.prototype = {
        propagate: function propagate() {
            var i, u, us = this.updates;

            for (i = 0; i < us.length; i++) {
                u = us[i];
                if (u) u();
            }
        }
    };

    return Source;
});
