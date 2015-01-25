define('Environment', [], function () {

    function Environment() {
        this.count = 1;
        this.toplevel = true;
        this.ctx = null;
        this.deferred = [];
    }

    Environment.prototype = {
        runInContext: function runInContext(fn, x, ctx) {
            if (ctx.updating) return;

            var oldCtx, result, toplevel;

            oldCtx = this.ctx, this.ctx = ctx;
            toplevel = this.toplevel, this.toplevel = false;

            ctx.beginUpdate();

            try {
                result = x === undefined ? fn() : fn(x);
            } finally {
                this.ctx = oldCtx;
                this.toplevel = toplevel;
            }

            ctx.endUpdate();

            return result;
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
            if (this.toplevel) {
                while (this.deferred.length !== 0) {
                    this.deferred.shift()();
                }
            }
        }
    };

    return Environment;
});
