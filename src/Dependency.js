define('Dependency', [], function () {

    function Dependency(ctx, src) {
        this.active = true;
        this.gen = ctx.gen;
        this.updates = src.updates;
        this.offset = src.updates.length;

        // set i to the point where the lineages diverge
        for (var i = 0, len = Math.min(ctx.lineage.length, src.lineage.length);
            i < len && ctx.lineage[i] === src.lineage[i];
            i++);

        this.update = ctx.updaters[i];
        this.updates.push(this.update);

        ctx.dependencies.push(this);
        ctx.dependenciesIndex[src.id] = this;
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

    return Dependency;
});
