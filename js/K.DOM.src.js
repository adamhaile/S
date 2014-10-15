(function (K) {
    K.DOM.src = src;

    function src(str) {
        var toks = tokenize(str),
            ast = parse(toks),
            out = compile(ast);

        return out;
    }

    /// tokens:
    /// <
    /// </
    /// >
    /// />
    /// =
    /// )
    /// (
    /// "
    /// '
    /// @
    /// <word>
    /// misc (any string not containing one of the above)

    var matchTokens = /<\/|<|>|\/>|=|\)|\(|"|'|@|[a-zA-Z0-9\-]+|(?:[^<>=()@\/"'a-zA-Z0-9\-]|\/(?!>))+/g;

    function tokenize(str) {
        return str.match(matchTokens);
    }

    var AST = {
            Template: function Template(html, splits, locs) {
                this.id = templateId++;
                this.html = html;
                this.textSplits = splits;
                this.locs = locs;
            },
            AttrLocation: function AttrLocation(path, attr) {
                this.path = path;
                this.attr = attr;
            },
            EventLocation: function EventLocation(path, event) {
                this.path = path;
                this.event = event;
            },
            ControlLocation: function ControlLocation(path) {
                this.path = path;
            },
            NodeLocation: function NodeLocation(path) {
                this.path = path;
            },
            TextSplitLocation: function TextSplitLocation(path, splits) {
                this.path = path;
                this.splits = splits;
            },
            TemplateExpression: function TemplateExpression(template, values) {
                if (template.locs.length !== vaues.length)
                    ERR("template expressions must have an equal number of locations and values");
                this.template = template;
                this.values = values;
            },
            ValueExpression: function ValueExpression(segments) {
                this.segments = segments;
            },
            CodeSegment: function CodeSegment(segment) {
                this.segment = segment;
            },
            ValueLiteral: function ValueLiteral(quote, literal) {
                this.quote = quote;
                this.literal = literal;
            }
        },
        templateId = 1;

    function parse(toks) {
        var i = 0,
            eof = toks.length === 0,
            tok = toks[i];

        return template();

        function template() {
            var html = "",
                splits = [],
                locs = [],
                values = [];

            children(html, splits, locs, values, []);

            return new AST.TemplateExpression(new AST.Template(html, splits, locs), values);
        }

        function children(html, splits, locs, values, path) {
            path = path.concat([0]);
            for (; !eof && tok !== "</"; path[path.length - 1]++) {
                if (tok === "<") node(html, splits, locs, values, path);
                else text(html, splits, locs, values, path);
            }
        }

        function node(html, splits, locs, values, path) {
            if (tok !== "<") ERR("not in a node");

            EAT(html);

            // scan for attributes until end of opening tag
            var attrstart = 0
            while (!eof && tok !== ">" && tok != "/>") {
                if (tok === "@") attr(attrstart, html, splits, locs, values, path);
                else {
                    if (tok === "=") attrstart = i;
                    EAT(html);
                }
            }

            if (eof) ERR("unterminated start node");

            if (tok === ">") {
                EAT(html);

                children(html, splits, locs, values, path);

                if (eof) ERR("eof before end of node");

                EAT(html); // </
                EAT(html); // tag
                EAT(html); // <
            } else if (tok === "/>") {
                EAT(html);
            }
        }

        function text(html, _splits, locs, values, path) {
            var split = "",
                splits = [],
                orig = null;

            while (!eof && tok !== "<" && tok !== "</") {
                if (tok === "@") {
                    if (split) {
                        if (!orig) orig = path.slice();
                        path[path.length - 1]++;
                        splits.push(split);
                        split = "";
                    }
                    locs.push(new AST.NodeLocation(path.slice()));
                    values.push(code());
                } else {
                    split += tok;
                    EAT(html);
                }
            }

            if (splits.length) {
                if (split) splits.push(split);
                _splits.push(new AST.TextSplitLocation(orig, splits));
            }

        }

        function attr(eq, html, splits, locs, values, path) {
            if (tok !== "@") ERR("not at start of code segment");

            // parse the attribute name and type
            if (eq <= 0) ERR("attribute equal sign not before name");
            var match = toks[eq - 1].match(/(on)?(\w*)\s*$/),
                isEvent = !!match[1],
                name = match[2],
                isControl = name === "name";

            if (!name) ERR("no attribute name specified");

            // start parsing the value
            var segments = [],
                segment = "",
                quo = null,
                c,
                j;

            if (i - eq === 1) {
                // no quotes, just name=@value: consume all code
                c = code();

                if (c.segments.length > 1) ERR("embedded templates not allowed inside attribute values");

                segments.push(c);
            } else {
                // quoted case, consume until matching quote

                // find the quote character
                quo = toks[j = eq + 1];

                // see if there was space before the quote character
                if (/^\s*$/.test(quo)) quo = toks[++j];

                // confirm that there was a quote character - if not, then the '@' was somewhere in space
                if (quo !== '"' && quo !== "'") ERR("code segment not in attribute value (missing quotation marks around value?)");

                // add any text prior to @ to an initial segment
                for (j++; j < i && toks[j] !== quo; j++) segment += toks[j];

                // confirm that the attribute value didn't end before we reached the '@'
                if (j !== i) ERR("code segment not in attribute value");

                // add the text to segments
                if (segment.length > 0) segments.push(new AST.ValueLiteral(quo, segment));

                // loop though alternating code and text segments
                while (!eof && tok === '@') {
                    c = code();

                    if (c.segments.length > 1) ERR("embedded templates not allowed inside attribute values");

                    segments.push(c.segments[0]);

                    segment = [];
                    while (!eof && tok !== quo && tok !== '@') {
                        segment += tok;
                        EAT(html);
                    }
                    if (segment.length > 0) segments.push(new AST.ValueLiteral(quo, segment));
                }

                if (eof || tok !== quo) ERR("unterminated attribute value");

                EAT(html);
            }

            path = path.slice(0);

            if (isEvent) {
                if (segments.length > 1) ERR("extra text found in event binding");
                locs.push(new AST.EventLocation(path, name));
            } else if (isControl) {
                if (segments.length > 1) ERR("extra text found in control name binding");
                locs.push(new AST.ControlLocation(path));
            } else {
                locs.push(new AST.AttrLocation(path, name));
            }

            values.push(new AST.ValueExpression(segments));
        }

        function code() {
            if (tok !== "@") ERR("not in code");

            SKIP();

            var segments = [],
                segment = "",
                match = null,
                props = null,
                ended = false;

            // consume any initial property chain (@foo.bar.blech)
            if (match = tok.match(/^\w+(?:\.\w+)*/)) {
                props = match[0];
                if (props.length === tok.length) {
                    EAT(segment);
                } else {
                    // split the token
                    segment += props;
                    tok = tok.substring(props.length);
                    ended = true;
                }
            }

            // consume any sets of ballanced parentheses
            while (!ended && tok === "(") {
                segment = parens(segments, segment);

                // consume any terminal or interstitial property chain (@ ... ().blech)
                if (match = tok.match(/^(?:\.\w+)+/)) {
                    props = match[0];
                    if (props.length === tok.length) {
                        EAT(segment);
                    } else {
                        // split the token
                        segment += props;
                        tok = tok.substring(props.length);
                        ended = true;
                    }
                }
            }

            if (segment.length) segments.push(new AST.CodeSegment(segment));

            return new AST.ValueExpression(segments);
        }

        function parens(segments, segment) {
            if (tok !== "(") ERR("not in parentheses");

            EAT(segment);

            while (!eof && tok !== ")") {
                if (tok === "'" || tok === '"') quoted(segment);
                else if (tok === "<") {
                    segments.push(new AST.CodeSegment(segment));
                    segments.push(itemplate());
                    segment = "";
                } else if (tok === '(') parens(segments, segment);
                else EAT(segment);
            }

            if (eof) ERR("unterminated parentheses");

            EAT(segment);

            return segment;
        }

        function itemplate() {
            if (tok !== "<") ERR("not at start of template");

            var html = "",
                splits = [],
                locs = [],
                values = [],
                path = [0];

            for (; !eof && tok === "<"; path[0]++) {
                node(html, splits, locs, values, path);
                if (/^\s+$/.test(tok) && toks[i+1] === "<") EAT(html);
            }

            return new AST.TemplateExpression(new AST.Template(html, splits, locs), values);
        }

        function quoted(segment) {
            if (tok !== "'" && tok !== '"') ERR("not in quoted string");

            var quo = tok;

            while (!eof && tok != quo) EAT(segment);

            if (eof) ERR("unterminated string");
        }

        function EAT(acc) {
            if (++i >= toks.length) eof = true, tok = null;
            else acc += tok, tok = toks[i];
        }

        function SKIP() {
            if (++i >= toks.length) eof = true, tok = null;
            else tok = toks[i];
        }

        function ERR(msg) {
            throw new Error(msg);
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
