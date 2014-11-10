(function (K) {
    "use strict";

    K.DOM.template = template;

    template.cache = cache;
    template.Binding  = Binding;
    template.Node     = 'N';
    template.Attr     = 'A';
    template.Control  = 'C';
    template.Event    = 'V';
    template.Element  = 'E';

    function Binding(type, path, valueCount, name, data) {
        this.type = type;
        this.path = path;
        this.valueCount = valueCount;
        this.name = name;
        this.data = data;
    }

    function template(html, bindings) {
        var container = document.createElement(containerElement(html)),
            frag = document.createDocumentFragment(),
            i;

        container.innerHTML = html;

        for (i = container.childNodes.length; i; i--) {
            frag.appendChild(container.childNodes[0]);
        }

        return function templateInvocation(values) {
            var el = frag.cloneNode(true);

            bindLocations(el, bindings, values);

            return el.childNodes.length === 1 ? el.childNodes[0] : el;
        }
    }

    var containerElements = {
        "li": "ul",
        "td": "tr",
        "th": "tr",
        "tr": "table",
        "thead": "table",
        "tbody": "table",
        "dd": "dl",
        "dt": "dl",
        "head": "html",
        "body": "html"
    };

    function containerElement(html) {
        var m = /<(\w+)/.exec(html);
        return m && containerElements[m[1].toLowerCase()] || "div";
    }

    function bindLocations(el, bindings, values) {
        var nodes = [], i, j, binding, value, node;

        for (i = 0; i < bindings.length; i++) {
            nodes.push(getPath(el, bindings[i].path));
        }

        for (i = 0, j = 0; i < bindings.length; i++) {
            binding = bindings[i], node = nodes[i], value = values[j];

            if (binding.type === template.Node) {

                K.DOM.insert(node, value);

            } else if (binding.type === template.Attr) {

                K.DOM.attr(node, binding.name, attrValue(binding.data, values, j));

            } else if (binding.type === template.Control) {

                K.DOM.control(node, value, binding.name);

            } else if (binding.type === template.Event)  {

                K.DOM.event(node, binding.name, value);

            } else if (binding.type === template.Element)  {

                K.DOM.element(node, value);

            } else {
                throw new Error("unrecognized binding type: " + binding.type);
            }

            j += binding.valueCount;
        }

        if (j !== values.length)
            throw new Error("incorrect number of values supplied to template (expected " + j + ", received " + values.length + ")");
    }

    function getPath(el, path) {
        for (var i = 0, len = path.length; i < len; i++) {
            el = el.childNodes[path[i]];
        }
        return el;
    }

    function proxy(v) {
        return function (x) {
            var unwrapped = arguments.length > 0 ? v(x) : v();
            if (typeof unwrapped === 'function') unwrapped = arguments.length > 0 ? v(x) : v();
            return unwrapped;
        }
    }

    function attrValue(pieces, vals, start) {
        return function () {
            var text = "", i, j, len, piece;

            for (i = 0, j = start, len = pieces.length; i < len; i++) {
                piece = pieces[i];
                text += piece === null ? vals[j++]() : piece;
            }

            return text;
        }
    }

    var _cache = {};

    function cache(id, html, bindings) {
        if (!_cache.hasOwnProperty(id))  _cache[id] = template(html, bindings);
        return _cache[id];
    }
})(K);
