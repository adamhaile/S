// HTML bindings for K.js
(function (K) {

    K.DOM = {
        control: control,
        text   : text,
        event  : event
    };

    return;

    function control(el, x) {
        var tag = el.tagName && el.tagName.toUpperCase(),
            type = el.attributes && el.attributes.type && el.attributes.type.value.toUpperCase();

        var result =
            tag === 'INPUT'         ? (
                type === 'TEXT'     ? controlValue(el, x) :
                type === 'RADIO'    ? controlRadio(el, x) :
                type === 'CHECKBOX' ? controlCheckbox(el, x) :
                null) :
            tag === 'TEXTAREA'      ? controlValue(el, x) :
            tag === 'SELECT'        ? controlValue(el, x) :
            null;

        if (!result) throw new Error("Element is not a recognized control");

        return result;
    }

    function controlValue(el, c) {
        var from = K(function () {
            el.value = c();
        });

        el.addEventListener('change', function () {
            c(el.value);
            return true;
        }, false);

        return from;
    }

    function controlCheckbox(el, c) {
        var from = K(function () {
            el.checked = !!c();
        });

        el.addEventListener('change', function () {
            c(el.checked);
            return true;
        }, false);

        return from;
    }

    function controlRadio(el, c) {
        var from = K(function () {
            var _x = c(),
                _t = typeof _c,
                _v = _t !== "string" && _t !== "undefined" && _c !== null && _c.toString ? _c.toString() : _c;

            el.checked = (_v === el.getAttribute('value'));
        });

        el.addEventListener('change', function () {
            if (el.checked) c(el.getAttribute('value'));
            return true;
        }, false);

        return from;
    }

    function text(el, c) {
        if (el.nodeType !== 3) throw new Error("Argument is not a text node");

        return K(function () { el.data = c(); });
    }

    function event(el, name, c) {
        el.addEventListener(name, function (evt) {
            var fn = c();
            fn && fn(evt);
        }, false);
    }
})(K);
