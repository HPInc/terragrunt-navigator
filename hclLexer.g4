lexer grammar hclLexer;


@members {
    this.heredocStartIdentifier = null;
    this.setHeredocIdentifier = function() {
        let start = 0;
        let strArr = [];
        let nextChar = String.fromCharCode(this._input.LA(start));
        while (this._input.LA(start) !== -1 && nextChar !== '\r' && nextChar !== '\n') {
            strArr.push(nextChar);
            start++;
            nextChar = String.fromCharCode(this._input.LA(start));
        }

        if (nextChar !== -1) {
            this.heredocStartIdentifier = strArr.join('');
            return true;
        }
        return false;
    };

    this.isHeredocIdentifier = function() {
        let strArr = [];
        for (let ii = 0; ii < this.heredocStartIdentifier.length && this._input.LA(ii) != -1; ii++) {
            strArr.push(String.fromCharCode(this._input.LA(ii)));
        }
        return strArr.join('') === this.heredocStartIdentifier;
    };

    this.isNewLine = function() {
        return this._input.LA(1) === '\n'.charCodeAt(0);
    }
}

QUOTE: '"';
PLUS: '+';
MINUS: '-';
STAR: '*';
SLASH: '/';
PERCENT: '%';
NOT: '!';
AND: '&&';
OR: '||';
EQUAL: '==';
NOT_EQUAL: '!=';
LESS_THAN: '<';
GREATER_THAN: '>';
LESS_EQUAL: '<=';
GREATER_EQUAL: '>=';
QUESTION: '?';
COLON: ':';
ARROW: '=>';
ASSIGN: '=';
LCURL: '{';
RCURL: '}';
LBRACK: '[';
RBRACK: ']';
LPAREN: '(';
RPAREN: ')';
DOT: '.';
COMMA: ',';
ELLIPSIS: '...';
DOLLAR_LCURL: '${';
PERCENT_LCURL: '%{';
HEREDOC: '<<';
HEREDOC_DEDENT: '<<-';
TRUE: 'true';
FALSE: 'false';
NULL: 'null';
FOR: 'for';
IN: 'in';
IF: 'if';

IDENTIFIER
    : [a-zA-Z_][a-zA-Z_0-9-]*
    ;

NUMBER
    : DECIMAL+ (DOT DECIMAL+)? (EXPMARK DECIMAL+)?
    ;

QUOTED_TEMPLATE
    : QUOTE ~[\r\n]*? (DOLLAR_LCURL ~[\r\n]*? RCURL)+ ~[\r\n]*? QUOTE
    ;

STRING_LITERAL
    : QUOTE (~[\r\n"])* QUOTE
    ;

NEWLINE
    : '\r'? '\n'
    ;

fragment DECIMAL
    : [0-9]
    ;

fragment EXPMARK
    : [eE] [+-]?
    ;

fragment HEX
    : [0-9a-fA-F]
    ;

WS
    : [ \t\r\n]+ -> skip
    ;

COMMENT
    : ('#' ~[\r\n]* | '//' ~[\r\n]* | '/*' .*? '*/') -> channel(HIDDEN)
    ;

HEREDOC_START
    : (HEREDOC | HEREDOC_DEDENT) { this.setHeredocIdentifier(); }? IDENTIFIER NEWLINE -> pushMode(HEREDOC_MODE)
    ;

mode HEREDOC_MODE;
    HEREDOC_CONTENT
        : { !this.isHeredocIdentifier() }? ~[\r\n]*? NEWLINE
        ;

    HEREDOC_END
        : { this.isHeredocIdentifier() }? IDENTIFIER NEWLINE -> popMode
        ;
