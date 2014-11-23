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
    /// @
    /// = (followed by \s*[^"'])
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
    /// misc (any string not containing one of the above)

    // pre-compiled regular expressions
    var rx = {
        tokens             : /<\/?(?=\w)|\/?>|<!--|-->|@|=|\)|\(|\[|\]|\{|\}|"|'|\/\/|\n|(?:[^<>@=\/@=()[\]{}"'\n-]|(?!-->)-|\/(?![>/])|(?!<\/?\w|<!--)<\/?)+/g,
        propertyLeftSide   : /\s(\S+)\s*=\s*$/,
        embeddedCodePrefix : /^[+\-!~]*[a-zA-Z_$][a-zA-Z_$0-9]*/, // prefix unary operators + identifier
        embeddedCodeInterim: /^(?:\.[a-zA-Z_$][a-zA-Z_$0-9]+)+/, // property chain, like .bar.blech
        embeddedCodeSuffix : /^\+\+|--/, // suffix unary operators
        directiveName      : /^[a-zA-Z_$][a-zA-Z_$0-9]*(:[^\s:=]*)*/, // like "foo:bar:blech"
        stringEscapedEnd   : /[^\\](\\\\)*\\$/, // ending in odd number of escape slashes = next char of string escaped
        eventProperty      : /^on/,
        ws                 : /^\s*$/,
        leadingWs          : /^\s+/,
        tagTrailingWs      : /\s+(?=\/?>$)/,
        emptyLines         : /\n\s+(?=\n)/g,
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
            this.segments = segments; // [ CodeText | HtmlLiteral ]
        },
        CodeText: function (text) {
            this.text = text; // string
        },
        EmbeddedCode: function (segments) {
            this.segments = segments; // [ CodeText | HtmlLiteral ]
        },
        HtmlLiteral: function(col, nodes) {
            this.col = col; // integer
            this.nodes = nodes; // [ HtmlElement | HtmlComment | HtmlText(ws only) | HtmlInsert ]
        },
        HtmlElement: function(beginTag, properties, directives, content, endTag) {
            this.beginTag = beginTag; // string
            this.properties = properties; // [ Property ]
            this.directives = directives; // [ Directive | AttrStyleDirective ]
            this.content = content; // [ HtmlElement | HtmlComment | HtmlText | HtmlInsert ]
            this.endTag = endTag; // string | null
        },
        HtmlText: function (text) {
            this.text = text; // string
        },
        HtmlComment: function (text) {
            this.text = text; // string
        },
        HtmlInsert: function (col, code) {
            this.col = col; // integer
            this.code = code; // EmbeddedCode
        },
        Property: function (name, code) {
            this.name = name; // string
            this.code = code; // EmbeddedCode
        },
        Directive: function (name, code) {
            this.name = name; // string
            this.code = code; // EmbeddedCode
        },
        AttrStyleDirective: function (name, params, code) {
            this.name = name; // string
            this.params = params; // [ string ]
            this.code = code; // EmbeddedCode
        }
    };

    function parse(TOKS) {
        var i = 0,
            EOF = TOKS.length === 0,
            TOK = !EOF && TOKS[i],
            LINE = 0,
            COL = 0;

        return codeTopLevel();

        function codeTopLevel() {
            var segments = [],
                text = "";

            while (!EOF) {
                if (IS('<') || IS('<!--')) {
                    if (text) segments.push(new AST.CodeText(text));
                    text = "";
                    segments.push(htmlLiteral());
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

        function htmlLiteral() {
            if (NOT('<') && NOT('<!--')) ERR("not at start of html expression");

            var col = COL,
                nodes = [],
                mark,
                wsText;

            while (!EOF) {
                if (IS('<')) {
                    nodes.push(htmlElement());
                } else if (IS('<!--')) {
                    nodes.push(htmlComment());
                } else if (IS('@')) {
                    nodes.push(htmlInsert());
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

            return new AST.HtmlLiteral(col, nodes);
        }

        function htmlElement() {
            if (NOT('<')) ERR("not at start of html element");

            var beginTag = "",
                properties = [],
                directives = [],
                content = [],
                endTag = "",
                hasContent = true;

            beginTag += TOK, NEXT();

            // scan for attributes until end of opening tag
            while (!EOF && NOT('>') && NOT('/>')) {
                if (IS('@')) {
                    directives.push(directive());
                } else if (IS('=')) {
                    beginTag = property(beginTag, properties);
                } else {
                    beginTag += TOK, NEXT();
                }
            }

            if (EOF) ERR("unterminated start node");

            hasContent = IS('>');

            beginTag += TOK, NEXT();

            // clean up extra whitespace now that directives have been removed
            beginTag = beginTag.replace(rx.tagTrailingWs, "").replace(rx.emptyLines, "");

            if (hasContent) {
                while (!EOF && NOT('</')) {
                    if (IS('<')) {
                        content.push(htmlElement());
                    } else if (IS('@')) {
                        content.push(htmlInsert());
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

            return new AST.HtmlElement(beginTag, properties, directives, content, endTag);
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

        function htmlInsert() {
            if (NOT('@')) ERR("not at start of code insert");

            var col = COL;

            NEXT();

            return new AST.HtmlInsert(col, embeddedCode());
        }

        function property(beginTag, properties) {
            if(NOT('=')) ERR("not at equals sign of a property assignment");

            var match,
                name;

            beginTag += TOK, NEXT();

            if (WS()) beginTag += TOK, NEXT();

            match = rx.propertyLeftSide.exec(beginTag);

            // check if it's an attribute not a property assignment
            if (match && NOT('"') && NOT("'")) {
                beginTag = beginTag.substring(0, beginTag.length - match[0].length);

                name = match[1];

                SPLIT(rx.leadingWs);

                properties.push(new AST.Property(name, embeddedCode()));
            }

            return beginTag;
        }

        function directive() {
            if (NOT('@')) ERR("not at start of directive");

            NEXT();

            var name = SPLIT(rx.directiveName),
                segment,
                segments;

            if (!name) ERR("directive must have name");

            if (IS('(')) {
                segments = [];
                segment = balancedParens(segments, "");
                if (segment) segments.push(segment);

                return new AST.Directive(name, new AST.EmbeddedCode(segments));
            } else {
                if (WS()) NEXT();

                if (NOT('=')) ERR("unrecognized directive - must have form like @foo:bar = ... or @foo( ... )");

                NEXT(), SPLIT(rx.leadingWs);

                name = name.split(":");

                return new AST.AttrStyleDirective(name[0], name.slice(1), embeddedCode());
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

            if (segments.length === 0) ERR("not in embedded code");

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
                    segments.push(htmlLiteral());
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

            while (!EOF && (NOT(quote) || rx.stringEscapedEnd.test(text))) {
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
            if (TOK === "\n") LINE++, COL = 0;
            else if (TOK) COL += TOK.length;

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
                COL += m.length;
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
                EOF: EOF,
                LINE: LINE,
                COL: COL
            };
        }

        function ROLLBACK(mark) {
            TOK = mark.TOK;
            i   = mark.i;
            EOF = mark.EOF;
            LINE = mark.LINE;
            COL = mark.COL;
        }
    }

    // genCode
    AST.CodeTopLevel.prototype.genCode   =
    AST.EmbeddedCode.prototype.genCode   = function () { return concatResults(this.segments, 'genCode'); };
    AST.CodeText.prototype.genCode       = function () { return this.text; };
    var htmlLiteralId = Math.floor(Math.random() * Math.pow(2, 31));
    AST.HtmlLiteral.prototype.genCode = function () {
        var html = concatResults(this.nodes, 'genHtml'),
            nl = "\n" + indent(this.col),
            directives = this.nodes.length > 1 ? genChildDirectives(this.nodes, nl) : this.nodes[0].genDirectives(nl),
            code = "(K.DOM.parse.cache(" + htmlLiteralId++ + "," + nl + codeStr(html) + "))";

        if (directives) code = "(new K.DOM.Shell" + code + nl + directives + nl + ".node)";

        return code;
    };

    // genHtml
    AST.HtmlElement.prototype.genHtml = function() {
        return this.beginTag + concatResults(this.content, 'genHtml') + (this.endTag || "");
    };
    AST.HtmlComment.prototype.genHtml =
    AST.HtmlText.prototype.genHtml    = function () { return this.text; };
    AST.HtmlInsert.prototype.genHtml  = function () { return '<!-- insert -->'; };

    // genDirectives
    AST.HtmlElement.prototype.genDirectives = function (nl) {
        var childDirectives = genChildDirectives(this.content, nl),
            properties = concatResults(this.properties, 'genDirective', nl),
            directives = concatResults(this.directives, 'genDirective', nl);

        return childDirectives + (childDirectives && (properties || directives) ? nl : "")
            + properties + (properties && directives ? nl : "")
            + directives;
    };
    AST.HtmlComment.prototype.genDirectives =
    AST.HtmlText.prototype.genDirectives    = function (nl) { return null; };
    AST.HtmlInsert.prototype.genDirectives  = function (nl) {
        return new AST.AttrStyleDirective('insert', [], this.code).genDirective();
    }

    // genDirective
    AST.Property.prototype.genDirective = function () {
        var code = this.code.genCode();
        if (rx.eventProperty.test(this.name)) code = "function (__) { " + code + "; }";
        return ".property(" + codeStr(this.name) + ", function (__) { return __." + this.name + " = " + code + "; })";
    };
    AST.Directive.prototype.genDirective = function () {
        if (K.DOM.Shell.prototype[this.name] === undefined)
            throw new Error("Unrecognized directive @" + this.name);
        return "." + this.name + "(function (__) { __" + this.code.genCode() + "; })";
    };
    AST.AttrStyleDirective.prototype.genDirective = function () {
        var directive = K.DOM.Shell.prototype[this.name];
        if (directive === undefined)
            throw new Error("Unrecognized directive @" + this.name);

        var code = "." + this.name + "(function (__) { __(";

        for (var i = 0; i < this.params.length; i++)
            code += codeStr(this.params[i]) + ", ";

        code += directive.wrapCallback ? 'function (__) { ' + this.code.genCode() + '; }' :
                this.code.genCode();

        code += "); })";

        return code;
    };

    function genChildDirectives(childNodes, nl) {
        var indices = [],
            directives = [],
            cnl = nl + "    ",
            ccnl = cnl + "    ",
            directive,
            i,
            result = "";

        for (i = 0; i < childNodes.length; i++) {
            directive = childNodes[i].genDirectives(ccnl);
            if (directive) {
                indices.push(i);
                directives.push(directive);
            }
        }

        if (indices.length) {
            result += ".childNodes([" + indices.join(", ") + "], function (__) {" + cnl;
            for (i = 0; i < directives.length; i++) {
                if (i) result += cnl;
                result += "__[" + i + "]" + directives[i] + ";"
            }
            result += nl + "})";
        }

        return result;
    }

    function concatResults(children, method, sep) {
        var result = "", i;

        for (i = 0; i < children.length; i++) {
            if (i && sep) result += sep;
            result += children[i][method]();
        }

        return result;
    }

    function codeStr(str) {
        return "'" + str.replace(rx.backslashes, "\\\\")
                        .replace(rx.singleQuotes, "\\'")
                        .replace(rx.newlines, "\\\n")
                   + "'";
    }

    function indent(col) {
        return new Array(col + 1).join(" ");
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
        AST.HtmlLiteral.prototype.shim  = function (ctx) { shimSiblings(this, this.nodes, ctx); };
        AST.HtmlElement.prototype.shim  = function (ctx) { shimSiblings(this, this.content, ctx); };
        AST.HtmlInsert.prototype.shim   = function (ctx) { shimSiblings(this, this.segments, ctx) };
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
