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
            out = compile(ast);

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

    function Template(name, html, splits, locations) {
        this.name = name;
        this.html = html;
        this.splits = splits;
        this.locations = locations;
    }

    AST.CodeTopLevel.prototype.genCode = function (templates) {
        var code = "", i, len;
        for (i = 0, len = this.segments.length; i < len; i++)
            code += this.segments[i].genCode(templates, code);
        return code;
    };
    AST.CodeText.prototype.genCode = function (templates, code) { return this.text; };
    AST.HtmlEmbed.prototype.genCode = function (templates, code) {
        var html = "",
            splits = [],
            locations = [],
            values = [],
            template;

        html = genTemplatesForChildren(this.nodes, templates, [], splits, locations, values);

        template = new Template(templateName(html), html, splits, locations);

        templates.push(template);

        return templateInvocation(template, values, code);
    };
    AST.HtmlElement.prototype.genTemplates = function (templates, path, splits, locations, values) {
        var html = "",
            i, len;

        for (i = 0, len = this.beginTag.length; i < len; i++) {
            html += this.beginTag[i].genTemplates(templates, path, splits, locations, values);
        }

        html += genTemplatesForChildren(this.content, templates, path, splits, locations, values);

        html += this.endTag;

        return html;
    };
    AST.HtmlAttr.prototype.genTemplates = function (templates, path, splits, locations, values) {
        var html = "",
            attrValues = [],
            i, len = this.value.length,
            value,
            valCount,
            event;

        if (this.hasCode) {
            if (startsWithOn.test(this.name)) {
                if (this.value.length > 1)
                    throw new Error("Event binding must be a single code value");

                event = this.name.substring(2);

                locations.push(new t.Location(t.Event, path.slice(0), 1, event, null));

                this.value[0].genTemplates(templates, path, splits, [], values);

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

                locations.push(new t.Location(t.Control, path.slice(0), 1, event, null));

                value.genTemplates(templates, path, splits, [], values);

            } else {
                valCount = 0;
                for (i = 0; i < len; i++) {
                    value = this.value[i];

                    if (value instanceof AST.HtmlText) {
                        attrValues.push(value.text);
                    } else {
                        valCount++;
                        attrValues.push(null);
                        value.genTemplates(templates, path, splits, [], values);
                    }
                }

                locations.push(new t.Location(t.Attr, path.slice(0), valCount, this.name, attrValues));
            }
        } else {
            if (this.value.length > 1)
                throw new Error("Non-code attributes expected to have a single text value");

            html = this.name + this.eq + (this.quote || "") + this.value[0].text + (this.quote || "");
        }

        return html;
    };
    AST.HtmlText.prototype.genTemplates = function () { return this.text; };
    AST.HtmlComment.prototype.genTemplates = function () { return this.text; };
    AST.CodeEmbed.prototype.genTemplates = function (templates, path, splits, locations, values) {
        var code = "", i, len;

        for (i = 0, len = this.segments.length; i < len; i++) {
            code += this.segments[i].genCode(templates, code);
        }

        locations.push(new t.Location(t.Node, path.slice(0), 1, null, null));

        values.push(code);

        return "";
    };

    function genTemplatesForChildren(children, templates, path, splits, locations, values) {
        var html = "",
            split = null,
            i, len, node;

        path.push(0);

        for (i = 0, len = children.length; i < len; i++) {
            // node is one of: HtmlElement, HtmlComment, HtmlText, CodeEmbed
            node = children[i];

            html += node.genTemplates(templates, path, splits, locations, values);

            if (split !== null) {
                if (node instanceof AST.HtmlElement || node instanceof AST.HtmlComment) {
                    if (split.splits.length > 1) splits.push(split);
                    split = null;
                } else if (node instanceof AST.HtmlText) {
                    split.splits.push(node.text);
                }
            } else {
                if (node instanceof AST.HtmlText) {
                    split = { path: path.slice(0), splits: [ node.text ]};
                }
            }

            if (!(node instanceof AST.CodeEmbed)) path[path.length - 1]++;
        }

        path.pop();

        if (split && split.splits.length > 1) splits.push(split);

        return html;
    }

    var leadingChars = /(?:\w[^\w]*){1,16}/,
        nonWord = /[^\w]+/g,
        templateCount = 1;

    function templateName(html) {
        // get first 20 word characters from html
        var name = "__tmpl_",
            match = leadingChars.exec(html),
            chars = match ? match[0].replace(nonWord, '_') : "",
            name = "__tmpl_" + chars + templateCount++;

        return name;
    }

    var indentLength = /[^\n]*$/;

    function templateInvocation(template, values, prevCode) {
        var code = "",
            indentMatch = indentLength.exec(prevCode),
            indent = indentMatch ? new Array(indentMatch[0].length).join(" ") : "        ",
            i, j, k, len, jlen, klen, loc, value;

        code = template.name + "([\n";

        for (i = 0, j = 0, len = template.locations.length, jlen = values.length; i < len; i++) {
            loc = template.locations[i];
            for (k = 0, klen = loc.valCount; k < klen; k++, j++) {
                value = values[j];
                if (loc.type === t.Event) {
                    //code += indent + "    function ($event) { return " + value + "; }" + (jlen - j > 1 ? "," : "") + "\n";
                    code += indent + "    ($event) => " + value + (jlen - j > 1 ? "," : "") + "\n";
                } else {
                    //code += indent + "    function () { return " + value + "; }" + (jlen - j > 1 ? "," : "") + "\n";
                    code += indent + "    () => " + value + (jlen - j > 1 ? "," : "") + "\n";
                }
            }
        }
        for (i = 0, len = values.length; i < len; i++) {
        }

        code += indent + "])";

        return code;
    }

    var backslashes = /\\/g,
        newlines = /\n/g,
        singleQuotes = /'/g;

    function templateDefinition(template) {
        return "var " + template.name + " = K.DOM.template(\n"
            + "\t'" + template.html.replace(backslashes, "\\\\")
                                   .replace(singleQuotes, "\\'")
                                   .replace(newlines, "\\n' + \n'") + "',\n"
            + "\t" + JSON.stringify(template.splits, null, '\t') + ",\n"
            + "\t" + JSON.stringify(template.locations, null, '\t') + ");\n";
    }

    function compile(ast) {
        var templates = [],
            body = ast.genCode(templates),
            code = "",
            i, len;

        code += "\"use strict\";\n";

        for (i = 0, len = templates.length; i < len; i++) {
            code += templateDefinition(templates[i]);
        }

        code += body;

        return code;
    }
})(K);
