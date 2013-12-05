var X = (function () {
    "use strict";

    function domain() {

        var id_counter = 1,
            consumers = {},
            sources = {},
            updaters = {},
            consumer = undefined;

        X.domain = domain;
        X.lift = lift;
        X.value = value;
        X.property = property;

        return X;

        function X() {
            return X.lift.apply(null, arguments);
        }

        function lift(arg1, arg2) {
            return typeof arg1 === 'function' ? property(arg1, arg2) : value(arg1);
        }

        function value(v) {
            var id = id_counter++;

            consumers[id] = {};

            value.id = id;

            return value;

            function value(set_v) {
                var i;

                if (arguments.length > 0) {
                    if (v !== set_v) {
                        v = set_v;
                        for (i in consumers[id]) {
                            updaters[i]();
                        }
                    }
                } else {
                    if (consumer) {
                        consumers[id][consumer] = sources[consumer][id] = true;
                    }
                }
                return v;
            };
        }

        function property(get, set) {
            var id = id_counter++,
                value,
                updating = false;

            property.id = id;

            consumers[id] = {};
            sources[id] = {};
            updaters[id] = update;

            update();

            return property;

            function property(set_value) {
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
                        consumers[id][consumer] = sources[consumer][id] = true;
                    }
                }

                return value;
            };

            function update() {
                var new_value,
                    _consumer,
                    i;

                if (!updating) {
                    try {
                        _consumer = consumer;
                        consumer = id;
                        for (i in sources[id]) {
                            consumers[i][id] = false;
                        }
                        sources[id] = {};
                        updating = true;

                        new_value = get();
                    } finally {
                        updating = false;

                        consumer = _consumer;
                    }

                    if (value !== new_value) {
                        value = new_value;
                        for (i in consumers[id]) {
                            if (consumers[id][i]) {
                                updaters[i]();
                            }
                        }
                    }
                }
            }
        };
    }

    return domain();
}());