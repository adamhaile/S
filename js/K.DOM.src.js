(function (K) {
    "use strict";

    K.DOM.src = src;
    K.DOM.src.add = add;

    // DEBUG
    src.tokenize = tokenize;
    src.parse = parse;

    var shimmed = false;

    function src(str) {
        var toks = tokenize(str),
            ast = parse(toks);

        if (shimmed) ast.shim();

        var out = ast.genCode();

        return out;
    }

    /// tokens:
    /// < (followed by \w)
    /// </ (followed by \w))
    /// >
    /// />
    /// <!--
    /// -->
    /// )
    /// (
    /// [
    /// ]
    /// {
    /// }
    /// "
    /// '
    /// //
    /// \n
    /// @
    /// misc (any string not containing one of the above)

    // pre-compiled regular expressions
    var rx = {
        tokens             : /<\/?(?=\w)|\/?>|<!--|-->|\)|\(|\[|\]|\{|\}|"|'|\/\/|\n|@|(?:[^<>\/()[\]{}"'@\n-]|(?!-->)-|\/(?![>/])|(?!<\/?\w|<!--)<\/?)+/g,
        embeddedCodePrefix : /^[+\-!~]*[a-zA-Z_$][a-zA-Z_$0-9]*/, // prefix unary operators + identifier
        embeddedCodeInterim: /^(?:\.[a-zA-Z_$][a-zA-Z_$0-9]+)+/, // property chain, like .bar.blech
        embeddedCodeSuffix : /^\+\+|--/, // suffix unary operators
        attrStyleDirective : /^[a-zA-Z_$][a-zA-Z_$0-9]*(:[^\s:=]*)*(?=\s*=)/, // like "foo:bar:blech" followed by " = "
        attrStyleEquals    : /^\s*=\s/, // like " = "
        directiveName      : /^[a-zA-Z_$][a-zA-Z_$0-9]*/, // identifier for a directive
        stringEscapedEnd   : /[^\\](\\\\)*\\$/, // ending in odd number of escape slashes = next char of string escaped
        ws                 : /^\s*$/,
        finalLine          : /[^\n]*$/,
        backslashes        : /\\/g,
        newlines           : /\n/g,
        singleQuotes       : /'/g
    };

    var parens = {
        "(": ")",
        "[": "]",
        "{": "}"
    };

    function tokenize(str) {
        var TOKS = str.match(rx.tokens);

        // DEBUG
        if (TOKS.join("") !== str)
            throw new Error("missing text from tokens!");

        return TOKS;
    }

    var AST = {
            CodeTopLevel: function (segments) {
                this.segments = segments; // [ CodeText | HtmlExpression ]
            },
            CodeText: function (text) {
                this.text = text; // string
            },
            EmbeddedCode: function (segments) {
                this.segments = segments; // [ CodeText | HtmlExpression ]
            },
            HtmlExpression: function(nodes) {
                this.nodes = nodes; // [ HtmlElement | HtmlComment | HtmlText(ws only) | CodeInsert ]
            },
            HtmlElement: function(beginTag, directives, content, endTag) {
                this.beginTag = beginTag; // string
                this.directives = directives; // [ Directive | AttrStyleDirective ]
                this.content = content; // [ HtmlElement | HtmlComment | HtmlText | CodeInsert ]
                this.endTag = endTag; // string | null
            },
            HtmlText: function (text) {
                this.text = text; // string
            },
            HtmlComment: function (text) {
                this.text = text; // string
            },
            Directive: function (name, code) {
                this.name = name; // string
                this.code = code; // EmbeddedCode
            },
            AttrStyleDirective: function (left, code) {
                this.left = left; // [ string ]
                this.code = code; // EmbeddedCode
            },
            CodeInsert: function (code) {
                this.code = code; // EmbeddedCode
            }
        };

    function parse(TOKS) {
        var i = 0,
            EOF = TOKS.length === 0,
            TOK = !EOF && TOKS[i];

        return codeTopLevel();

        function codeTopLevel() {
            var segments = [],
                text = "";

            while (!EOF) {
                if (IS('<') || IS('<!--')) {
                    if (text) segments.push(new AST.CodeText(text));
                    text = "";
                    segments.push(htmlExpression());
                } else if (IS('"') || IS("'")) {
                    text += quotedString();
                } else if (IS('//')) {
                    text += codeComment();
                } else {
                    text += TOK, NEXT();
                }
            }

            if (text) segments.push(new AST.CodeText(text));

            return new AST.CodeTopLevel(segments);
        }

        function htmlExpression() {
            if (NOT('<') && NOT('<!--')) ERR("not at start of html expression");

            var nodes = [],
                wsText,
                mark;

            while (!EOF) {
                if (IS('<')) {
                    nodes.push(htmlElement());
                } else if (IS('<!--')) {
                    nodes.push(htmlComment());
                } else if (IS('@')) {
                    nodes.push(codeInsert());
                } else {
                    mark = MARK();
                    wsText = htmlWhitespaceText();

                    if (!EOF && (IS('<') || IS('<!--') || IS('@'))) {
                        nodes.push(wsText);
                    } else {
                        ROLLBACK(mark);
                        break;
                    }
                }
            }

            return new AST.HtmlExpression(nodes);
        }

        function htmlElement() {
            if (NOT('<')) ERR("not at start of html element");

            var beginTag = "",
                directives = [],
                content = [],
                endTag = "",
                hasContent = true;

            beginTag += TOK, NEXT();

            // scan for attributes until end of opening tag
            while (!EOF && NOT('>') && NOT('/>')) {
                if (IS('@')) {
                    directives.push(directive());
                } else {
                    beginTag += TOK, NEXT();
                }
            }

            if (EOF) ERR("unterminated start node");

            hasContent = IS('>');

            beginTag += TOK, NEXT();

            if (hasContent) {
                while (!EOF && NOT('</')) {
                    if (IS('<')) {
                        content.push(htmlElement());
                    } else if (IS('@')) {
                        content.push(codeInsert());
                    } else if (IS('<!--')) {
                        content.push(htmlComment());
                    } else {
                        content.push(htmlText());
                    }
                }

                if (EOF) ERR("element missing close tag");

                while (!EOF && NOT('>')) {
                    endTag += TOK, NEXT();
                }

                if (EOF) ERR("eof while looking for element close tag");

                endTag += TOK, NEXT();
            }

            return new AST.HtmlElement(beginTag, directives, content, endTag);
        }

        function htmlText() {
            var text = "";

            while (!EOF && NOT('<') && NOT('<!--') && NOT('@') && NOT('</')) {
                text += TOK, NEXT();
            }

            return new AST.HtmlText(text);
        }

        function htmlWhitespaceText() {
            var text = "";

            while (!EOF && WS()) {
                text += TOK, NEXT();
            }

            return new AST.HtmlText(text);
        }

        function htmlComment() {
            if (NOT('<!--')) ERR("not in HTML comment");

            var text = "";

            while (!EOF && NOT('-->')) {
                text += TOK, NEXT();
            }

            if (EOF) ERR("unterminated html comment");

            text += TOK, NEXT();

            return new AST.HtmlComment(text);
        }

        function codeInsert() {
            if (NOT('@')) ERR("not at start of code insert");

            NEXT();

            return new AST.CodeInsert(embeddedCode());
        }

        function directive() {
            if (NOT('@')) ERR("not at start of directive");

            NEXT();

            var name,
                left,
                segment,
                segments;

            if (name = SPLIT(rx.attrStyleDirective)) {
                left = name.split(":");

                SPLIT(rx.attrStyleEquals);

                return new AST.AttrStyleDirective(left, embeddedCode());
            } else {
                name = SPLIT(rx.directiveName);

                if (!name || NOT("(")) {
                    ERR("unrecognized directive");
                }

                segments = [];
                segment = balancedParens(segments, "");
                if (segment) segments.push(segment);

                return new AST.Directive(name, new AST.EmbeddedCode(segments));
            }
        }

        function embeddedCode() {
            var segments = [],
                text = "",
                part;

            // consume any initial operators and identifier (!foo)
            if (part = SPLIT(rx.embeddedCodePrefix)) {
                text += part;

                // consume any property chain (.bar.blech)
                if (part = SPLIT(rx.embeddedCodeInterim)) {
                    text += part;
                }
            }

            // consume any sets of balanced parentheses
            while (PARENS()) {
                text = balancedParens(segments, text);

                // consume interim property chain (.blech.gorp)
                if (part = SPLIT(rx.embeddedCodeInterim)) {
                    text += part;
                }
            }

            // consume any operator suffix (++, --)
            if (part = SPLIT(rx.embeddedCodeSuffix)) {
                text += part;
            }

            if (text) segments.push(new AST.CodeText(text));

            return new AST.EmbeddedCode(segments);
        }

        function balancedParens(segments, text) {
            var end = PARENS();

            if (end === undefined) ERR("not in parentheses");

            text += TOK, NEXT();

            while (!EOF && NOT(end)) {
                if (IS("'") || IS('"')) {
                    text += quotedString();
                } else if (IS('//')) {
                    text += codeComment();
                } else if (IS("<") || IS('<!--')) {
                    if (text) segments.push(new AST.CodeText(text));
                    text = "";
                    segments.push(htmlExpression());
                } else if (IS('(')) {
                    text = balancedParens(segments, text);
                } else {
                    text += TOK, NEXT();
                }
            }

            if (EOF) ERR("unterminated parentheses");

            text += TOK, NEXT();

            return text;
        }

        function quotedString() {
            if (NOT("'") && NOT('"')) ERR("not in quoted string");

            var quote,
                text;

            quote = text = TOK, NEXT();

            while (!EOF && (NOT(quote) || escapedEnd.test(text))) {
                text += TOK, NEXT();
            }

            if (EOF) ERR("unterminated string");

            text += TOK, NEXT();

            return text;
        }

        function codeComment() {
            if (NOT("//")) ERR("not in code comment");

            var text = "";

            while (!EOF && NOT('\n')) {
                text += TOK, NEXT();
            }

            // EOF within a code comment is ok, just means that the text ended with a comment
            if (!EOF) text += TOK, NEXT();

            return text;
        }

        // token stream ops
        function NEXT() {
            if (++i >= TOKS.length) EOF = true, TOK = null;
            else TOK = TOKS[i];
        }

        function ERR(msg) {
            throw new Error(msg);
        }

        function IS(t) {
            return TOK === t;
        }

        function NOT(t) {
            return TOK !== t;
        }

        function MATCH(rx) {
            return rx.test(TOK);
        }

        function MATCHES(rx) {
            return rx.exec(TOK);
        }

        function WS() {
            return !!MATCH(rx.ws);
        }

        function PARENS() {
            return parens[TOK];
        }

        function SPLIT(rx) {
            var m = MATCHES(rx);
            if (m && (m = m[0])) {
                TOK = TOK.substring(m.length);
                if (TOK === "") NEXT();
                return m;
            } else {
                return null;
            }
        }

        function MARK() {
            return {
                TOK: TOK,
                i:   i,
                EOF: EOF
            };
        }

        function ROLLBACK(mark) {
            TOK = mark.TOK;
            i   = mark.i;
            EOF = mark.EOF;
        }
    }

    AST.CodeTopLevel.prototype.genCode = function () {
        var code = "";

        for (var i = 0; i < this.segments.length; i++) {
            code += this.segments[i].genCode(code);
        }

        return code;
    };
    AST.CodeText.prototype.genCode = function (code) { return this.text; };
    AST.HtmlExpression.prototype.genCode = function (code) {
        var bindings = [],
            values = [],
            html = genHtmlForChildren(this.nodes, [], bindings, values);

        return templateExpression(html, bindings, values, codeIndent(code));
    };
    AST.HtmlElement.prototype.genHtml = function (path, bindings, values) {
        var html = "";

        for (var i = 0; i < this.beginTag.length; i++) {
            html += this.beginTag[i].genHtml(path, bindings, values);
        }

        html += genHtmlForChildren(this.content, path, bindings, values);

        html += this.endTag;

        return html;
    };
    AST.HtmlText.prototype.genHtml = function () { return this.text; };
    AST.HtmlComment.prototype.genHtml = function () { return this.text; };
    AST.CodeInsert.prototype.genHtml = function (path, bindings, values) {
        var code = "";

        for (var i = 0; i < this.segments.length; i++) {
            code += this.segments[i].genCode(code);
        }

        bindings.push(new t.Binding(t.Node, path.slice(0), 1, null, null));

        values.push(code);

        return "<!-- code -->";
    };

    function genHtmlForChildren(children, path, bindings, values) {
        var html = "";

        path.push(0);

        for (var i = 0; i < children.length; i++, path[path.length - 1]++) {
            html += children[i].genHtml(path, bindings, values);
        }

        path.pop();

        return html;
    }

    var templateId = Math.floor(Math.random() * Math.pow(2, 31));

    function templateExpression(html, bindings, values, indent) {
        var code = "",
            i, j, k, binding, value;

        code = "K.DOM.template.cache(" + templateId++ + ",\n";

        code += indent + "'" + html.replace(backslashes, "\\\\")
                                   .replace(singleQuotes, "\\'")
                                   .replace(newlines, "\\n\\\n") + "',\n";

        code += indent + "[\n";

        for (i = 0; i < bindings.length; i++) {
            code += indent + "    " + JSON.stringify(bindings[i]);
            code += bindings.length - i > 1 ? ",\n" : "\n";
        }

        code += indent + "])([\n";

        for (i = 0, j = 0; i < bindings.length; i++) {
            binding = bindings[i];
            for (k = 0; k < binding.valueCount; k++, j++) {
                value = values[j];
                if (binding.type === t.Event) {
                    code += indent + "    function ($event) { return " + value + "; }" + (values.length - j > 1 ? "," : "") + "\n";
                    //code += indent + "    ($event) => " + value + (values.length - j > 1 ? "," : "") + "\n";
                } else {
                    code += indent + "    function () { return " + value + "; }" + (values.length - j > 1 ? "," : "") + "\n";
                    //code += indent + "    () => " + value + (values.length - j > 1 ? "," : "") + "\n";
                }
            }
        }

        code += indent + "])";

        return code;
    }

    function codeIndent(code) {
        var m = rx.finalLine.exec(code);
        return m ? new Array(m[0].length + 1).join(" ") : "        ";
    }

    function add(str) {
        var src = K.DOM.src(str),
            script = document.createElement('script');

        script.type = 'text/javascript';
        script.src  = 'data:text/javascript;charset=utf-8,' + escape(src);

        document.body.appendChild(script);
    }

    // Browser shims: runs last to override earlier config as needed
    shimmed = detectBrowserShims();

    function detectBrowserShims() {
        var shimmed = false;

        // add base shim methods that visit AST
        AST.CodeTopLevel.prototype.shim = function (ctx) { shimSiblings(this, this.segments, ctx); };
        AST.HtmlExpression.prototype.shim = function (ctx) { shimSiblings(this, this.nodes, ctx); };
        AST.HtmlElement.prototype.shim  = function (ctx) { shimSiblings(this, this.content, ctx); };
        AST.CodeInsert.prototype.shim    = function (ctx) { shimSiblings(this, this.segments, ctx) };
        AST.CodeText.prototype.shim     =
        AST.HtmlText.prototype.shim     =
        AST.HtmlComment.prototype.shim  = function (ctx) {};

        if (!browserPreservesWhitespaceTextNodes())
            addFEFFtoWhitespaceTextNodes();

        if (!browserPreservesInitialComments())
            insertTextNodeBeforeInitialComments();

        return shimmed;

        // IE <9 will removes text nodes that just contain whitespace in certain situations.
        // Solution is to add a zero-width non-breaking space (entity &#xfeff) to the nodes.
        function browserPreservesWhitespaceTextNodes() {
            var ul = document.createElement("ul");
            ul.innerHTML = "    <li></li>";
            return ul.childNodes.length === 2;
        }

        function addFEFFtoWhitespaceTextNodes() {
            shim(AST.HtmlText, function (ctx) {
                if (ws.test(this.text) && !(ctx.parent instanceof AST.HtmlAttr)) {
                    this.text = '&#xfeff;' + this.text;
                }
            });
        }

        // IE <9 will remove comments when they're the first child of certain elements
        // Solution is to prepend a non-whitespace text node, using the &#xfeff trick.
        function browserPreservesInitialComments() {
            var ul = document.createElement("ul");
            ul.innerHTML = "<!-- --><li></li>";
            return ul.childNodes.length === 2;
        }

        function insertTextNodeBeforeInitialComments() {
            shim(AST.HtmlComment, function (ctx) {
                if (ctx.index === 0) {
                    insertBefore(new AST.HtmlText('&#xfeff;'), ctx);
                }
            })
        }

        function shimSiblings(parent, siblings, prevCtx) {
            var ctx = { index: 0, parent: parent, sibings: siblings }
            for (; ctx.index < siblings.length; ctx.index++) {
                siblings[ctx.index].shim(ctx);
            }
        }

        function shim(node, fn) {
            shimmed = true;
            var oldShim = node.prototype.shim;
            node.prototype.shim = function (ctx) { fn.call(this, ctx); oldShim.call(this, ctx); };
        }

        function insertBefore(node, ctx) {
            ctx.siblings.splice(ctx.index, 0, node);
            node.shim(ctx);
            ctx.index++;
        }

        function insertAfter(node, ctx) {
            ctx.siblins.splice(ctx.index + 1, 0, node);
        }
    }
})(K);
