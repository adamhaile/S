test("K.DOM.parse - round-trip html -> node -> html = identical", function () {
    "use strict";

    checkRoundTrip("table", "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>");
    checkRoundTrip("table header", "<thead><tr><td>a</td><td>b</td></tr></thead>");
    checkRoundTrip("table body", "<tbody><tr><td>a</td><td>b</td></tr></tbody>");
    checkRoundTrip("table row", "<tr><td></td><td>b</td></tr>");
    checkRoundTrip("table cell", "<td>a table cell</td>");
    checkRoundTrip("table cells", "<td>one</td><td>two</td>");
    checkRoundTrip("table header cell", "<th>a table cell</th>");
    checkRoundTrip("table header cells", "<th>one</th><th>two</th>");
    checkRoundTrip("unordered list", "<ul><li>one</li><li>two</li></ul>");
    checkRoundTrip("ordered list", "<ol><li>one</li><li>two</li></ol>");
    checkRoundTrip("list item", "<li>a list item</li>");
    checkRoundTrip("list items", "<li>one</li><li>two</li><li>three</li>");
    checkRoundTrip("definition list", "<dl><dt>one</dt><dd>one def</dd><dt>two</dt><dd>two def</dd></dl>");
    checkRoundTrip("definition items", "<dt>one</dt><dd>one def</dd><dt>two</dt><dd>two def</dd>");
    checkRoundTrip("span", "<span>some text</span>");
    checkRoundTrip("spans", "<span>one</span><span>two</span>");
    // head and body currently fail, as the parser attaches a body to a head and vice versa
    // how to fix?
    //checkRoundTrip("head", "<head><title>title</title></head>");
    //checkRoundTrip("body", "<body>Jimmy Hoffa</body>")
    checkRoundTrip("title", "<title>title</title>");
    // why does this fail?  shouldn't it be <input/>, not <input>?
    //checkRoundTrip("input", "<input/>");
    checkRoundTrip("input", "<input>");
    checkRoundTrip("text", "some text");
    checkRoundTrip("a comment", "<!-- a comment -->");
    checkRoundTrip("empty text", "");
    checkRoundTrip("unbalanced &gt;&lt;", "<> bad type=\"html <");
    checkRoundTrip("bogus elements", "<foo><bar></bar></foo>");

    function checkRoundTrip(msg, html) {
        var node = K.DOM.parse(html),
            back = serialize(node);

        // since some browsers change tag case, we don't required case-preservation
        strictEqual(html.toLowerCase(), back.toLowerCase(), msg + ": " + html);
    }
});

test("K.DOM.parse - round-trip node -> html -> node = identical", function () {
    "use strict";
    //checkRoundTrip("html", "html");
    //checkRoundTrip("head", "head");
    checkRoundTrip("title", "title");
    checkRoundTrip("link", "link");
    checkRoundTrip("meta", "meta");
    //checkRoundTrip("body", "body");
    checkRoundTrip("table", "table");
    checkRoundTrip("thead", "thead");
    checkRoundTrip("tbody", "tbody");
    checkRoundTrip("tr", "tr");
    checkRoundTrip("td", "td");
    checkRoundTrip("th", "th");
    checkRoundTrip("ul", "ul");
    checkRoundTrip("li", "li");
    checkRoundTrip("ol", "ol");
    checkRoundTrip("Todo MVC markup", "todos");

    function checkRoundTrip(msg, id) {
        var node = document.getElementById(id),
            html = node.outerHTML,
            back = K.DOM.parse(html);

        ok(node.isEqualNode(back), msg + ": " + html);
    }
});

test("K.DOM.Shell navigation", function () {
    "use strict";
    var sh = new K.DOM.Shell(K.DOM.parse(
        "<div>\
            <span></span>\
            <a></a>\
            <!-- comment --> \
        </div>"
    ));

    strictEqual("DIV", sh.node.nodeName, "top node located");

    // childNode navigation
    sh.childNodes([0, 1, 3, 5], function (__) {
        strictEqual("#text",    __[0].node.nodeName, "child text node located");
        strictEqual("SPAN",     __[1].node.nodeName, "child element node located");
        strictEqual("A",        __[2].node.nodeName, "second child element node located");
        strictEqual("#comment", __[3].node.nodeName, "child comment node located");
    });
});

