(function (K) {
    "use strict";

    K.DOM = {
        Shell: Shell,
        parse: parse
    };

    function Shell(node) {
        if (node.nodeType === undefined)
            throw new Error("Shell can only wrap a DOM node.  Value ``" + node + "'' is not a DOM node.")
        this.node = node;
    }

    Shell.prototype = {
        childNode: function childNode(index) {
            if (this.node.childNodes === undefined)
                throw new Error("Shell.childNode can only be applied to a node with a \n"
                    + ".childNodes collection.  Node ``" + this.node + "'' does not have one. \n"
                    + "Perhaps you applied it to the wrong node?");

            var child = this.node.childNodes[index];

            if (!child)
                throw new Error("Node ``" + this.node + "'' does not have a child at index " + i + ".");

            return new Shell(child);
        },

        childNodes: function children(indices, fn) {
            var childNodes = this.node.childNodes,
                len = indices.length,
                childShells = new Array(len),
                i, child;

            if (childNodes === undefined)
                throw new Error("Shell.childNodes can only be applied to a node with a \n"
                    + ".childNodes collection.  Node ``" + this.node + "'' does not have one. \n"
                    + "Perhaps you applied it to the wrong node?");

            for (i = 0; i < len; i++) {
                child = childNodes[indices[i]];
                if (!child)
                    throw new Error("Node ``" + this.node + "'' does not have a child at index " + i + ".");

                childShells[i] = new Shell(child);
            }

            fn(childShells);

            return this;
        },

        directive: function directive(values, action) {
            K.rproc(function () { values(action); });

            return this;
        },

        signal: function (values) {
            var node = this.node,
                signal = null,
                tag = node.nodeName,
                type = node.type && node.type.toUpperCase(),
                handler =
                    tag === 'INPUT'         ? (
                        type === 'TEXT'     ? valueSignal    :
                        type === 'RADIO'    ? radioSignal    :
                        type === 'CHECKBOX' ? checkboxSignal :
                        null) :
                    tag === 'TEXTAREA'      ? valueSignal    :
                    tag === 'SELECT'        ? valueSignal    :
                    null;

            if (!handler)
                throw new Error("@signal can only be applied to a form control element, \n"
                    + "such as <input/>, <textarea/> or <select/>.  Element ``" + node + "'' is \n"
                    + "not a recognized control.  Perhaps you applied it to the wrong node?");

            return this.directive(values, handler());

            function valueSignal() {
                var event = null;

                return function valueSignal(_event, _signal) {
                    if (arguments.length < 2) _signal = _event, _event = 'change';
                    setSignal(_signal);

                    K(function () {
                        node.value = signal();
                    });

                    if (_event !== event) {
                        if (event) lib.removeEventListener(node, event, valueListener);
                        lib.addEventListener(node, _event, valueListener);
                        event = _event;
                    }
                };

                function valueListener() {
                    var cur = K.peek(signal),
                        update = node.value;
                    if (cur.toString() !== update) signal(update);
                    return true;
                }
            }

            function checkboxSignal() {
                var on = true,
                    off = false;

                lib.addEventListener(node, "change", function checkboxListener() {
                    signal(node.checked ? on : off);
                    return true;
                });

                return function checkboxSignal(_signal, _on, _off) {
                    setSignal(_signal);

                    on = _on === undefined ? true : _on;
                    off = _off === undefined ? (on === true ? false : null) : _off;

                    K(function () {
                        node.checked = (signal() === on);
                    });
                };
            }

            function radioSignal(values) {
                var on = true;

                lib.addEventListener(node, "change", function radioListener() {
                    if (node.checked) signal(on);
                    return true;
                });

                return function radioSignal(_signal, _on) {
                    setSignal(_signal);

                    on = _on === undefined ? true : _on;

                    K(function () {
                        node.checked = (signal() === on);
                    });
                };
            }

            function setSignal(s) {
                if (typeof s !== 'function')
                    throw new Error("@signal must receive a function for two-way binding.  \n"
                        + "Perhaps you mistakenly dereferenced it with '()'?");
                signal = s;
            }
        },

        class: function (values) {
            var node = this.node;

            if (node.className === undefined)
                throw new Error("@class can only be applied to an element that accepts class names. \n"
                    + "Element ``" + node + "'' does not. Perhaps you applied it to the wrong node?");

            return this.directive(values, function classDirective(on, off, flag) {
                if (arguments.length < 3) flag = off, off = null;

                var hasOn = lib.classListContains(node, on),
                    hasOff = off && lib.classListContains(node, off);

                if (flag) {
                    if (!hasOn) lib.classListAdd(node, on);
                    if (off && hasOff) lib.classListRemove(node, off);
                } else {
                    if (hasOn) lib.classListRemove(node, on);
                    if (off && !hasOff) lib.classListAdd(node, off);
                }
            });
        },

        focus: function (values) {
            var node = this.node;

            return this.directive(values, function focus(flag) {
                flag ? node.focus() : node.blur();
            });
        },

        key: function (values) {
            var node = this.node,
                keyCode,
                event,
                fn;

            return this.directive(values, function key(_key, _event, _fn) {
                if (arguments.length < 3) _fn = _event, _event = 'down';

                keyCode = keyCodes[_key.toLowerCase()];
                fn = _fn;

                if (keyCode === undefined)
                    throw new Error("@key: unrecognized key identifier '" + _key + "'");

                if (typeof fn !== 'function')
                    throw new Error("@key: must supply a function to call when the key is entered");

                _event = 'key' + _event;
                if (_event !== event) {
                    if (event) lib.removeEventListener(node, event, keyListener);
                    lib.addEventListener(node, _event, keyListener);
                    event = _event;
                }
            });

            function keyListener(e) {
                if (e.keyCode === keyCode) fn();
                return true;
            }
        },

        insert: function(values) {
            var node = this.node,
                parent,
                start;

            return this.directive(values, function (value) {
                parent = node.parentNode;

                if (!parent)
                    throw new Error("@insert can only be used on a node that has a parent node. \n"
                        + "Node ``" + node + "'' is currently unattached to a parent.");

                if (start) {
                    if (start.parentNode !== parent)
                        throw new Error("@insert requires that the inserted nodes remain sibilings \n"
                            + "of the original node.  The DOM has been modified such that this is \n"
                            + "no longer the case.");

                    clear(start, node);
                } else start = marker(node);

                insert(value);
            });

            // value ::
            //   null or undefined
            //   string
            //   node
            //   array of value
            function insert(value) {
                if (value === null || value === undefined) {
                    // nothing to insert
                } else if (value.nodeType /* instanceof Node */) {
                    parent.insertBefore(value, node);
                } else if (Array.isArray(value)) {
                    insertArray(value);
                } else {
                    parent.insertBefore(document.createTextNode(value.toString()), node);
                }
            }

            function insertArray(array) {
                var i, len, prev;
                for (i = 0, len = array.length; i < len; i++) {
                    insert(array[i]);
                    // if we've enjambed two text nodes, separate them with a space
                    if (prev
                        && prev.nodeType == 3
                        && prev.nextSibling !== node
                        && prev.nextSibling.nodeType === 3)
                    {
                        parent.insertBefore(document.createTextNode(" "), prev.nextSibling);
                    }
                    prev = node.previousSibling;
                }
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
        },

        property: function property(name, fn) {
            return this.directive(fn, this.node);
        }
    };

    Shell.prototype.key.wrapCallback = true;

    var keyCodes = {
        backspace:  8,
        tab:        9,
        enter:      13,
        shift:      16,
        ctrl:       17,
        alt:        18,
        pause:      19,
        break:      19,
        capslock:   20,
        esc:        27,
        space:      32,
        pageup:     33,
        pagedown:   34,
        end:        35,
        home:       36,
        leftarrow:  37,
        uparrow:    38,
        rightarrow: 39,
        downarrow:  40,
        prntscrn:   44,
        insert:     45,
        delete:     46,
        "0":        48,
        "1":        49,
        "2":        50,
        "3":        51,
        "4":        52,
        "5":        53,
        "6":        54,
        "7":        55,
        "8":        56,
        "9":        57,
        a:          65,
        b:          66,
        c:          67,
        d:          68,
        e:          69,
        f:          70,
        g:          71,
        h:          72,
        i:          73,
        j:          74,
        k:          75,
        l:          76,
        m:          77,
        n:          78,
        o:          79,
        p:          80,
        q:          81,
        r:          82,
        s:          83,
        t:          84,
        u:          85,
        v:          86,
        w:          87,
        x:          88,
        y:          89,
        z:          90,
        winkey:     91,
        winmenu:    93,
        f1:         112,
        f2:         113,
        f3:         114,
        f4:         115,
        f5:         116,
        f6:         117,
        f7:         118,
        f8:         119,
        f9:         120,
        f10:        121,
        f11:        122,
        f12:        123,
        numlock:    144,
        scrolllock: 145,
        ",":        188,
        "<":        188,
        ".":        190,
        ">":        190,
        "/":        191,
        "?":        191,
        "`":        192,
        "~":        192,
        "[":        219,
        "{":        219,
        "\\":       220,
        "|":        220,
        "]":        221,
        "}":        221,
        "'":        222,
        "\"":       222
    };

    function parse(html) {
        var container = document.createElement(containerElement(html)),
            len,
            frag;

        container.innerHTML = html;
        len = container.childNodes.length;

        if (len === 0) {
            // special case: empty text node gets swallowed, so create it directly
            if (html === "") return document.createTextNode("");
            throw new Error("HTML parse failed for: " + html);
        } else if (len === 1) {
            return container.childNodes[0];
        } else {
            frag = document.createDocumentFragment();

            while(container.childNodes.length !== 0) {
                frag.appendChild(container.childNodes[0]);
            }

            return frag;
        }
    }

    var matchOpenTag = /<(\w+)/,
        containerElements = {
            "li": "ul",
            "td": "tr",
            "th": "tr",
            "tr": "tbody",
            "thead": "table",
            "tbody": "table",
            "dd": "dl",
            "dt": "dl",
            "head": "html",
            "body": "html"
        };

    function containerElement(html) {
        var m = matchOpenTag.exec(html);
        return m && containerElements[m[1].toLowerCase()] || "div";
    }

    var _cache = {};

    parse.cache = function cache(id, html) {
        var cached = _cache[id];

        if (cached === undefined) {
            cached = parse(html);
            _cache[id] = cached;
        }

        return cached.cloneNode(true);
    }

    // cross-browser library of required DOM functions
    var lib = {
        addEventListener: function addEventListener(node, event, fn) {
            node.addEventListener(event, fn, false);
        },

        removeEventListener: function removeEventListener(node, event, fn) {
            node.removeEventListener(event, fn);
        },

        classListContains: function (el, name) {
            return el.classList.contains(name);
        },

        classListAdd: function (el, name) {
            return el.classList.add(name);
        },

        classListRemove: function (el, name) {
            return el.classList.remove(name);
        }
    };

    K.DOM.lib = lib;
})(K);
