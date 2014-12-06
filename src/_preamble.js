(function () {
    // nano-implementation of require.js-like define(name, deps, impl) for internal use
    (function (package) {
        var definitions = {};

        package(function define(name, deps, fn) {
            if (definitions.hasOwnProperty(name)) throw new Error("define: cannot redefine module " + name);
            definitions[name] = fn.apply(null, deps.map(function (dep) {
                if (!definitions.hasOwnProperty(dep)) throw new Error("define: module " + dep + " required by " + name + " has not been defined.");
                return definitions[dep];
            }));
        });

        if (typeof module === 'object' && typeof module.exports === 'object') module.exports = definitions.S; // CommonJS
        else if (typeof define === 'function') define([], function () { return definitions.S; }); // AMD
        else this.S = definitions.S; // fallback to global object

    })(function (define) {
