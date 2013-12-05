// HTML api for XO.js
(function (X) {

    X.html = {
        control: control,
        text   : text,
        event  : event,
        'with' : with_,
        each   : each
    };

    function control(el, x) {
        var tag = el.tagName + '#' + (el.attributes && el.attributes.type && el.attributes.type.value);

        var result =
            /^(input#text|textarea|select)/i.test(tag) ? control_value(el, x) :
            /^input#radio/i.test(tag)                  ? control_radio(el, x) :
            /^input#checkbox/i.test(tag)               ? control_checkbox(el, x) :
            null;

        if (!result) throw new Error("Element is not a recognized control");

        return result;
    }

    function control_value(el, x) {
        var from = X(function () { el.value = x(); }),
            to = function () { x(el.value); return true; };

        el.addEventListener('change', to, false);

        return function () {
            //from.detach();
            el.removeEventListener('change', to);
        };
    }

    function control_checkbox(el, x) {

        return function () {

        };
    }

    function control_radio(el, x) {

        return function () {

        };
    }

    function text(el, x) {

        return function () {

        };
    }

    function event(el, name, x) {
        var fn = null,
            cb = function (evt) { fn && fn(evt); }

        X(function () {
            fn = x();
            if (fn && typeof fn !== 'function') throw new Error("Value attached to event must be a function");
        });

        el.addEventListener(name, cb, false);

        return function() {
            el.removeEventListener(name, cb);
        }
    }

    function with_(el, x) {

        return function () {

        };
    }

    function each(el, x) {

        return function () {

        };
    }
})(X);