grammar hcl;

configFile
    : (argument | block | oneLineBlock)+ _EOF
    ;

resource
    : 'resource' resourcetype name block
    ;

data
    : 'data' resourcetype name block
    ;

variable
    : 'variable' name block
    ;

output
    : 'output' name block
    ;

local
    : 'locals' block
    ;

module
    : 'module' name block
    ;

provider
    : 'provider' block
    ;

terraform
    : 'terraform' block
    ;

check
    : 'check' block
    ;

imports
    : 'import' block
    ;

resourcetype
    : label
    ;

name
    : label
    ;

label
    : STRING_LITERAL
    | IDENTIFIER
    ;

body
    : (argument | block | oneLineBlock)*
    ;

block
    : IDENTIFIER? IDENTIFIER? IDENTIFIER? LCURL NEWLINE? body RCURL NEWLINE?
    ;

oneLineBlock
    : IDENTIFIER? IDENTIFIER? IDENTIFIER? LCURL argument? RCURL NEWLINE?
    ;

argument
    : argumentName '=' argumentValue NEWLINE?
    ;

argumentName
    : IDENTIFIER
    ;

argumentValue
    : expression
    ;

expression
    : exprTerm
    | unaryOperator exprTerm
    | exprTerm binaryOperator exprTerm
    | exprTerm QUESTION expression COLON expression
    | STRING
    | INTERPOLATED_STRING
    ;

exprTerm
    : literalValue
    | collectionValue
    | templateExpr
    | variableExpr
    | functionCall
    | forExpr
    | exprTerm index
    | exprTerm getAttr
    | exprTerm splat
    | LPAREN expression RPAREN
    ;

collectionValue
    : tuple
    | object
    ;

tuple
    : LBRACK (expression ((COMMA | NEWLINE) expression)* ','?)? RBRACK
    ;

object
    : LCURL (objectelem ((COMMA | NEWLINE) objectelem)* ','?)? RCURL
    ;

objectelem
    : (IDENTIFIER | expression) ('=' | ':') expression
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
    : 'for' IDENTIFIER 'in' expression COLON expression ('if' expression)?
    ;

index
    : LBRACK expression RBRACK
    ;

getAttr
    : DOT IDENTIFIER
    ;

splat
    : attrSplat
    | fullSplat
    ;

attrSplat
    : DOT STAR getAttr*
    ;

fullSplat
    : LBRACK STAR RBRACK (getAttr | index)*
    ;

literalValue
    : NUMBER
    | boolean
    | NULL
    ;

unaryOperator
    : PLUS
    | MINUS
    ;

binaryOperation
    : exprTerm binaryOperator exprTerm
    ;

binaryOperator
    : compareOperator
    | arithmeticOperator
    | logicOperator
    ;

compareOperator
    : '=='
    | '!='
    | '<'
    | '>'
    | '<='
    | '>='
    ;

arithmeticOperator
    : '+'
    | '-'
    | '*'
    | '/'
    | '%'
    ;

logicOperator
    : '&&'
    | '||'
    ;

boolean
    : TRUE
    | FALSE
    ;

IDENTIFIER
    : [a-zA-Z_-][a-zA-Z_0-9-]*
    ;

NUMBER
    : DECIMAL+ (DOT DECIMAL+)? (EXPMARK DECIMAL+)?
    ;

STRING_LITERAL
    : (QUOTE IDENTIFIER QUOTE)
    ;

STRING
    : QUOTE [a-zA-Z_][a-zA-Z_0-9]* QUOTE
    ;

INTERPOLATED_STRING
    : (QUOTE ~[\r\n]* QUOTE)
    ;

fragment DECIMAL
    : [0-9]
    ;

fragment EXPMARK
    : [eE] [+-]?
    ;

fragment ESC
    : '\\' (["\\/bfnrt])
    ;

QUOTE: '"';
PLUS: '+';
MINUS: '-';
STAR: '*';
SLASH: '/';
PERCENT: '%';
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
ASSIGN: '=';
ARROW: '=>';
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

NEWLINE
    : '\r'? '\n'
    ;

WS
    : [ \t\r\n]+ -> skip
    ;

COMMENT
    : ('#' ~[\r\n]* | '//' ~[\r\n]* | '/*' .*? '*/') -> channel(HIDDEN)
    ;
