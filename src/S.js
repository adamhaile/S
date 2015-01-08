define('S', [], function () {
    var ctxMgr = new ContextManager();

    // initializer
    S.lift     = lift;

    S.data    = data;
    S.formula = formula;
    S.peek    = peek;
    S.defer   = defer;
    S.cleanup = cleanup;
    S.finalize = finalize;

    S.data.S = DataCombinator;
    S.formula.S = FormulaCombinator;

    FormulaCombinator.prototype = new DataCombinator();

    function S(arg1, arg2) {
        return S.lift(arg1, arg2);
    }

    function lift(arg1, arg2) {
        return typeof arg1 === 'function' ? formula(arg1, arg2)
            : arg1 instanceof Array ? S.seq(arg1)
            : data(arg1);
    }

    function data(value) {
        if (value === undefined) throw new Error("S.data can't be initialized with undefined.  In S, undefined is reserved for namespace lookup failures.");

        var src = new Source(ctxMgr);

        data.S = new DataCombinator();
        data.toString = dataToString;

        return data;

        function data(newValue) {
            if (arguments.length > 0) {
                if (newValue === undefined) throw new Error("S.data can't be set to undefined.  In S, undefined is reserved for namespace lookup failures.");
                value = newValue;
                src.propagate();
                ctxMgr.runDeferred();
            } else {
                if (ctxMgr.ctx) ctxMgr.ctx.addSource(src);
            }
            return value;
        }
    }

    function formula(fn) {
        var src = new Source(ctxMgr),
            ctx = new Context(update, this || {}, ctxMgr),
            value;

        if (ctxMgr.ctx) ctxMgr.ctx.addChild(dispose);

        formula.S = new FormulaCombinator(dispose);
        formula.dispose = dispose;
        formula.toString = toString;

        update();

        ctxMgr.runDeferred();

        return formula;

        function formula() {
            if (ctxMgr.ctx) ctxMgr.ctx.addSource(src);
            return value;
        }

        function update() {
            ctxMgr.runInContext(_update, ctx);
        }

        function _update() {
            var newValue = fn();

            if (newValue !== undefined) {
                value = newValue;
                src.propagate();
            }
        }

        function dispose() {
            ctx.cleanup();
            ctx.dispose();
        }

        function toString() {
            return "[formula: " + fn + "]";
        }
    }

    function ContextManager() {
        this.count = 1;
        this.ctx = null;
        this.deferred = [];
    }

    ContextManager.prototype.runInContext = function runInContext(fn, ctx) {
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
    };
    ContextManager.prototype.runWithoutListening = function runWithoutListening(fn) {
        var oldListening;

        if (this.ctx) oldListening = this.ctx.listening, this.ctx.listening = false;

        try {
            return fn();
        } finally {
            if (this.ctx) this.ctx.listening = oldListening;
        }
    };
    ContextManager.prototype.runDeferred = function runDeferred() {
        if (this.ctx) return;
        while (this.deferred.length !== 0) {
            this.deferred.shift()();
        }
    };

    function Source(ctxMgr) {
        this.id = ctxMgr.count++;
        this.lineage = ctxMgr.ctx ? ctxMgr.ctx.lineage : [];

        this.updates = [];
    }

    Source.prototype.propagate = function propagate() {
        var i, u, us = this.updates;

        for (i = 0; i < us.length; i++) {
            u = us[i];
            if (u) u();
        }
    };

    function Context(update, options, ctxMgr) {
        var i, l;

        this.lineage = ctxMgr.ctx ? ctxMgr.ctx.lineage.slice(0) : [];
        this.lineage.push(this);
        this.mod = options.mod;
        this.updaters = [];

        for (i = this.lineage.length - 1; i >= 0; i--) {
            l = this.lineage[i];
            if (l.mod) update = l.mod(update);
            this.updaters[i] = update;
        }

        this.updating = false;
        this.gen = 1;
        this.registrations = [];
        this.registrationIndex = {};
        this.cleanups = [];
        this.finalizers = [];

        this.listening = !options.sources;

        if (options.sources) {
            for (var i = 0; i < options.sources.length; i++) {
                new Registration(this, options.sources[i]);
            }
        }
    }

    Context.prototype.beginUpdate = function beginUpdate() {
        this.cleanup();
        this.gen++;
        this.updating = true;
    };
    Context.prototype.endUpdate = function endUpdate() {
        this.updating = false;

        if (!this.listening) return;

        var i, reg;

        for (i = 0; i < this.registrations.length; i++) {
            reg = this.registrations[i];
            if (reg.active && reg.gen < this.gen) {
                reg.deactivate();
            }
        }
    };
    Context.prototype.addSource = function addSource(src) {
        if (!this.listening) return;

        var reg = this.registrationIndex[src.id];

        if (reg) {
            reg.activate(this.gen);
        } else {
            new Registration(this, src);
        }
    };
    Context.prototype.addChild = function addChild(fn) {
        this.cleanups.push(fn);
    };
    Context.prototype.cleanup = function cleanup() {
        for (var i = 0; i < this.cleanups.length; i++) {
            this.cleanups[i]();
        }
        this.cleanups = [];
    };
    Context.prototype.dispose = function dispose() {
        var i;

        for (i = 0; i < this.finalizers.length; i++) {
            this.finalizers[i]();
        }
        for (i = this.registrations.length - 1; i >= 0; i--) {
            this.registrations[i].deactivate();
        }
    };

    function Registration(ctx, src) {
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

        ctx.registrations.push(this);
        ctx.registrationIndex[src.id] = this;
    }

    Registration.prototype.activate = function active(gen) {
        if (!this.active) {
            this.active = true;
            this.updates[this.offset] = this.update;
        }
        this.gen = gen;
    };
    Registration.prototype.deactivate = function deactivate() {
        if (this.active) {
            this.updates[this.offset] = null;
        }
        this.active = false;
    };

    function DataCombinator() { }

    function FormulaCombinator(detach) {
        this.detach = detach;
    }

    function dataToString() {
        return "[data: " + S.peek(this) + "]";
    }

    function peek(fn) {
        return ctxMgr.runWithoutListening(fn);
    }

    function defer(fn) {
        if (ctxMgr.ctx) {
            ctxMgr.deferred.push(fn);
        } else {
            fn();
        }
    }

    function cleanup(fn) {
        if (ctxMgr.ctx) {
            ctxMgr.ctx.cleanups.push(fn);
        } else {
            throw new Error("S.cleanup() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    function finalize(fn) {
        if (ctxMgr.ctx) {
            ctxMgr.ctx.finalizers.push(fn);
        } else {
            throw new Error("S.finalize() must be called from within an S.formula.  Cannot call it at toplevel.");
        }
    }

    return S;
});
