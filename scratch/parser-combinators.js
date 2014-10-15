

var FAIL$ = {};

var children = many$( or$( node, text ) ),
    node     = seq$( LT, attrs, or$( seq$( SLGT, r$())
                                     seq$( GT, children, LTSL, TEXT, GT)),
    text     = many1$( or$( many1$( not$( AT, LT, LTSL ) ),
                            seq$( AT, expr ) ),
    qstring  = or$( seq$( SQUO, many$( not$( SQUO ) ), SQUO ),
                    seq$( DQUO, many$( not$( DQUO ) ), DQUO ),
    itmpl    = seq$( node, many$( /\s+/, node ) ),
    parens_  = ref$(),
    parens   = seq$( LP, many$( or$( qstring, not$(LP, RP, LT), itmpl, parens_)), RP ),
    expr     = seq$( opt$( /^\w+(?:\.\w+)*$/ ), many$( seq$ ( parens, opt$( /(?:\.\w+)+/ ) ) ) );

function seq$() {
    var ps = arguments.splice(), len = ps.length;
    return res$(function seq$(s) {
        var i;
        for (s = lift$(s), i = 0; !(s isa FAIL) && i < len; i++)
            s = ps[i](s);
        return s;
    });
}

function or$() {
    var ps = arguments.splice(), len = ps.length;

    return res$(function or$(s) {
        var t, i;
        for (s = lift$(s), i = 0; i < len; i++) {
            t = ps[i](s);
            if (!(t isa FAIL)) break;
        }
        return t;
    });
}

function many$(p) {

}

function res$(p) { p.res$ = _res$; return p; }

function _res$(fn) {
    var p = this;
    return function res$(s) {
        var r = p(s);
        if (r isa FAIL) return r;
        else return fn(r);
    }
}

parens_(parens);

function TokenStream(str) {
    this.toks = matchTokens.exec(str);
    this.i = 0;
    this.cur = this.toks[0];
    this.eof = false;
    this.seek(0);
}

TokenStream.prototype.seek = function(i) {
    var toks = this.toks,
        len = toks.length;

    if (i >= len) {
        this.i = len;
        this.cur = null;
        this.eof = true;
    } else {
        this.i = i;
        this.cur = toks[i];
        this.eof = false;
    }
}

TokenStream.prototype.move = function(n) {
    this.seek(this.i + n);
}

TokenStream.prototype.next = function() {
    this.move(1);
}

TokenStream.prototype.eat = function(acc) {
    acc.push(this.cur);
    this.next();
}
