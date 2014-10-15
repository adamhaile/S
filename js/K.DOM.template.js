(function (K) {
    "use strict";

    K.DOM.template = template;

    function template(html, splits, locs) {
        var container = document.createElement(containerElement(tmpl.html)),
            frag = document.createDocumentFragment(),
            i;

        container.innerHTML = html;

        splitTextNodes(container, splits);

        for (i = container.childNodes.length; i; i--) {
            frag.appendNode(container.childNode[0]);
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
        return m && containerElements[m[1].toLower()] || "div";
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
            parent.removeNode(text);
        }
    }

    function bindLocations(el, locs, vals) {
        if (vals.length !== locs.length)
            throw new Error("incorrect number of values supplied to template (expected " + locs.length + ", received " + vals.length + ")");

        var i, len, loc, val, node;

        for (i = 0, len = locs.length; i < len; i++) {
            loc = locs[i], val = vals[i];

            node = getPath(el, loc.path);

            if (loc instanceof t.NodeLocation) {
                K.DOM.insert(node, val);
            } else if (loc instanceof t.AttrLocation) {
                K.DOM.attr(node, loc.attr, val);
            } else if (loc instanceof t.ControlLocation) {
                K.DOM.control(node, val);
            } else /* if (loc instanceof t.EventLocation) */ {
                K.DOM.event(node, loc.event, val);
            }
        }
    }

    function getPath(el, path) {
        for (var i = 0, len = path.length; i < len; i++) {
            el = el.childNodes[path[i]];
        }
        return el;
    }
})(K);