test("K.DOM.Shell::property", function () {
    "use strict";
    var sh = new K.DOM.Shell(K.DOM.parse("<input></input>"));

    // static property value
    sh.property("type", function (__) { __.type = "text"; });

    strictEqual(sh.node.type, "text", "static property value");

    // dynamic property value
    var name = K("foo");

    sh.property("name", function (__) { __.name = name(); });

    strictEqual(sh.node.name, "foo", "dynamic property value initialized");

    name("bar");

    strictEqual(sh.node.name, "bar", "dynamic property value reflects change");
});

test("K.DOM.Shell::class", function () {
    "use strict";
    var sh = new K.DOM.Shell(K.DOM.parse("<input></input>"));

    sh.class(function (__) { __("foo", true); });
    sh.class(function (__) { __("bar", false); });

    ok(sh.node.classList.contains("foo"), "single classs, static true flag");
    ok(!sh.node.classList.contains("bar"), "single class, static false flag");

    // on/off classes with static flag
    sh.class(function (__) { __("blech", "unblech", true); });
    sh.class(function (__) { __("garg", "ungarg", false); });

    ok(sh.node.classList.contains("blech"), "on class, static true flag");
    ok(!sh.node.classList.contains("unblech"), "off class, static true flag");

    ok(!sh.node.classList.contains("garg"), "on class, static false flag");
    ok(sh.node.classList.contains("ungarg"), "off class, static false flag");

    var flag = K(true);

    sh.class(function (__) { __("snork", flag()); });

    ok(sh.node.classList.contains("snork"), "single class, dynamic true flag");

    flag(false);

    ok(!sh.node.classList.contains("snork"), "single class, dynamic false flag");
});

test("K.DOM.Shell::signal - <input type=\"text\"/>", function () {
    "use strict";
    var sh = new K.DOM.Shell(K.DOM.parse("<input type=\"text\"></input>")),
        value = K("foo"),
        updateCount = 0,
        updateCounter = K(function () { value(); updateCount++; }),
        value2 = K("furg"),
        change = new Event("change"),
        keydown = new KeyboardEvent("keydown");

    sh.signal(function (__) { __(value); });

    strictEqual(sh.node.value, "foo", "initialization");

    value("bar");
    strictEqual("bar", sh.node.value, "js -> DOM");

    updateCount = 0;
    sh.node.value = "blech";
    sh.node.dispatchEvent(change);

    strictEqual("blech", value(), "DOM -> js with default 'change' event");
    strictEqual(1, updateCount, "DOM -> js change propagates");

    updateCount = 0;
    sh.node.dispatchEvent(change);

    strictEqual(0, updateCount, "DOM -> js only triggered when value changed");

    sh.signal(function (__) { __("keydown", value2); });

    strictEqual(value2(), sh.node.value, "initialization with custom event");

    sh.node.value = "snark";
    sh.node.dispatchEvent(keydown);

    strictEqual("snark", value2(), "DOM -> js with custom event");
    strictEqual(0, updateCount, "custom event doesn't trigger default update");
});

test("K.DOM.Shell::signal - <input type=\"checkbox\"/>", function () {
    "use strict";
    var sh = new K.DOM.Shell(K.DOM.parse("<input type=\"checkbox\"></input>")),
        value = K(true),
        change = new Event("change");

    sh.signal(function (__) { __(value); });

    strictEqual(sh.node.checked, true, "initialization");

    value(false);

    strictEqual(sh.node.checked, false, "js -> DOM unchecked");

    value(true);

    strictEqual(sh.node.checked, true, "js -> DOM checked");

    sh.node.checked = true;
    sh.node.dispatchEvent(change);

    strictEqual(value(), true, "DOM -> js checked");

    sh.node.checked = false;
    sh.node.dispatchEvent(change);

    strictEqual(value(), false, "DOM -> js unchecked");
});

