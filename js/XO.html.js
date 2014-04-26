// HTML bindings for XO.js
(function (X) {

    X.html = {
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
                type === 'TEXT'     ? control_value(el, x) :
                type === 'RADIO'    ? control_radio(el, x) :
                type === 'CHECKBOX' ? control_checkbox(el, x) :
                null) :
            tag === 'TEXTAREA'      ? control_value(el, x) :
            tag === 'SELECT'        ? control_value(el, x) :
            null;

        if (!result) throw new Error("Element is not a recognized control");

        return result;
    }

    function control_value(el, x) {
        var from = X(function () {
            el.value = x();
        });

        el.addEventListener('change', function () {
            x(el.value);
            return true;
        }, false);

        return from;
    }

    function control_checkbox(el, x) {
        var from = X(function () {
            el.checked = !!x();
        });

        el.addEventListener('change', function () {
            x(el.checked);
            return true;
        }, false);

        return from;
    }

    function control_radio(el, x) {
        var from = X(function () {
            var _x = x(),
                _t = typeof _x,
                _v = _t !== "string" && _t !== "undefined" && _x !== null && _x.toString ? _x.toString() : _x;

            el.checked = (_v === el.getAttribute('value'));
        });

        el.addEventListener('change', function () {
            if (el.checked) x(el.getAttribute('value'));
            return true;
        }, false);

        return from;
    }

    function text(el, x) {
        if (el.nodeType !== 3) throw new Error("Argument is not a text node");

        return X(function () { el.data = x(); });
    }

    function event(el, name, x) {
        el.addEventListener(name, function (evt) {
            var fn = x();
            fn && fn(evt);
        }, false);
    }
})(X);