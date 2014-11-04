(function (K) {
    "use strict";

    K.DOM.src = src;

    // DEBUG
    K.DOM.tokenize = tokenize;
    K.DOM.parse = parse;

    var t = K.DOM.template;

    function src(str) {
        var toks = tokenize(str),
            ast = parse(toks),
            out = ast.genCode();

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
    /// =
    /// "
    /// '
    /// //
    /// \n
    /// @
    /// misc (any string not containing one of the above)

    var matchTokens = /<\/?(?=\w)|\/?>|<!--|-->|\)|\(|=|"|'|\/\/|\n|@|(?:[^<>\/()="'@\n-]|(?!-->)-|\/(?![>/])|(?!<\/?\w|<!--)<\/?)+/g;

    function tokenize(str) {
        var TOKS = str.match(matchTokens);

        // DEBUG
        //if (TOKS.join("").length != str.length)
        //    throw new Error("missing text from tokens!");

        return TOKS;
    }

    var AST = {
            CodeTopLevel: function (segments) {
                this.segments = segments; // [ CodeText | HtmlEmbed ]
            },
            CodeText: function (text) {
                this.text = text; // string
            },
            HtmlEmbed: function(nodes) {
                this.nodes = nodes; // [ HtmlElement | HtmlComment | HtmlText(ws only) | CodeEmbed ]
            },
            HtmlElement: function(beginTag, content, endTag) {
                this.beginTag = beginTag; // [ HtmlText | HtmlAttr ]
                this.content = content; // [ HtmlElement | HtmlComment | HtmlText | CodeEmbed ]
                this.endTag = endTag; // HtmlText | null
            },
            HtmlText: function (text) {
                this.text = text; // string
            },
            HtmlComment: function (text) {
                this.text = text; // string
            },
            HtmlAttr: function (name, eq, quote, value, hasCode) {
                this.name = name; // string
                this.eq = eq; // string
                this.quote = quote; // string
                this.value = value; // [ HtmlText | CodeEmbed ]
                this.hasCode = hasCode;
            },
            CodeEmbed: function (segments) {
                this.segments = segments; // [ CodeText | HtmlEmbed ]
            }
        };

    // pre-compile some regular expressions used during parsing
    var propChain = /^[a-zA-Z_$][a-zA-Z_$0-9]*(?:\.[a-zA-Z_$][a-zA-Z_$0-9]+)*/, // like foo.bar.blech
        propTail = /^(?:\.[a-zA-Z_$][a-zA-Z_$0-9]+)+/, // like .bar.blech
        attributeName = /([a-zA-Z][a-zA-Z0-9\-]*)(\s*)$/,
        escapedEnd = /[^\\](\\\\)*\\$/, // ending in odd number of escape slashes = next char escaped
        ws = /^\s*$/,
        startsWithOn = /^on/;

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
                    segments.push(htmlEmbed());
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

        function htmlEmbed() {
            if (NOT('<') && NOT('<!--')) ERR("not at start of html embed");

            var nodes = [],
                wsText,
                mark;

            while (!EOF) {
                if (IS('<')) {
                    nodes.push(htmlElement());
                } else if (IS('<!--')) {
                    nodes.push(htmlComment());
                } else if (IS('@')) {
                    nodes.push(codeEmbed());
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

            return new AST.HtmlEmbed(nodes);
        }

        function htmlElement() {
            if (NOT('<')) ERR("not at start of element");

            var beginTag = [],
                content = [],
                endTag = "",
                text = "",
                hasContent = true;

            text += TOK, NEXT();

            // scan for attributes until end of opening tag
            while (!EOF && NOT('>') && NOT('/>')) {
                if (IS('=')) {
                    // don't add text to beginTag here, as htmlAttr needs to munge it to find the attr name
                    beginTag.push(htmlAttr(beginTag, text));
                    text = "";
                } else {
                    text += TOK, NEXT();
                }
            }

            if (EOF) ERR("unterminated start node");

            hasContent = IS('>');

            text += TOK, NEXT();

            beginTag.push(new AST.HtmlText(text));

            if (hasContent) {
                while (!EOF && NOT('</')) {
                    if (IS('<')) {
                        content.push(htmlElement());
                    } else if (IS('@')) {
                        content.push(codeEmbed());
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

            return new AST.HtmlElement(beginTag, content, endTag);
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

        function htmlAttr(beginTag, text) {
            if (NOT('=')) ERR("not at equal sign of attribute");

            // parse the attribute name and type
            var match = text.match(attributeName);

            if (!match) ERR("could not identify attribute name");

            var name = match[1],
                eq = match[2],
                quote = "",
                value = [],
                hasCode = false;

            // shorten the preceding text by the length of the attribute name match
            text = text.substr(0, text.length - match[0].length);

            // if there's any previous text left, add it to the begin tag
            if (text) beginTag.push(new AST.HtmlText(text));
            text = "";

            // build equals phrase, including any whitespace around '='
            eq += TOK, NEXT();
            if (WS()) eq += TOK, NEXT();

            if (IS('"') || IS("'")) {
                quote = TOK, NEXT();

                while (!EOF && NOT(quote) && NOT('>')) {
                    if (IS('@')) {
                        hasCode = true;
                        if (text) {
                            value.push(new AST.HtmlText(text));
                            text = "";
                        }
                        value.push(codeEmbed());
                    } else {
                        text += TOK, NEXT();
                    }
                }

                if (EOF || IS('>')) ERR("unterminated quote in attribute value");

                // skip closing quote
                NEXT();
            } else if (IS('@')) {
                hasCode = true;
                value.push(codeEmbed());
            } else {
                ERR("attribute does not have value");
            }

            if (text) value.push(new AST.HtmlText(text));

            return new AST.HtmlAttr(name, eq, quote, value, hasCode);
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

        function codeEmbed() {
            if (NOT("@")) ERR("not at start of code embed");

            NEXT();

            var segments = [],
                text = "",
                match = null,
                props = null,
                ended = false;

            // consume any initial property chain (@foo.bar.blech)
            if (match = MATCHES(propChain)) {
                props = match[0];
                if (props.length === TOK.length) {
                    text += TOK, NEXT();
                } else {
                    // split the token
                    text += props;
                    TOK = TOK.substring(props.length);
                    ended = true;
                }
            }

            // consume any sets of ballanced parentheses
            while (!ended && IS("(")) {
                text = balancedParens(segments, text);

                // consume any terminal or interstitial property chain (@ ... ().blech.gorp)
                if (match = MATCHES(propTail)) {
                    props = match[0];
                    if (props.length === TOK.length) {
                        text += TOK, NEXT();
                    } else {
                        // split the token
                        text += props;
                        TOK = TOK.substring(props.length);
                        ended = true;
                    }
                }
            }

            if (text) segments.push(new AST.CodeText(text));

            return new AST.CodeEmbed(segments);
        }

        function balancedParens(segments, text) {
            if (NOT("(")) ERR("not in parentheses");

            text += TOK, NEXT();

            while (!EOF && NOT(")")) {
                if (IS("'") || IS('"')) {
                    text += quotedString();
                } else if (IS('//')) {
                    text += codeComment();
                } else if (IS("<") || IS('<!--')) {
                    if (text) segments.push(new AST.CodeText(text));
                    text = "";
                    segments.push(htmlEmbed());
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

        function MATCH(m) {
            return m.test(TOK);
        }

        function MATCHES(m) {
            return m.exec(TOK);
        }

        function WS() {
            return !!MATCH(ws);
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
    AST.HtmlEmbed.prototype.genCode = function (code) {
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
    AST.HtmlAttr.prototype.genHtml = function (path, bindings, values) {
        var html = "",
            attrValues = [],
            i,
            value,
            valueCount,
            event;

        if (this.hasCode) {
            if (startsWithOn.test(this.name)) {
                if (this.value.length > 1)
                    throw new Error("Event binding must be a single code value");

                event = this.name.substring(2);

                bindings.push(new t.Binding(t.Event, path.slice(0), 1, event, null));

                this.value[0].genHtml(path, [], values);

            } else if (this.name === 'name') {
                if (this.value.length == 1 && this.value[0] instanceof AST.CodeEmbed) {
                    event = null;
                    value = this.value[0];
                } else if (this.value.length == 2 && this.value[0] instanceof AST.HtmlText && this.value[1] instanceof AST.CodeEmbed) {
                    event = this.value[0].text;
                    value = this.value[1];
                } else {
                    throw new Error("Control binding must be either a single code value or an event specifier followed by a code value");
                }

                bindings.push(new t.Binding(t.Control, path.slice(0), 1, event, null));

                value.genHtml(path, [], values);

            } else {
                valueCount = 0;
                for (i = 0; i < this.value.length; i++) {
                    value = this.value[i];

                    if (value instanceof AST.HtmlText) {
                        attrValues.push(value.text);
                    } else {
                        valueCount++;
                        attrValues.push(null);
                        value.genHtml(path, [], values);
                    }
                }

                bindings.push(new t.Binding(t.Attr, path.slice(0), valueCount, this.name, attrValues));
            }
        } else {
            if (this.value.length > 1 || !(this.value[0] instanceof AST.HtmlText))
                throw new Error("Non-code attributes expected to have a single text value");

            html = this.name + this.eq + (this.quote || "") + (this.value.length ? this.value[0].text : "") + (this.quote || "");
        }

        return html;
    };
    AST.HtmlText.prototype.genHtml = function () { return this.text; };
    AST.HtmlComment.prototype.genHtml = function () { return this.text; };
    AST.CodeEmbed.prototype.genHtml = function (path, bindings, values) {
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

    var templateId = Math.floor(Math.random() * Math.pow(2, 31)),
        backslashes = /\\/g,
        newlines = /\n/g,
        singleQuotes = /'/g;

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
                    //code += indent + "    function ($event) { return " + value + "; }" + (jlen - j > 1 ? "," : "") + "\n";
                    code += indent + "    ($event) => " + value + (values.length - j > 1 ? "," : "") + "\n";
                } else {
                    //code += indent + "    function () { return " + value + "; }" + (jlen - j > 1 ? "," : "") + "\n";
                    code += indent + "    () => " + value + (values.length - j > 1 ? "," : "") + "\n";
                }
            }
        }

        code += indent + "])";

        return code;
    }

    var indentLength = /[^\n]*$/;

    function codeIndent(code) {
        var indentMatch = indentLength.exec(code);
        return indentMatch ? new Array(indentMatch[0].length + 1).join(" ") : "        ";
    }
})(K);