test("K.DOM.Shell::signal - <input type=\"checkbox\"/> with 'on' value", function () {
    "use strict";
    var sh = new K.DOM.Shell(K.DOM.parse("<input type=\"checkbox\"></input>")),
        value = K("on"),
        change = new Event("change");

    sh.signal(function (__) { __(value, "on"); });

    strictEqual(sh.node.checked, true, "initialization with specified 'on' value");

    value(null);

    strictEqual(sh.node.checked, false, "js -> DOM unchecked with specified 'on' value");

    value("on");

    strictEqual(sh.node.checked, true, "js -> DOM checked with specified 'on' value");

    sh.node.checked = true;
    sh.node.dispatchEvent(change);

    strictEqual(value(), "on", "DOM -> js checked with specified 'on' value");

    sh.node.checked = false;
    sh.node.dispatchEvent(change);

    strictEqual(value(), null, "DOM -> js unchecked with specified 'on' value");
});

test("K.DOM.Shell::signal - <input type=\"checkbox\"/> with 'on' and 'off' values", function () {
    "use strict";
    var sh = new K.DOM.Shell(K.DOM.parse("<input type=\"checkbox\"></input>")),
        value = K("on"),
        change = new Event("change");

    sh.signal(function (__) { __(value, "on", "off"); });

    strictEqual(sh.node.checked, true, "initialization with specified 'on' and 'off' values");

    value("off");

    strictEqual(sh.node.checked, false, "js -> DOM unchecked with specified 'on' and 'off' values");

    value("on");

    strictEqual(sh.node.checked, true, "js -> DOM checked with specified 'on' and 'off' values");

    sh.node.checked = true;
    sh.node.dispatchEvent(change);

    strictEqual(value(), "on", "DOM -> js checked with specified 'on' and 'off' values");

    sh.node.checked = false;
    sh.node.dispatchEvent(change);

    strictEqual(value(), "off", "DOM -> js unchecked with specified 'on' and 'off' values");
});

test("K.DOM.Shell::insert", function () {
    var sh = new K.DOM.Shell(K.DOM.parse("<div>before<!-- insert -->after</div>")),
        insert = K(null),
        mark = sh.childNode(1);

    strictEqual(mark.node.nodeName, "#comment", "mark node located");

    mark.insert(function (__) { __(insert()); });

    strictEqual(sh.node.innerHTML, "before<!-- insert -->after", "initialization with null leads to no change");

    insert("foo");

    strictEqual(sh.node.innerHTML, "beforefoo<!-- insert -->after", "insert of text");

    insert("bar");

    strictEqual(sh.node.innerHTML, "beforebar<!-- insert -->after", "change of text");

    insert(K.DOM.parse("<span>foo</span>"));

    strictEqual(sh.node.innerHTML, "before<span>foo</span><!-- insert -->after", "insert of node");

    insert(K.DOM.parse("<div>bar</div>"));

    strictEqual(sh.node.innerHTML, "before<div>bar</div><!-- insert -->after", "change of node");

    insert(K.DOM.parse("<span>foo</span>inside<span>bar</span>"));

    strictEqual(sh.node.innerHTML, "before<span>foo</span>inside<span>bar</span><!-- insert -->after", "insert of fragment");

    insert(K.DOM.parse("<div>blurg</div><div>snark</div>"));

    strictEqual(sh.node.innerHTML, "before<div>blurg</div><div>snark</div><!-- insert -->after", "change of fragment");

    insert(["foo", "bar"]);

    strictEqual(sh.node.innerHTML, "beforefoo bar<!-- insert -->after", "array of strings");

    insert([K.DOM.parse("<span>foo</span>"), K.DOM.parse("<div>bar</div>")]);

    strictEqual(sh.node.innerHTML, "before<span>foo</span><div>bar</div><!-- insert -->after", "array of strings");

    // should we support this?
    insert(["foo", ["bar", "blech"]]);

    strictEqual(sh.node.innerHTML, "beforefoo bar blech<!-- insert -->after", "array of array of strings");
});

function serialize(node) {
    var str = "", i;

    if (node.outerHTML !== undefined) {
        str = node.outerHTML;
    } else if (node.nodeType === 3 /* text node */) {
        str = node.data;
    } else if (node.nodeType === 8 /* comment node */) {
        str = "<!--" + node.data + "-->";
    } else if (node.nodeType === 11 /* document fragment */) {
        for (i = 0; i < node.childNodes.length; i++) {
            str += serialize(node.childNodes[i]);
        }
    } else {
        throw new Error("Don't know how to stringify node: " + node);
    }

    return str;
}
