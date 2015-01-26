define('graph', [], function () {

    function Recorder() {
        this.count = 1;
        this.target = null;
        this.deferred = [];
    }

    Recorder.prototype = {
        addSource: function addSource(src) {
            if (this.target) this.target.addSource(src);
        },
        addChild: function addChild(dispose) {
            if (this.target) this.target.addChild(dispose);
        },
        runWithTarget: function runWithTarget(fn, target) {
            if (target.updating) return;

            var oldTarget, result;

            oldTarget = this.target, this.target = target;

            target.beginUpdate();
            target.updating = true;

            result = this.runWithTargetInner(fn, oldTarget);

            target.endUpdate();

            return result;
        },
        // Chrome can't optimize a function with a try { } statement, so we move
        // the minimal set of needed ops into a separate function.
        runWithTargetInner: function runWithTargetInner(fn, oldTarget) {
            try {
                return fn();
            } finally {
                this.target.updating = false;
                this.target = oldTarget;
            }
        },
        peek: function runWithoutListening(fn) {
            var oldListening;

            if (this.target) {
                oldListening = this.target.listening, this.target.listening = false;

                try {
                    return fn();
                } finally {
                    this.target.listening = oldListening;
                }
            } else {
                return fn();
            }
        },
        runDeferred: function runDeferred() {
            if (!this.target) {
                while (this.deferred.length !== 0) {
                    this.deferred.shift()();
                }
            }
        }
    };

    function Source(recorder) {
        this.id = recorder.count++;
        this.lineage = recorder.target ? recorder.target.lineage : [];

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

    function Target(update, options, recorder) {
        var i, l;

        this.lineage = recorder.target ? recorder.target.lineage.slice(0) : [];
        this.lineage.push(this);
        this.mod = options.update;
        this.updaters = [];

        this.updating = false;
        this.listening = true;
        this.gen = 1;
        this.dependencies = [];
        this.dependenciesIndex = {};
        this.cleanups = [];
        this.finalizers = [];

        for (i = this.lineage.length - 1; i >= 0; i--) {
            l = this.lineage[i];
            if (l.mod) update = l.mod(update, this);
            this.updaters[i] = update;
        }

        if (options.sources) {
            recorder.runWithTarget(function () {
                for (var i = 0; i < options.sources.length; i++)
                    options.sources[i]();
            }, this);

            this.listening = false;
        }
    }

    Target.prototype = {
        beginUpdate: function beginUpdate() {
            this.cleanup();
            this.gen++;
        },
        endUpdate: function endUpdate() {
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
        addChild: function addChild(dispose) {
            this.cleanups.push(dispose);
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

    function Dependency(target, src) {
        this.active = true;
        this.gen = target.gen;
        this.updates = src.updates;
        this.offset = src.updates.length;

        // set i to the point where the lineages diverge
        for (var i = 0, len = Math.min(target.lineage.length, src.lineage.length);
            i < len && target.lineage[i] === src.lineage[i];
            i++);

        this.update = target.updaters[i];
        this.updates.push(this.update);

        target.dependencies.push(this);
        target.dependenciesIndex[src.id] = this;
    }

    Dependency.prototype = {
        activate: function activate(gen) {
            if (!this.active) {
                this.active = true;
                this.updates[this.offset] = this.update;
            }
            this.gen = gen;
        },
        deactivate: function deactivate() {
            if (this.active) {
                this.updates[this.offset] = null;
            }
            this.active = false;
        }
    };

    return {
        Recorder: Recorder,
        Source: Source,
        Target: Target,
        Dependency: Dependency
    };
});
