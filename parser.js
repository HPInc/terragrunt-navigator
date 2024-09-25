const Terragrunt = require('./terragrunt');
const Terraform = require('./terraform');
const path = require('path');
const jsep = require('jsep');

function traverse(tfInfo, parser, node, configs, ranges, identInfo) {
    if (!node?.children || typeof node.children !== 'object') {
        return;
    }

    for (const child of node.children) {
        let ruleName = parser.ruleNames[child.ruleIndex];

        if (ruleName === undefined) {
            continue;
        } else if (ruleName === 'block') {
            handleBlock(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'argument' || ruleName === 'objectElement') {
            handleAssign(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'expression') {
            handleExpression(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'object') {
            handleObject(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'tuple') {
            handleTuple(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'unaryOperator' || ruleName === 'binaryOperator') {
            handleOperator(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'conditional') {
            handleConditional(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'getAttr') {
            handleGetAttr(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'index') {
            handleIndex(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'attrSplat') {
            handleAttrSplat(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'fullSplat') {
            handleFullSplat(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'forTupleExpr') {
            handleForTupleExpr(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'forObjectExpr') {
            handleForObjectExpr(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'functionCall') {
            handleFunctionCall(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName == 'functionArgs') {
            handleFunctionArgs(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'basicLiterals' || ruleName === 'variableExpr' || ruleName === 'heredocContent') {
            handleBasicTypes(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'boolean') {
            handleBoolean(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'quotedTemplate') {
            handleQuotedTemplate(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (ruleName === 'stringLiteral') {
            handleStringLiteral(tfInfo, parser, child, configs, ranges, identInfo);
        } else if (child.children && typeof child.children === 'object') {
            traverse(tfInfo, parser, child, configs, ranges, identInfo);
        }
    }
}

function handleBlock(tfInfo, parser, node, configs, ranges, identInfo) {
    let firstChild = node.children[0];
    let blockType = firstChild.getText();
    const sl = node.start.line - 1;
    const sc = node.start.column;
    const nodeInfo = {
        name: blockType,
        blockType: blockType,
        evalNeeded: false,
        range: { __range: { sl: sl, sc: sc, el: sl, ec: sc + firstChild.getText().length } },
    };

    let identifierCount = 0;
    let stringLiteralCount = 0;
    let totalLabels = (node.IDENTIFIER?.length ?? 0) + (node.STRING_LITERAL?.length ?? 0);
    for (let ii = 0; ii < totalLabels; ii++) {
        let label = null;
        if (typeof node.IDENTIFIER === 'function' && node.IDENTIFIER(identifierCount)) {
            label = node.IDENTIFIER(identifierCount).getText();
            identifierCount++;
        } else if (typeof node.STRING_LITERAL === 'function' && node.STRING_LITERAL(stringLiteralCount)) {
            label = node.STRING_LITERAL(stringLiteralCount).getText();
            stringLiteralCount++;
        }

        if (!label) {
            continue;
        }

        label = unquote(label);
        // Avoid overwriting the block itself when block with same name is present.
        // For e.g. multiple variables section in the same file
        if (!configs.hasOwnProperty(label)) {
            configs[label] = {};
        }
        if (!ranges.hasOwnProperty(label)) {
            ranges[label] = {};
        }

        configs = configs[label];
        ranges = ranges[label];
    }

    traverse(tfInfo, parser, node, configs, ranges, nodeInfo);
    ranges['__range'] = nodeInfo.range.__range;
}

function handleAssign(tfInfo, parser, node, configs, ranges, identInfo) {
    const firstChild = node.children[0];
    const line = firstChild.start ? firstChild.start.line : node.start.line;
    const start = firstChild.start ? firstChild.start.column : node.start.column;
    const name = firstChild.getText();
    const nodeInfo = {
        name: name,
        blockType: identInfo?.blockType ? identInfo.blockType : 'argument',
        evalNeeded: true,
        range: { __range: { sl: line - 1, sc: start, el: line - 1, ec: start + name.length } },
    };

    try {
        traverse(tfInfo, parser, node.children[2], configs, ranges, nodeInfo);
        const ident = nodeInfo.name;
        let val = configs[ident];
        if (nodeInfo.evalNeeded && typeof val === 'string') {
            tfInfo.contextBuffer = {};
            val = evalExpression(val, tfInfo, true);
        } else {
            val = processValue(val, tfInfo);
        }
        updateValue(tfInfo, configs, ident, val, true);
    } catch (e) {
        console.log('Error in argument: ' + e);
    }
}

function handleExpression(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let obj = {};
    let objRanges = {};
    const nodeInfo = { name: 'expression', blockType: identInfo.blockType, range: identInfo.range };
    traverse(tfInfo, parser, node, obj, objRanges, nodeInfo);
    let value = obj.expression;
    tfInfo.contextBuffer = {};
    value = nodeInfo.evalNeeded ? evalExpression(value, tfInfo) : processValue(value, tfInfo);
    updateValue(tfInfo, configs, ident, value);
    updateValue(tfInfo, ranges, ident, objRanges.expression);
}

function handleObject(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    if (Array.isArray(configs[ident])) {
        let obj = {};
        let objRanges = {};
        traverse(tfInfo, parser, node, obj, objRanges, identInfo);
        updateValue(tfInfo, configs, ident, obj);
        updateValue(tfInfo, ranges, ident, objRanges);
    } else if (typeof configs[ident] === 'object') {
        traverse(tfInfo, parser, node, configs, ranges, identInfo);
    } else {
        configs[ident] = {};
        ranges[ident] = {};
        ranges[ident]['__range'] = identInfo.range.__range;
        configs = configs[ident];
        ranges = ranges[ident];
        traverse(tfInfo, parser, node, configs, ranges, identInfo);
    }
}

function handleTuple(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    if (!Array.isArray(configs[ident])) {
        configs[ident] = [];
        ranges[ident] = [];
    }
    for (let ii = 1; ii < node.children.length - 1; ii += 2) {
        let child = node.children[ii];
        let obj = [];
        let objRanges = [];
        let text = child.getText();
        let sl = child.start.line - 1;
        let sc = child.start.column;
        let range = { __range: { sl: sl, sc: sc, el: sl, ec: sc + (text.length ?? 1) } };
        const nodeInfo = { name: ident, blockType: identInfo.blockType, range: range };
        traverse(tfInfo, parser, child, obj, objRanges, nodeInfo);
        let val = evalExpression(obj[ident], tfInfo);
        updateValue(tfInfo, configs, ident, val);
        updateValue(tfInfo, ranges, ident, objRanges[ident]);
    }
    // Add range for the entire tuple at the end or the list
    updateValue(tfInfo, ranges, ident, identInfo.range);
}

function handleOperator(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let value = node.getText();
    updateValue(tfInfo, configs, ident, value);
    traverse(tfInfo, parser, node, configs, ranges, identInfo);
    identInfo.evalNeeded = true;
}

function handleConditional(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let obj = {};
    const nodeInfo = { name: 'conditional', blockType: identInfo.blockType, range: identInfo.range };
    traverse(tfInfo, parser, node.children[0], obj, ranges, nodeInfo);
    tfInfo.contextBuffer = {};
    let condition = evalExpression(obj.conditional, tfInfo);
    obj = {};
    traverse(tfInfo, parser, node.children[2], obj, ranges, nodeInfo);
    let trueValue = evalExpression(obj.conditional, tfInfo);
    obj = {};
    traverse(tfInfo, parser, node.children[4], obj, ranges, nodeInfo);
    let falseValue = evalExpression(obj.conditional, tfInfo);
    try {
        let val = condition ? trueValue : falseValue;
        updateValue(tfInfo, configs, ident, val, true);
        updateValue(tfInfo, ranges, ident, identInfo.range, true);
    } catch (e) {
        console.log('Error in conditional: ' + node.getText() + ' Error: ' + e);
    }
}

function handleGetAttr(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let attr = node.getText();
    updateValue(tfInfo, configs, ident, attr);
    identInfo.evalNeeded = true;
}

function handleIndex(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let obj = {};
    const nodeInfo = { name: 'index', blockType: identInfo.blockType, range: identInfo.range };
    traverse(tfInfo, parser, node, obj, ranges, nodeInfo);
    let index = obj.index;
    updateValue(tfInfo, configs, ident, index);
    nodeInfo.evalNeeded = true;
}

function handleAttrSplat(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let key = node.getText().split('.').pop();
    let val = configs[ident];
    let splatList = evalExpression(val, tfInfo);
    val = splatList.map((item) => item[key]);
    updateValue(tfInfo, configs, ident, val, true);
}

function handleFullSplat(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let val = configs[ident];
    let splatList = evalExpression(val, tfInfo);
    updateValue(tfInfo, configs, ident, splatList, true);
}

function handleForTupleExpr(tfInfo, parser, node, configs, ranges, identInfo) {
    try {
        let ident = identInfo.name;
        let forRule = node.children[1].children.map((node) => node.getText());
        let key = forRule[1];
        tfInfo.contextBuffer = {};
        let list = evalExpression(forRule[3], tfInfo);
        let obj = {};
        let objRanges = {};
        let nodeInfo = {
            name: 'forTupleExpr',
            blockType: identInfo.blockType,
            range: identInfo.range,
            evalNeeded: false,
        };
        traverse(tfInfo, parser, node.children[2], obj, objRanges, nodeInfo);
        let valueExp = obj.forTupleExpr;
        let conditionExp = null;
        if (node.children.length > 4) {
            conditionExp = node.children[3].children[1].getText();
        }

        let result = [];
        list.forEach((item) => {
            tfInfo.contextBuffer[key] = item;
            let condition = conditionExp != null ? evalExpression(conditionExp, tfInfo) : true;
            if (condition) {
                if (typeof valueExp === 'object') {
                    let value = {};
                    for (let key in valueExp) {
                        value[key] = evalExpression(valueExp[key], tfInfo, true);
                    }
                    result.push(value);
                } else {
                    result.push(evalExpression(valueExp, tfInfo, true));
                }
            }
        });

        updateValue(tfInfo, configs, ident, result, true);
        updateValue(tfInfo, ranges, ident, identInfo.range, true);
    } catch (e) {
        console.log('Error in forTupleExpr: ' + e);
    }
}

function handleForObjectExpr(tfInfo, parser, node, configs, ranges, identInfo) {
    try {
        let ident = identInfo.name;
        let forRule = node.children[1].children.map((node) => node.getText());
        let key = forRule[1];
        tfInfo.contextBuffer = {};
        let list = evalExpression(forRule[3], tfInfo);
        let keyExp = node.children[2].getText();
        let obj = {};
        let objRanges = {};
        let nodeInfo = {
            name: 'forObjectExpr',
            blockType: identInfo.blockType,
            range: identInfo.range,
            evalNeeded: false,
        };
        traverse(tfInfo, parser, node.children[4], obj, objRanges, nodeInfo);
        let valueExp = obj.forObjectExpr;
        let conditionExp = null;
        if (node.children.length > 4) {
            conditionExp = node.children[5].children[1].getText();
        }

        let result = {};
        list.forEach((item) => {
            tfInfo.contextBuffer[key] = item;
            let condition = conditionExp != null ? evalExpression(conditionExp, tfInfo) : true;
            if (condition) {
                if (typeof valueExp === 'object') {
                    let value = {};
                    for (let key in valueExp) {
                        value[key] = evalExpression(valueExp[key], tfInfo, true);
                    }
                    result[key] = value;
                } else {
                    let key = evalExpression(keyExp, tfInfo, true);
                    let value = evalExpression(valueExp, tfInfo, true);
                    result[key] = value;
                }
            }
        });

        updateValue(tfInfo, configs, ident, result, true);
        updateValue(tfInfo, ranges, ident, identInfo.range, true);
    } catch (e) {
        console.log('Error in forObjectExpr: ' + e);
    }
}

function handleFunctionCall(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    const nodeInfo = { name: 'functionCall', blockType: identInfo.blockType, range: identInfo.range };
    let funcName = node.children[0].getText();
    let obj = {};
    traverse(tfInfo, parser, node, obj, ranges, nodeInfo);
    let args = obj.functionCall !== undefined ? obj.functionCall : '';
    let funcString = funcName;
    if (typeof args === 'string') {
        funcString += '(' + args + ')';
    } else {
        funcString += '(args)';
        tfInfo.contextBuffer = { args: args };
    }
    let val = evalExpression(funcString, tfInfo);
    updateValue(tfInfo, configs, ident, val, true);
    updateValue(tfInfo, ranges, ident, nodeInfo.range, true);
}

function handleFunctionArgs(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    const nodeInfo = { name: 'functionArgs', blockType: identInfo.blockType, range: identInfo.range };
    if (node.children) {
        for (const element of node.children) {
            let obj = { functionArgs: '' };
            traverse(tfInfo, parser, element, obj, ranges, nodeInfo);
            if (obj.functionArgs !== '') {
                updateValue(tfInfo, configs, ident, obj.functionArgs, false, ',');
            }
        }
    }
}

function handleBasicTypes(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let value = node.getText();
    updateValue(tfInfo, configs, ident, value);
    ranges[ident] = identInfo.range;
}

function handleBoolean(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let value = node.getText() == 'true';
    updateValue(tfInfo, configs, ident, value);
    ranges[ident] = identInfo.range;
}

function handleQuotedTemplate(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let value = node.getText();
    tfInfo.contextBuffer = {};
    value = unquote(value);
    if (identInfo.evalNeeded == undefined || identInfo.evalNeeded) {
        value = evalExpression(value, tfInfo);
    }
    updateValue(tfInfo, configs, ident, value);
    ranges[ident] = identInfo.range;
}

function handleStringLiteral(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let value = node.getText();
    tfInfo.contextBuffer = {};
    value = evalExpression(value, tfInfo);
    updateValue(tfInfo, configs, ident, value);
    ranges[ident] = identInfo.range;
}

function evalExpression(exp, tfInfo, processOutput = false) {
    if (typeof exp !== 'string') {
        return exp;
    }

    let value = exp;
    let matches = value.match(/\$\{([^}]+)\}/g);
    if (matches) {
        for (const element of matches) {
            let match = element;
            let key = match.substring(2, match.length - 1);
            let val = runEval(key, tfInfo, processOutput);
            if (typeof val === 'string' || typeof val === 'number') {
                val = unquote(String(val));
                value = value.replace(match, val);
            }
        }
    } else {
        value = runEval(value, tfInfo, processOutput);
    }
    return value;
}

function runEval(exp, tfInfo, processOutput = false) {
    let value = exp;
    try {
        let context = {
            path: tfInfo.path,
            terraform: tfInfo.terraform,
            configs: tfInfo.configs,
            module: tfInfo.configs.module,
            data: tfInfo.configs.data,
            local: tfInfo.configs.locals,
            tfInfo: tfInfo,
            traverse: traverse,
        };
        context = Object.assign(context, Terragrunt);
        context = Object.assign(context, Terraform);
        if (tfInfo.contextBuffer) {
            context = Object.assign(context, tfInfo.contextBuffer);
        }

        if (typeof exp === 'string') {
            if (exp.includes('var.')) {
                exp = exp.replace(/(var\.)([^. |\]}\r\n,]+)([^ |\]}\r\n,]*)/g, 'tfInfo.configs.variable.$2.default$3');
            }
            if (exp.includes('dependency.')) {
                exp = exp.replace(/dependency\.([^.]+)\.outputs\./g, 'tfInfo.configs.dependency.$1.mock_outputs.');
            }
            exp = exp.replace(/try\(/g, 'tryTerraform(');
        }

        value = jsepEval(exp, context);
        if (typeof value === 'string') {
            value = quote(value);
        }
    } catch (e) {
        console.log('Failed to evaluate expression: ' + exp + ' Error: ' + e);
    }

    if (processOutput) {
        value = processValue(value, tfInfo);
    }
    return value;
}

function processValue(value, tfInfo) {
    if (typeof value === 'string') {
        if (value === 'true' || value === 'false') {
            value = value === 'true';
        } else if (!isNaN(value)) {
            value = Number(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
            value = unquote(value);
        }
        if (typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))) {
            value = path.resolve(tfInfo.path.root, value);
        }
    } else if (value === undefined) {
        value = 'undefined';
    }
    return value;
}

function evaluateAst(node, context) {
    switch (node.type) {
        case 'Literal':
            return node.value;
        case 'Identifier':
            if (context.hasOwnProperty(node.name)) {
                return context[node.name];
            } else {
                throw new Error(`Undefined identifier: ${node.name}`);
            }
        case 'BinaryExpression':
            return evaluateBinaryExpression(node, context);
        case 'UnaryExpression':
            return evaluateUnaryExpression(node, context);
        case 'MemberExpression':
            return evaluateAst(node.object, context)[node.property.name];
        case 'CallExpression':
            return evaluateCallExpression(node, context);
        case 'ConditionalExpression':
            return evaluateAst(node.test, context)
                ? evaluateAst(node.consequent, context)
                : evaluateAst(node.alternate, context);
        case 'ArrayExpression':
            return node.elements.map((n) => evaluateAst(n, context));
        case 'ObjectExpression':
            return node.properties.reduce((obj, prop) => {
                obj[prop.key.name] = evaluateAst(prop.value, context);
                return obj;
            }, {});
        case 'Compound':
            return node.body.map((n) => evaluateAst(n, context)).pop();
        default:
            throw new Error(`Unsupported node type: ${node.type}`);
    }
}

function evaluateBinaryExpression(node, context) {
    const left = evaluateAst(node.left, context);
    const right = evaluateAst(node.right, context);
    switch (node.operator) {
        case '+':
            return left + right;
        case '-':
            return left - right;
        case '*':
            return left * right;
        case '/':
            return left / right;
        case '%':
            return left % right;
        case '<':
            return left < right;
        case '>':
            return left > right;
        case '<=':
            return left <= right;
        case '>=':
            return left >= right;
        case '==':
            return left == right;
        case '!=':
            return left != right;
        case '&&':
            return left && right;
        case '||':
            return left || right;
        default:
            throw new Error(`Unsupported operator: ${node.operator}`);
    }
}

function evaluateUnaryExpression(node, context) {
    const argument = evaluateAst(node.argument, context);
    switch (node.operator) {
        case '+':
            return +argument;
        case '-':
            return -argument;
        case '!':
            return !argument;
        default:
            throw new Error(`Unsupported operator: ${node.operator}`);
    }
}

function evaluateCallExpression(node, context) {
    const func = evaluateAst(node.callee, context);
    const args = node.arguments.map((arg) => evaluateAst(arg, context));
    if (typeof func !== 'function') {
        throw new Error(`Callee is not a function: ${node.callee.name}`);
    }
    return func.apply(context, args);
}

function jsepEval(exp, context) {
    const ast = jsep(exp);
    return evaluateAst(ast, context);
}

function quote(value) {
    if (typeof value === 'string' && !value.startsWith('"')) {
        return '"' + value + '"';
    } else {
        return value;
    }
}

function unquote(value) {
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
        return value.substring(1, value.length - 1);
    } else {
        return value;
    }
}

function updateValue(tfInfo, obj, key, value, overWrite = false, separator = '') {
    if (key !== undefined && obj !== undefined && key !== null && obj !== null) {
        if (overWrite) {
            obj[key] = value;
        } else if (Array.isArray(obj[key])) {
            value = processValue(value, tfInfo);
            obj[key].push(value);
        } else {
            obj[key] = obj[key] === undefined ? value : obj[key] + separator + value;
        }
    }
}

const TerragruntParser = {
    traverse: traverse,
    evalExpression: evalExpression,
    processValue: processValue,
};

module.exports = TerragruntParser;
