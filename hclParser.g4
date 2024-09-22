parser grammar hclParser;

options {
    tokenVocab = hclLexer;
}

configFile
    : body EOF
    ;

body
    : (argument | block | oneLineBlock | NEWLINE)*
    ;

block
    : IDENTIFIER (IDENTIFIER | STRING_LITERAL)* LCURL NEWLINE? body NEWLINE? RCURL
    ;

oneLineBlock
    : IDENTIFIER (IDENTIFIER | STRING_LITERAL)* LCURL argument? RCURL NEWLINE?
    ;

argument
    : IDENTIFIER ASSIGN expression NEWLINE?
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
    | exprTerm splat
    | LPAREN expression RPAREN
    ;

literals
    : basicLiterals
    | boolean
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
    : LBRACK NEWLINE? (expression (COMMA | NEWLINE)* NEWLINE?)* NEWLINE? RBRACK
    ;

object
    : LCURL NEWLINE? (objectElement (COMMA | NEWLINE)* NEWLINE?)* NEWLINE? RCURL
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
    : quotedTemplate
    | heredocTemplate
    ;

quotedTemplate
    : QUOTED_TEMPLATE
    ;

heredocTemplate
    : HEREDOC_START heredocContent* heredocEnd
    ;

heredocContent
    : HEREDOC_CONTENT
    ;

heredocEnd
    : HEREDOC_END
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
    : LCURL NEWLINE? forIntro expression ARROW expression forCond? NEWLINE? RCURL
    ;

forTupleExpr
    : LBRACK NEWLINE? forIntro expression forCond? RBRACK
    ;

forIntro
    : FOR IDENTIFIER (COMMA IDENTIFIER)? IN expression COLON NEWLINE?
    ;

forCond
    : IF expression NEWLINE?
    ;
