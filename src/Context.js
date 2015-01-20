define('Context', ['Dependency'], function (Dependency) {

    function Context(update, options, env) {
        var i, l;

        this.lineage = env.ctx ? env.ctx.lineage.slice(0) : [];
        this.lineage.push(this);
        this.mod = options.update;
        this.updaters = [];

        for (i = this.lineage.length - 1; i >= 0; i--) {
            l = this.lineage[i];
            if (l.mod) update = l.mod(update);
            this.updaters[i] = update;
        }

        this.updating = false;
        this.listening = true;
        this.gen = 1;
        this.dependencies = [];
        this.dependenciesIndex = {};
        this.cleanups = [];
        this.finalizers = [];

        if (options.sources) {
            env.runInContext(function () {
                for (var i = 0; i < options.sources.length; i++)
                    options.sources[i]();
            }, this);

            this.listening = false;
        }
    }

    Context.prototype = {
        beginUpdate: function beginUpdate() {
            this.cleanup();
            this.gen++;
            this.updating = true;
        },
        endUpdate: function endUpdate() {
            this.updating = false;

            if (!this.listening) return;

            var i, dep;

            for (i = 0; i < this.dependencies.length; i++) {
                dep = this.dependencies[i];
                if (dep.active && dep.gen < this.gen) {
                    dep.deactivate();
                }
            }
        },
        addSource: function addSource(src) {
            if (!this.listening) return;

            var dep = this.dependenciesIndex[src.id];

            if (dep) {
                dep.activate(this.gen);
            } else {
                new Dependency(this, src);
            }
        },
        addChild: function addChild(fn) {
            this.cleanups.push(fn);
        },
        cleanup: function cleanup() {
            for (var i = 0; i < this.cleanups.length; i++) {
                this.cleanups[i]();
            }
            this.cleanups = [];
        },
        dispose: function dispose() {
            var i;

            for (i = 0; i < this.finalizers.length; i++) {
                this.finalizers[i]();
            }
            for (i = this.dependencies.length - 1; i >= 0; i--) {
                this.dependencies[i].deactivate();
            }
        }
    };

    return Context;
});
