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

        directive: function (values, action) {
            K.rproc(function () { values(action); });

            return this;
        },

        value: function (values) {
            var node = this.node,
                signal = null,
                event = null;

            if (node.value === undefined)
                throw new Error("@value can only be applied to an element with a .value property, \n"
                    + "such as <input/>, <textarea/> and <select/>.  Element ``" + node + "'' does \n"
                    + "not have a .value property.  Perhaps you applied it to the wrong node?");

            this.directive(values, function value(_event, _signal) {
                if (arguments.length < 2) _signal = _event, _event = 'change';

                if (typeof _signal !== 'function')
                    throw new Error("@value binding must receive a function for two-way binding.  \n"
                        + "Perhaps you mistakenly dereferenced it with '()'?");

                signal = _signal;

                K(function () {
                    var update = signal();
                    if (node.value !== update.toString()) node.value = update;
                });

                if (_event !== event) {
                    if (event) lib.removeEventListener(node, event, watcher);
                    lib.addEventListener(node, _event, watcher);
                    event = _event;
                }
            });

            return this;

            function watcher() {
                var cur = K.peek(signal),
                    update = node.value;
                if (cur.toString() !== update) signal(update);
                return true;
            }
        },

        checked: function (values) {
            var node = this.node,
                signal = null,
                on = true,
                off = false;

            if (node.checked === undefined)
                throw new Error("@checked can only be applied to an element with a .checked property, \n"
                    + "such as <input type=\"radio\"/> and <input type=\"checkbox\"/>.  Element \n"
                    + "``" + node + "'' does not have a .checked property.  Perhaps you applied it \n"
                    + "to the wrong node?");

            this.directive(values, function checked(_on, _off, _signal) {
                if (arguments.length === 2) _signal = _off, _off = undefined;
                if (arguments.length === 1) _signal = _on, _on = _off = undefined;

                if (typeof _signal !== 'function')
                    throw new Error("@checked binding must receive a function for two-way binding. \n"
                        + "Perhaps you mistakenly dereferenced it with '()'?");

                signal = _signal;
                on = _on === undefined ? true : _on;
                off = _off === undefined ? (on === true ? false : null) : _off;

                K(function () {
                    var update = signal() === on;
                    if (node.checked != update) node.checked = update;
                });
            });

            lib.addEventListener(node, "change", function () {
                signal(node.checked ? on : off);
                return true;
            });

            return this;
        },

        class: function (values) {
            var node = this.node;

            if (node.className === undefined)
                throw new Error("@class can only be applied to an element that accepts class names. \n"
                    + "Element ``" + node + "'' does not. Perhaps you applied it to the wrong node?");

            this.directive(values, function classDirective(on, off, flag) {
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

            return this;
        },

        property: function (values) {
            var node = this.node;

            this.directive(values, function property(name, value) {
                if (node[name] === undefined)
                    throw new Error("@property can only set a defined property of a node. \n"
                        + "Element ``" + node + "'' has no property ''" + name + "''.  \n"
                        + "Perhaps you applied it to the wrong node?");

                node[name] = value;
            });

            return this;
        },

        focus: function (values) {
            var node = this.node;

            this.directive(values, function focus(flag) {
                flag ? node.focus() : node.blur();
            });

            return this;
        },

        style: function (values) {
            var node = this.node;

            this.directive(values, function style(property, value) {
                node.style[property] = value;
            });

            return this;
        },

        insert: function(values) {
            var node = this.node,
                parent,
                start;

            this.directive(values, function (value) {
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

                return this;
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

        run: function (fn) {
            return this.directive(fn, this.node);
        }
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
