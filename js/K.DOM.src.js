(function (K) {
    "use strict";
    
    K.DOM.src = src;

    // DEBUG
    K.DOM.tokenize = tokenize;
    K.DOM.parse = parse;

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
    /// )
    /// (
    /// =
    /// "
    /// '
    /// @
    /// misc (any string not containing one of the above)

    var matchTokens = /<\/?(?=\w)|\/?>|\)|\(|=|"|'|@|(?:[^<>\/()="'@]|\/(?!>)|<(?![\/\w])|<\/(?!\w))+/g;

    var propChain = /^[a-zA-Z_$][a-zA-Z_$0-9]*(?:\.[a-zA-Z_$][a-zA-Z_$0-9]+)*/,
        propTail = /^(?:\.[a-zA-Z_$][a-zA-Z_$0-9]+)+/,
        attributeName = /([a-zA-Z][a-zA-Z0-9\-]*)(\s*)$/,
        ws = /^\s*$/;
            
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
                this.nodes = nodes; // [ HtmlElement | TextNode(ws only) | CodeEmbed ]
            },
            HtmlElement: function(beginTag, content, endTag) {
                this.beginTag = beginTag; // [ HtmlText | HtmlAttr ]
                this.content = content; // [ HtmlElement | TextNode | CodeEmbed ]
                this.endTag = endTag; // HtmlText | null
            },
            HtmlText: function (text) {
                this.text = text; // string
            },
            HtmlAttr: function (name, eq, quote, value) {
                this.name = name; // string
                this.eq = eq; // string
                this.quote = quote; // string
                this.value = value; // [ HtmlText | CodeEmbed ]
            },
            CodeEmbed: function (segments) {
                this.segments = segments; // [ CodeText | HtmlEmbed ]
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
                if (IS('<')) {
                    if (text) segments.push(new AST.CodeText(text));
                    text = "";
                    segments.push(htmlEmbed());
                } else {
                    text += TOK, NEXT();
                }
            }

            if (text) segments.push(new AST.CodeText(text));

            return new AST.CodeTopLevel(segments);
        }

        function htmlEmbed() {
            if (NOT('<')) ERR("embed not at start of element");

            var nodes = [];

            while (!EOF) {
                if (IS('<'))
                    nodes.push(htmlElement());
                else if (IS('@'))
                    nodes.push(codeEmbed());
                else if (WS() && (PEEK('<') || PEEK('@')))
                    nodes.push(new AST.HtmlText(TOK))
                else break;
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
                    beginTag.push(htmlAttr(beginTag, text)); // don't add text to beginTag yet, as htmlAttr needs to munge it to find the attr name
                    text = "";
                } else text += TOK, NEXT();
            }

            if (EOF) ERR("unterminated start node");

            hasContent = IS('>');

            text += TOK, NEXT();

            beginTag.push(new AST.HtmlText(text));

            if (hasContent) {
                while (!EOF && NOT('</')) {
                    if (IS('<'))
                        content.push(htmlElement());
                    else if (IS('@'))
                        content.push(codeEmbed());
                    else
                        content.push(htmlText());
                }

                if (EOF) ERR("element missing end tag");

                while (!EOF && NOT('>')) {
                    endTag += TOK, NEXT();
                }

                if (EOF) ERR("eof within element end tag");

                endTag += TOK, NEXT();
            }

            return new AST.HtmlElement(beginTag, content, endTag);
        }

        function htmlText() {
            var text = "";

            while (!EOF && NOT('<') && NOT('@') && NOT('</')) {
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
                value = [];

            // shorten the preceding text by the length of the attribute name match
            text = text.substr(0, text.length - match[0].length);

            // if there's any previous text left, add it to the begin tag
            if (text) beginTag.push(new AST.HtmlText(text));
            text = "";

            eq += TOK, NEXT();
            while (!EOF && NOT('"') && NOT("'"))
                eq += TOK, NEXT();

            if (EOF) ERR("end of file looking for attribute value");

            quote = TOK, NEXT();

            while (!EOF && NOT(quote)) {
                if (IS('@')) {
                    if (text) {
                        value.push(new AST.HtmlText(text));
                        text = "";
                    }
                    value.push(codeEmbed());
                } else {
                    text += TOK, NEXT();
                }
            }

            if (EOF) ERR("unterminated quote in attribute value");

            NEXT();

            if (text) value.push(new AST.HtmlText(text));
            
            return new AST.HtmlAttr(name, eq, quote, value);
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
            if (match = MATCH(propChain)) {
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
                text += balancedParens(segments, text);

                // consume any terminal or interstitial property chain (@ ... ().blech)
                if (match = MATCH(propTail)) {
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
                if (IS("'") || IS('"')) text += quotedString();
                else if (IS("<")) {
                    if (text) segments.push(new AST.CodeText(text));
                    text = "";
                    segments.push(htmlEmbed());
                } else if (IS('(')) text = balancedParens(segments, text);
                else text += TOK, NEXT();
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

            while (!EOF && NOT(quote))
                text += TOK, NEXT();

            if (EOF) ERR("unterminated string");

            text += TOK, NEXT();

            return text;
        }

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
            return m.exec(TOK);
        }
        
        function WS() {
            return !!MATCH(ws);
        }
        
        function PEEK(t) {
            return i < TOKS.length - 1 && TOKS[i + 1] === t;
        }
    }

    function compile(t) {

        function TemplateExpression(expr) {
            var js = "",
                vals = expr.values,
                len = vals.length,
                val, i, j;

            js += "function (__tmpl) { \n";
            js += "\treturn __tmpl[" + expr.template.id + "]([\n";

            for (i = 0; i < len; i++) {
                val = vals[i];
                if (i) js += ",\n";
                js += "\t\tfunction () { return ";
                js += expr.template.locs[i] instanceof AST.AttrLocation
                      ? AttrValueExpression(val)
                      : ValueExpression(val);
                js += "}";
            }

            js += "\n\t]);\n";
            js += "}";

            return js;
        }

        function ValueExpression(val) {
            var js = "", i, len, seg;

            for (i = 0, len = val.segments.length; i < len; i++) {
                seg = val.segments[i];
                if (seg instanceof AST.CodeSegment) js += seg.segment;
                else if (seg instanceof AST.TemplateExpression) js += TemplateExpression(seg);
                else /* if (seg instanceof AST.ValueLiteral) */ throw new Error("Value literals not allowed in code segments");
            }

            return js;
        }

        function AttrValueExpression(val) {
            var js = "", i, len, seg;

            js += "[";

            for (i = 0, len = val.segments.length; i < len; i++) {
                seg = val.segments[i];
                if (i) js += ", ";
                if (seg instanceof AST.CodeSegment) js += seg.segment;
                else if (seg instanceof AST.TemplateExpression) throw new Error("Value literals not allowed in code segments");
                else /* if (seg instanceof AST.ValueLiteral) */ js += seg.quote + seg.literal + seg.quote;
            }

            js += "]";

            return js;
        }

    }
})(K);
