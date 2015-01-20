define('Environment', [], function () {

    function Environment() {
        this.count = 1;
        this.ctx = null;
        this.deferred = [];
    }

    Environment.prototype = {
        runInContext: function runInContext(fn, ctx) {
            if (ctx.updating) return;

            var oldCtx;

            oldCtx = this.ctx, this.ctx = ctx;

            ctx.beginUpdate();

            try {
                return fn();
            } finally {
                ctx.endUpdate();
                this.ctx = oldCtx;
            }
        },
        runWithoutListening: function runWithoutListening(fn) {
            var oldListening;

            if (this.ctx) oldListening = this.ctx.listening, this.ctx.listening = false;

            try {
                return fn();
            } finally {
                if (this.ctx) this.ctx.listening = oldListening;
            }
        },
        runDeferred: function runDeferred() {
            if (this.ctx) return;
            while (this.deferred.length !== 0) {
                this.deferred.shift()();
            }
        }
    };

    return Environment;
});
