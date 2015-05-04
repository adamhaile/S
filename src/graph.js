define('graph', [], function () {
    function Graph() {
        this.nodeCount = 0;
        this.updatingNode = null;
        this.deferredEmitters = null;
        this.deferredEmittersIndex = null;
    }

    Graph.prototype = {
        reportChange: function reportChange(emitter) {
            if (this.deferredEmitters) {
                if (!this.deferredEmittersIndex[emitter.id]) {
                    this.deferredEmitters.push(emitter);
                    this.deferredEmittersIndex[emitter.id] = emitter;
                }

                return;
            }

            emitter.damage();
            var oldNode = this.updatingNode;
            this.updatingNode = null;
            try {
                emitter.repair();
            } catch (ex) {
                emitter.reset();
                throw ex;
            } finally {
                this.updatingNode = oldNode;
            }
        },

        repair: function repair(node) {
            var oldNode = this.updatingNode;

            var i = -1, len = node.inbound.length, edge;
            while (++i < len) {
                edge = node.inbound[i];
                if (edge && edge.damaged) {
                    if (edge.from.node && edge.from.node.damage) {
                        // keep working backwards through the damage ...
                        repair(edge.from.node);
                    } else {
                        // ... until we find clean state, from which to send repair
                        edge.from.repair();
                    }
                }
            }

            this.currentNode = oldNode;
        },

        freeze: function freeze(fn) {
            var emitters, oldNode, i, len;

            if (this.deferredEmitters) {
                fn();
                return;
            }

            this.deferredEmitters = emitters = [];
            this.deferredEmittersIndex = {};

            try {
                fn();
            } finally {
                this.deferredEmitters = null;
                this.deferredEmittersIndex = null;
            }

            i = -1, len = emitters.length;
            while (++i < len) emitters[i].damage();

            oldNode = this.updatingNode, this.updatingNode = null;

            i = -1;
            try {
                while (++i < len) emitters[i].repair();
            } catch (ex) {
                i--;
                while (++i < len) emitters[i].reset();
                throw ex;
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
                node.listening = false;
            }

            if (oldNode) {
                if (oldNode.pinning || options.pin) oldNode.finalizers.push(dispose);
                else oldNode.cleanups.push(dispose);
            }

            node.emitter.active = true;
            try {
                node.value = payload();
            } catch (ex) {
                node.emitter.reset();
                throw ex;
            } finally {
                node.emitter.active = false;
                this.updatingNode = oldNode;
            }

            return node;
        }
    };

    function Emitter(graph, node, region) {
        this.id = ++graph.nodeCount;
        this.node = node;
        this.region = region;
        this.active = false;
        this.outbound = [];
    }

    Emitter.prototype = {
        damage: function damage() {
            this.active = true;

            var i = -1, len = this.outbound.length, edge;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && !edge.damaged && !(edge.boundary && edge.boundary())) {
                    if (edge.to.emitter.active)
                        throw new Error("circular dependency");

                    edge.damaged = true;
                    edge.to.damage++;

                    // if this is the first time node's been dirtied, then propagate
                    if (edge.to.damage === 1) {
                        edge.to.emitter.damage();
                    }
                }
            }

            this.active = false;
        },

        repair: function repair() {
            this.active = true;

            var i = -1, len = this.outbound.length, edge;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.damaged) {
                    edge.damaged = false;
                    edge.to.damage--;

                    // if node's inbound edges are now clean, update and propagate
                    if (edge.to.damage === 0) {
                        edge.to.update();
                        edge.to.emitter.repair();
                    }
                }
            }

            this.active = false;
        },

        reset: function reset() {
            this.active = false;

            var i = -1, len = this.outbound.length, edge;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.damaged) {
                    edge.damaged = false;
                    edge.to.damage = 0;

                    edge.to.emitter.reset();
                }
            }
        },

        dispose: function () {
            this.node = null;
            this.outbound = null;
        }
    };

    function Node(graph, payload, region) {
        this.graph = graph;
        this.payload = payload;

        this.emitter = new Emitter(graph, this, region);

        this.value = undefined;
        this.gen = 1;
        this.damage = 0;

        this.listening = true;
        this.pinning = false;

        this.inbound = [];
        this.inboundIndex = [];

        this.cleanups = [];
        this.finalizers = [];
    }

    Node.prototype = {
        update: function update() {
            var i, len, edge;

            this.graph.updatingNode = this;

            this.cleanup();

            this.gen++;

            this.value = this.payload();

            if (this.listening) {
                // deactivate any edges that weren't refreshed
                i = -1, len = this.inbound.length;
                while (++i < len) {
                    edge = this.inbound[i];
                    if (edge.active && edge.gen < this.gen) {
                        edge.deactivate();
                    }
                }
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
        this.boundary = null;
        this.damaged = false;
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
                if (this.from.outbound) this.from.outbound[this.outboundOffset] = null;
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
