grammar hcl;

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
TRUE: 'true';
FALSE: 'false';
NULL: 'null';

configFile
    : body EOF
    ;

body
    : (argument | block | oneLineBlock)*
    ;

block
    : IDENTIFIER (IDENTIFIER | STRING_LITERAL)* LCURL body RCURL
    ;

oneLineBlock
    : IDENTIFIER (IDENTIFIER | STRING_LITERAL)* LCURL argument? RCURL
    ;

argument
    : IDENTIFIER ASSIGN expression
    ;

expression
    : exprTerm
    | operation
    | conditional
    ;

exprTerm
    : literals
    | collectionValue
    | templateExpr
    | variableExpr
    | functionCall
    | forExpr
    | exprTerm index
    | exprTerm getAttr
//    | exprTerm splat
    | LPAREN expression RPAREN
    ;

literals
    : basicLiterals
    | boolean
    | interpolatedString
    | stringLiteral
    ;

basicLiterals
    : NUMBER
    | NULL
    ;

stringLiteral
    : STRING_LITERAL
    ;

collectionValue
    : tuple
    | object
    ;

tuple
    : LBRACK (expression ((COMMA |) expression)* COMMA?)? RBRACK
    ;

object
    : LCURL ((objectElement ((COMMA? |) objectElement)* COMMA?)?) RCURL
    ;

objectElement
    : (IDENTIFIER | expression) (ASSIGN | COLON) expression
    ;

index
    : LBRACK expression RBRACK
    ;


getAttr
    : (index | (DOT IDENTIFIER))+
    ;

interpolatedString
    : INTERPOLATED_STRING
    ;

operation
    : unaryOp
    | binaryOp
    ;

unaryOp
    :  unaryOperator (exprTerm|operation)
    ;

binaryOp
    : exprTerm binaryOperator (exprTerm|operation)
    ;

unaryOperator
    : PLUS
    | MINUS
    | NOT
    ;

binaryOperator
    : compareOperator
    | arithmeticOperator
    | logicOperator
    ;

compareOperator
    : EQUAL
    | NOT_EQUAL
    | LESS_THAN
    | GREATER_THAN
    | LESS_EQUAL
    | GREATER_EQUAL
    ;

arithmeticOperator
    : STAR
    | SLASH
    | PERCENT
    | PLUS
    | MINUS
    ;

logicOperator
    : AND
    | OR
    ;

boolean
    : TRUE
    | FALSE
    ;

// TODO: Add support for nested conditional
conditional
    :  (exprTerm | operation) QUESTION expression COLON expression
    ;

templateExpr
    : DOLLAR_LCURL expression RCURL
    ;

variableExpr
    : IDENTIFIER
    ;

functionCall
    : IDENTIFIER LPAREN functionArgs RPAREN
    ;

functionArgs
    : (expression (COMMA expression)* (COMMA | ELLIPSIS)?)?
    ;

forExpr
    : forTupleExpr
    | forObjectExpr
    ;

forObjectExpr
    : LCURL forIntro expression ARROW expression forCond? RCURL
    ;

forTupleExpr
    : LBRACK forIntro expression forCond? RBRACK
    ;

forIntro
    : 'for' IDENTIFIER (COMMA IDENTIFIER)? 'in' expression ':'
    ;

forCond
    : 'if' expression
    ;

IDENTIFIER
    : [a-zA-Z_][a-zA-Z_0-9-]*
    ;

NUMBER
    : DECIMAL+ (DOT DECIMAL+)? (EXPMARK DECIMAL+)?
    ;

INTERPOLATED_STRING
    : (QUOTE ~[\r\n]*? (DOLLAR_LCURL ~[\r\n]*? RCURL) ~[\r\n]*? QUOTE)
    ;

STRING_LITERAL
    : QUOTE (ESCAPED_CHAR|.)*? QUOTE
    ;

fragment DECIMAL
    : [0-9]
    ;

fragment EXPMARK
    : [eE] [+-]?
    ;

fragment ESCAPED_CHAR
    : '\\' [btnfr"\\]
    ;

WS
    : [ \t\r\n]+ -> skip
    ;

COMMENT
    : ('#' ~[\r\n]* | '//' ~[\r\n]* | '/*' .*? '*/') -> channel(HIDDEN)
    ;
