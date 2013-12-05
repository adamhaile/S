/*

var p = ny.l();

 */

var ny = new NewYork();

function NewYork() {
    "use strict";

    var id_counter = 0,
        consumer = undefined;

    return {
        l: leaf,
        n: node
    };

    function leaf(value) {
        var id = id_counter++,
            consumers = {},
            i;

        leaf.id = id;
        leaf.consumers = consumers;

        return leaf;

        function leaf(set_value) {
            if (arguments.length > 0) {
                if (value !== set_value) {
                    value = set_value;
                    for (i in consumers) {
                        consumers[i].update();
                    }
                }
            } else {
                if (consumer) {
                    consumers[consumer.id] = consumer;
                    consumer.sources[id] = leaf;
                }
            }
            return value;
        };
    }

    function node(get, set) {
        var id = id_counter++,
            consumers = {},
            sources = {},
            value,
            updating = false,
            i;

        node.id = id;
        node.consumers = consumers;
        node.sources = sources;
        node.update = update;

        update();

        return node;

        function node(set_value) {
            var _consumer;
            if (arguments.length > 0) {
                if (set) {
                    try {
                        _consumer = consumer;
                        consumer = undefined;

                        set(set_value);

                    } finally {
                        consumer = _consumer;
                    }
                }
            } else {
                if (consumer) {
                    consumers[consumer.id] = consumer;
                    consumer.sources[id] = node;
                }
            }
            return value;
        };

        function update() {
            var new_value,
                _consumer;

            if (!updating) {
                try {
                    _consumer = consumer;
                    consumer = node;
                    node.sources = {};
                    updating = true;

                    new_value = get();
                } finally {
                    updating = false;

                    for (i in sources) {
                        if (!node.sources[i]) {
                            delete sources[i].consumers[id];
                        }
                    }

                    sources = node.sources;

                    consumer = _consumer;
                }

                if (value !== new_value) {
                    value = new_value;
                    for (i in consumers) {
                        consumers[i].update();
                    }
                }
            }
        }
    };
}