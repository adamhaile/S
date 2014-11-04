(function (K) {
    "use strict";

    K.DOM.template = template;

    template.Split    = Split;
    template.Location = Location;
    template.Node     = 'N';
    template.Attr     = 'A';
    template.Control  = 'C';
    template.Event    = 'E';

    function Split(path, splits) {
        this.path = path;
        this.splits = splits;
    }

    function Location(type, path, valCount, name, data) {
        this.type = type;
        this.path = path;
        this.valCount = valCount;
        this.name = name;
        this.data = data;
    }

    function template(html, splits, locs) {
        var container = document.createElement(containerElement(html)),
            frag = document.createDocumentFragment(),
            i;

        container.innerHTML = html;

        splitTextNodes(container, splits);

        for (i = container.childNodes.length; i; i--) {
            frag.appendChild(container.childNodes[0]);
        }

        return function templateInvocation(vals) {
            var el = frag.cloneNode(true);

            bindLocations(el, locs, vals);

            return el;
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

    function splitTextNodes(el, splits) {
        var i, j, leni, lenj, split, text, parent;

        for (i = 0, leni = splits.length; i < leni; i++) {
            split = splits[i];
            text = getPath(el, split.path);
            parent = text.parentNode;
            for (j = 0, lenj = split.splits.length; j < lenj; j++) {
                parent.insertBefore(document.createTextNode(split.splits[j]), text);
            }
            parent.removeChild(text);
        }
    }

    function bindLocations(el, locs, vals) {
        var i, j, len, loc, val, nodes = [], node;

        for (i = 0, len = locs.length; i < len; i++) {
            loc = locs[i];
            nodes.push(getPath(el, loc.path));
        }

        for (i = 0, j = 0, len = locs.length; i < len; i++) {
            loc = locs[i], node = nodes[i], val = vals[j];

            if (loc.type === template.Node) {

                K.DOM.insert(node, val);

            } else if (loc.type === template.Attr) {

                K.DOM.attr(node, loc.name, attrValue(loc.data, vals, j));

            } else if (loc.type === template.Control) {

                K.DOM.control(node, val, loc.name);

            } else if (loc.type === template.Event)  {

                K.DOM.event(node, loc.name, val);

            } else {
                throw new Error("unrecognized location type: " + loc.type);
            }

            j += loc.valCount;
        }
        
        if (j !== vals.length)
            throw new Error("incorrect number of values supplied to template (expected " + j + ", received " + vals.length + ")");
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
})(K);
