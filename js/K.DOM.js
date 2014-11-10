// HTML bindings for K.js
(function (K) {

    K.DOM = {
        control : control,
        text    : text,
        attr    : attr,
        event   : event,
        insert  : insert,
        element : element
    };

    return;

    function control(el, x, event) {
        var tag = el.tagName && el.tagName.toUpperCase(),
            type = el.attributes && el.attributes.type && el.attributes.type.value.toUpperCase();

        var result =
            tag === 'INPUT'         ? (
                type === 'TEXT'     ? controlValue(el, x, event) :
                type === 'RADIO'    ? controlRadio(el, x, event) :
                type === 'CHECKBOX' ? controlCheckbox(el, x, event) :
                null) :
            tag === 'TEXTAREA'      ? controlValue(el, x, event) :
            tag === 'SELECT'        ? controlValue(el, x, event) :
            null;

        if (!result) throw new Error("Element is not a recognized control");

        return result;
    }

    function controlValue(el, c, event) {
        var from = K.rproc(function () {
            el.value = unwrap(c);
        });

        addEvent(el, event || 'change', function () {
            unwrapSet(c, el.value);
            return true;
        }, false);

        return from;
    }

    function controlCheckbox(el, c, event) {
        var from = K.rproc(function () {
            el.checked = !!unwrap(c);
        });

        addEvent(el, event || 'change', function () {
            unwrapSet(c, el.checked);
            return true;
        }, false);

        return from;
    }

    function controlRadio(el, c, event) {
        var from = K.rproc(function () {
            var _c = unwrap(c),
                _t = typeof _c,
                _v = _t !== "string" && _t !== "undefined" && _c !== null && _c.toString ? _c.toString() : _c;

            el.checked = (_v === el.getAttribute('value'));
        });

        addEvent(el, event || 'change', function () {
            if (el.checked) unwrapSet(c, el.getAttribute('value'));
            return true;
        }, false);

        return from;
    }

    function text(el, c) {
        if (el.nodeType !== 3) throw new Error("Argument is not a text node");

        return K.rproc(function () { el.data = unwrap(c); });
    }

    function event(el, name, fn) {
        addEvent(el, name, fn);
    }

    function attr(el, name, c) {
        if (el.nodeType !== 1) throw new Error("Argument is not an element");

        return K.rproc(function () { el.setAttribute(name, unwrap(c)); });
    }

    function element(el, c) {
        return K.rproc(function () { unwrapSet(c, el); });
    }


    // val ::
    //   el
    //   array of val
    //   X.val of val
    //   X.seq of val
    //   other -> textNode of val.toString()


    function insert(el, val) {
        if (!el.parentNode) throw new Error("element must have a parent");

        var parent = el.parentNode;

        return insert(el, val);

        function insert(el, val) {
            if (val === null || val === undefined) {
                // nothing to insert
            } else if (val.nodeType /* instanceof Node */) {
                parent.insertBefore(val, el);
            } else if (Array.isArray(val)) {
                insertArray(el, val);
            } else if (val.K instanceof K.seq.K) {
                insertSeq(el, val);
            } else if (typeof val === 'function') {
                insertFunction(el, val);
            } else {
                parent.insertBefore(document.createTextNode(val.toString()), el);
            }
        }

        function insertArray(el, array) {
            var i, len, prev;
            for (i = 0, len = array.length; i < len; i++) {
                insert(el, array[i]);
                // if we've enjambed two text nodes, separate them with a space
                if (prev
                    && prev.nodeType == 3
                    && prev.nextSibling !== el
                    && prev.nextSibling.nodeType === 3)
                {
                    parent.insertBefore(document.createTextNode(" "), prev.nextSibling);
                }
                prev = el.previousSibling;
            }
        }

        function insertFunction(el, fn) {
            var start = marker(el),
                end = marker(el);

            return K.rproc(function () {
                // reset parent, as elements may have been re-parented since code last ran
                parent = el.parentNode;
                clear(start, end);
                insert(end, unwrapOrSeq(fn));
            });
        }

        function move(s1, e1, s2, e2) {
            clear(s2, e2);
            var cur = s1.nextSibling;
            while (cur !== e1) {
                parent.insertBefore(cur, e2);
                cur = s1.nextSibling;
            }
        }

        function setEl(start, end, frag) {
            clear(start, end);
            parent.insertBefore(end, frag);
        }

        function clear(start, end) {
            var next = start.nextSibling;
            while (next !== end) {
                parent.removeChild(next);
                next = start.nextSibling;
            }
        }

        function marker(el) {
            return parent.insertBefore(document.createTextNode(""), el);
        }
    }

    function unwrap(c) {
        while (typeof c === 'function') c = c();
        return c;
    }

    function unwrapSet(c, v) {
        while (typeof c === 'function') c = c(v);
    }

    function unwrapOrSeq(c) {
        while (typeof c === 'function' && !(c.K instanceof K.seq.K)) c = c();
        return c;
    }

    function addEvent(el, event, fn) {
        if (el.addEventListener) {
            el.addEventListener(event, fn, false);
        } else if (el.attachEvent) {
            el.attachEvent('on' + event, fn);
        } else {
            el['on' + event] = fn;
        }
    }
})(K);
