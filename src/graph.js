define('graph', [], function () {
    function Graph() {
        this.nodeCount = 0;
        this.updatingNode = null;
        this.freezeChangeset = null;
    }

    Graph.prototype = {
        reportChange: function reportChange(emitter) {
            if (this.freezeChangeset) {
                this.freezeChangeset.add(emitter);
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

        backtrack: function backtrack(node) {
            var oldNode = this.updatingNode;

            var i = -1, len = node.inbound.length, edge;
            while (++i < len) {
                edge = node.inbound[i];
                if (edge && edge.damaged) {
                    if (edge.from.node && edge.from.node.damage) {
                        // keep working backwards through the damage ...
                        backtrack(edge.from.node);
                    } else {
                        // ... until we find clean state, from which to send repair
                        edge.from.repair();
                    }
                }
            }

            this.currentNode = oldNode;
        },

        freeze: function freeze(fn) {
            if (this.freezeChangeset) {
                fn();
                return;
            }

            var collector = this.freezeChangeset = new Changeset();

            try {
                fn();
            } finally {
                this.freezeChangeset = null;
            }

            this.flushChangeset(collector);
        },

        addEdge: function addEdge(from) {
            var to = this.updatingNode,
                edge = null;

            if (to && to.listening) {
                edge = to.inboundIndex[from.id];
                if (!edge) edge = new Edge(from, to, to.emitter.region && from.region !== to.emitter.region);
                else edge.activate(from);
            }
        },

        addEntryPoint: function addEntryPoint() {
            return new Emitter(this, null, this.updatingNode ? this.updatingNode.emitter.region : null);
        },

        addNode: function addNode(payload, options, dispose) {
            var oldNode = this.updatingNode,
                region = options.region || (oldNode && oldNode.emitter.region) || null,
                node = new Node(this, payload, region),
                i, len;

            this.updatingNode = node;

            if (options.sources) {
                i = -1, len = options.sources.length;
                while (++i < len) options.sources[i]();
                node.listening = false;
            }

            if (oldNode) {
                if (oldNode.pinning || options.pin) oldNode.finalizers.push(dispose);
                else oldNode.cleanups.push(dispose);
            }

            if (!options.init || options.init(node.emitter)) {
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
            } else {
                this.updatingNode = oldNode;
            }

            return node;
        },

        addChangeset: function addChangeset() {
            return new Changeset();
        },

        flushChangeset: function flushChangeset(cs) {
            var i, emitter, oldNode;

            i = -1;
            while (++i < cs.emitters.length) {
                cs.emitters[i].damage();
            }

            oldNode = this.updatingNode, this.updatingNode = null;

            i = -1;
            try {
                while (++i < cs.emitters.length) {
                    emitter = cs.emitters[i];
                    if (emitter.node) emitter.node.update();
                    emitter.repair();
                }
            } catch (ex) {
                i--;
                while (++i < cs.emitters.length) {
                    cs.emitters[i].reset();
                }
                throw ex;
            } finally {
                this.updatingNode = oldNode;
            }

            cs.emitters = [];
            cs.emitterIndex = {};
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
            if (!this.outbound) return;
            
            this.active = true;

            var i = -1, len = this.outbound.length, edge, to;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && !edge.damaged && (!edge.boundary || edge.to.emitter.region(edge.to.emitter))) {
                    to = edge.to;

                    if (to.emitter.active)
                        throw new Error("circular dependency"); // TODO: more helpful reporting

                    edge.damaged = true;
                    to.damage++;

                    // if this is the first time node's been dirtied, then propagate
                    if (to.damage === 1) {
                        to.emitter.damage();
                    }
                }
            }

            this.active = false;
        },

        repair: function repair() {
            if (!this.outbound) return;
            
            this.active = true;

            var i = -1, len = this.outbound.length, edge, to;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.damaged) {
                    to = edge.to;

                    edge.damaged = false;
                    to.damage--;

                    // if node's inbound edges are now clean, update and propagate
                    if (to.damage === 0) {
                        to.update();
                        if (to.emitter) to.emitter.repair();
                    }
                }
            }

            this.active = false;
        },

        reset: function reset() {
            this.active = false;

            var i = -1, len = this.outbound.length, edge, to;
            while (++i < len) {
                edge = this.outbound[i];
                if (edge && edge.damaged) {
                    to = edge.to;
                    edge.damaged = false;
                    to.damage = 0;

                    to.emitter.reset();
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

            if (this.listening && this.inbound) {
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
            this.emitter = null;
        }
    };

    function Edge(from, to, boundary) {
        this.from = from;
        this.to = to;
        this.boundary = boundary;

        this.active = true;
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

    function Changeset() {
        this.emitters = [],
        this.emitterIndex = {};
    }

    Changeset.prototype = {
        add: function add(emitter) {
            if (!this.emitterIndex[emitter.id]) {
                this.emitters.push(emitter);
                this.emitterIndex[emitter.id] = emitter;
            }
        }
    };

    return Graph;
});
