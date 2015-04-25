define('graph', [], function () {
    function Graph() {
        this.nodeCount = 0;
        this.updatingNode = null;
        this.deferredEmitters = null;
    }

    Graph.prototype = {
        reportChange: function reportChange(emitter) {
            if (this.deferredEmitters) {
                this.deferredEmitters.push(emitter);
                return;
            }

            emitter.emitDirty();
            var oldNode = this.updatingNode;
            this.updatingNode = null;
            try {
                emitter.emitUpdate();
            } finally {
                this.updatingNode = oldNode;
            }
        },

        freeze: function freeze(fn) {
            var emitters, oldNode, i, len;

            if (this.deferredEmitters) {
                fn();
                return;
            }

            this.deferredEmitters = emitters = [];

            try {
                fn();
            } finally {
                this.deferredEmitters = null;
            }

            i = -1, len = emitters.length;
            while (++i < len) emitters[i].emitDirty();

            oldNode = this.updatingNode, this.updatingNode = null;

            i = -1;
            try {
                while (++i < len) emitters[i].emitUpdate();
            } finally {
                this.updatingNode = oldNode;
            }
        },

        addEdge: function addEdge(from) {
            var to = this.updatingNode,
                edge = null;

            if (to && to.listening) {
                edge = to.inboundIndex[from.id];
                if (!edge) edge = new Edge(from, to);
                else edge.activate(from);
            }
        },

        addEntryPoint: function addEntryPoint() {
            return new Emitter(this, null);
        },

        addNode: function addNode(payload, options, dispose) {
            var node = new Node(this, payload, options),
                i, len, oldNode;

            oldNode = this.updatingNode, this.updatingNode = node;

            if (options.sources) {
                i = -1, len = options.sources.length;
                while (++i < len) options.sources[i]();
                this.listening = false;
            }

            if (oldNode) {
                if (oldNode.pinning || options.pin) oldNode.finalizers.push(dispose);
                else oldNode.cleanups.push(dispose);
            }

            node.updating = true;
            try {
                node.value = payload();
            } finally {
                node.updating = false;
                this.updatingNode = oldNode;
            }

            return node;
        }
    };

    function Emitter(graph, node) {
        this.id = ++graph.nodeCount;
        this.node = node;
        this.outbound = [];
    }

    Emitter.prototype = {
        emitDirty: function emitDirty() {
            var i = -1, len = this.outbound.length, outbound;
            while (++i < len) {
                outbound = this.outbound[i];
                if (outbound) {
                    outbound.to.markDirty(outbound);
                }
            }
        },

        emitUpdate: function emitupdate() {
            var i = -1, len = this.outbound.length, outbound;
            while (++i < len) {
                outbound = this.outbound[i];
                if (outbound) {
                    outbound.to.update();
                }
            }
        },

        dispose: function () {
            this.node = null;
            this.outbound = null;
        }
    };

    function Node(graph, payload, options) {
        this.graph = graph;
        this.payload = payload;
        this.emitter = new Emitter(graph, this);

        this.value = undefined;
        this.gen = 1;
        this.dirty = 0;

        this.dirtying = false;
        this.updating = false;
        this.listening = true;
        this.pinning = false;

        this.inbound = [];
        this.inboundIndex = [];

        this.cleanups = [];
        this.finalizers = [];
    }

    Node.prototype = {
        markDirty: function markDirty(inbound) {
            // deactivate circular edges
            if (this.dirtying) {
                inbound.deactivate();
            } else if (++this.dirty === 1) {
                this.dirtying = true;
                this.emitter.emitDirty();
                this.dirtying = false;
            }
        },

        update: function update() {
            var i, len, outbound, edge;
            this.dirty--;
            if (this.dirty === 0 && !this.updating) {
                this.graph.updatingNode = this;

                this.cleanup();

                this.gen++;
                this.updating = true;
                this.value = this.payload();
                this.updating = false;

                if (this.listening) {
                    i = -1, len = this.inbound.length;
                    while (++i < len) {
                        edge = this.inbound[i];
                        if (edge.active && edge.gen < this.gen) {
                            edge.deactivate();
                        }
                    }
                }

                this.emitter.emitUpdate();
            }
        },

        cleanup: function cleanup() {
            var i = -1, len = this.cleanups.length;
            while (++i < len) {
                this.cleanups[i]();
            }
            this.cleanups = [];
        },

        dispose: function dispose() {
            var i, len;

            this.cleanup();

            i = -1, len = this.finalizers.length;
            while (++i < len) {
                this.finalizers[i]();
            }

            i = -1, len = this.inbound.length;
            while (++i < len) {
                this.inbound[i].deactivate();
            }

            this.graph = null;
            this.payload = null;
            this.inbound = null;
            this.inboundIndex = null;
            this.cleanups = null;
            this.finalizers = null;

            this.emitter.dispose();
        }
    };

    function Edge(from, to) {
        this.from = from;
        this.to = to;
        this.active = true;
        this.gen = to.gen;

        this.outboundOffset = from.outbound.length;

        from.outbound.push(this);
        to.inbound.push(this);
        to.inboundIndex[from.id] = this;
    }

    Edge.prototype = {
        activate: function activateEdge(from) {
            if (!this.active) {
                this.active = true;
                from.outbound[this.outboundOffset] = this;
                this.from = from;
            }
            this.gen = this.to.gen;
        },

        deactivate: function deactivateEdge() {
            if (this.active) {
                this.active = false;
                this.from.outbound[this.outboundOffset] = null;
                this.from = null;
            }
        }
    };

    function Source(os) {
        this.id = os.count++;
        this.lineage = os.target ? os.target.lineage : [];

        this.updates = [];
    }

    Source.prototype = {
        propagate: function propagate() {
            var i,
                update,
                updates = this.updates,
                len = updates.length;

            for (i = 0; i < len; i++) {
                update = updates[i];
                if (update) update();
            }
        },
        dispose: function () {
            this.lineage = null;
            this.updates.length = 0;
        }
    };

    function Target(update, options, os) {
        var i, ancestor, oldTarget;

        this.lineage = os.target ? os.target.lineage.slice(0) : [];
        this.lineage.push(this);
        this.scheduler = options.update;

        this.listening = true;
        this.pinning = options.pinning || false;
        this.locked = true;

        this.gen = 1;
        this.dependencies = [];
        this.dependenciesIndex = {};

        this.cleanups = [];
        this.finalizers = [];

        this.updaters = new Array(this.lineage.length + 1);
        this.updaters[this.lineage.length] = update;

        for (i = this.lineage.length - 1; i >= 0; i--) {
            ancestor = this.lineage[i];
            if (ancestor.scheduler) update = ancestor.scheduler(update);
            this.updaters[i] = update;
        }

        if (options.sources) {
            oldTarget = os.target, os.target = this;
            this.locked = false;
            try {
                for (i = 0; i < options.sources.length; i++)
                    options.sources[i]();
            } finally {
                this.locked = true;
                os.target = oldTarget;
            }

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
        addSubformula: function addSubformula(dispose, pin) {
            if (this.locked)
                throw new Error("Cannot create a new subformula except while updating the parent");
            ((pin || this.pinning) ? this.finalizers : this.cleanups).push(dispose);
        },
        addSource: function addSource(src) {
            if (!this.listening || this.locked) return;

            var dep = this.dependenciesIndex[src.id];

            if (dep) {
                dep.activate(this.gen, src);
            } else {
                new Dependency(this, src);
            }
        },
        cleanup: function cleanup() {
            for (var i = 0; i < this.cleanups.length; i++) {
                this.cleanups[i]();
            }
            this.cleanups = [];
        },
        dispose: function dispose() {
            var i;

            this.cleanup();

            for (i = 0; i < this.finalizers.length; i++) {
                this.finalizers[i]();
            }

            for (i = this.dependencies.length - 1; i >= 0; i--) {
                this.dependencies[i].deactivate();
            }

            this.lineage = null;
            this.scheduler = null;
            this.updaters = null;
            this.cleanups = null;
            this.finalizers = null;
            this.dependencies = null;
            this.dependenciesIndex = null;
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

        //for (var i = 0; i < target.lineage.length && i < src.lineage.length && target.lineage[i] === src.lineage[i]; i++);

        this.update = target.updaters[i];
        this.updates.push(this.update);

        target.dependencies.push(this);
        target.dependenciesIndex[src.id] = this;
    }

    Dependency.prototype = {
        activate: function activate(gen, src) {
            if (!this.active) {
                this.active = true;
                this.updates = src.updates;
                this.updates[this.offset] = this.update;
            }
            this.gen = gen;
        },
        deactivate: function deactivate() {
            if (this.active) {
                this.updates[this.offset] = null;
                this.updates = null;
            }
            this.active = false;
        }
    };

    return {
        Graph: Graph,
        Node: Node,
        Edge: Edge
    };
});
