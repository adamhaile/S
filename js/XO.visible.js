// A variant of XO.js, but with visible properties for consumers, sources and updaters.
var X = (function () {
    "use strict";

    function domain() {

        X.count = 0;
        X.consumer = null;

        X.lift = lift;
        X.value = value;
        X.property = property;
        X.peek = peek;

        return X;

        function X() {
            return X.lift.apply(null, arguments);
        }

        function lift(arg1, arg2) {
            return typeof arg1 === 'function' ? property(arg1, arg2) : value(arg1);
        }

        function value(v) {
            value.id = ++X.count;
            value.consumers = {};

            return value;

            function value(set_v) {
                if (arguments.length > 0) {
                    if (v !== set_v) {
                        v = set_v;
                        propagate(value);
                    }
                } else {
                    attach(X.consumer, value);
                }

                return v;
            };
        }

        function property(get, set) {
            var updating = false,
                value;

            property.id = ++X.count;
            property.consumers = {};
            property.sources = {};
            property.update = update;

            update();

            return property;

            function property(set_value) {
                var consumer = X.consumer;

                if (arguments.length > 0) {
                    if (set) {
                        try {
                            X.consumer = null;

                            set(set_value);

                        } finally {
                            X.consumer = consumer;
                        }
                    }
                } else {
                    attach(consumer, property);
                }

                return value;
            };

            function update() {
                var consumer = X.consumer,
                    new_value;

                if (!updating) {
                    try {
                        detach(property);

                        updating = true;
                        X.consumer = property;

                        new_value = get();
                    } finally {
                        updating = false;

                        X.consumer = consumer;
                    }

                    if (value !== new_value) {
                        value = new_value;
                        propagate(property);
                    }
                }
            }
        }

        function peek(fn) {
            var consumer = X.consumer,
                result;

            try {
                X.consumer = null;
                result = fn();
            } finally {
                X.consumer = consumer;
            }

            return result;
        }

        function attach(consumer, source) {
            if (consumer) {
                consumer.sources[source.id] = source;
                source.consumers[consumer.id] = consumer;
            }
        }

        function detach(consumer) {
            var sources = consumer.sources,
                source,
                id;

            for (id in sources) {
                source = sources[id];

                if (source) {
                    source.consumers[consumer.id] = false;
                    sources[id] = false;
                }
            }

        }

        function propagate(source) {
            var consumers = source.consumers,
                consumer,
                id;

            for (id in consumers) {
                consumer = consumers[id];
                if (consumer) {
                    consumer.update();
                }
            }
        }
    }

    return domain();
}());