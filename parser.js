const Terragrunt = require('./terragrunt');
const Terraform = require('./terraform');
const path = require('path');
const jsep = require('jsep');

jsep.addBinaryOp('*', 10);
jsep.hooks.add('gobble-token', function (env) {
    if (env.node && env.node.type === 'BinaryExpression' && env.node.operator === '*') {
        if (env.node.left && env.node.left.type === 'MemberExpression') {
            env.node.type = 'AttributeSplatExpression';
            env.node.operator = null;
        } else if (env.node.left && env.node.left.type === 'ArrayExpression') {
            env.node.type = 'FullSplatExpression';
            env.node.operator = null;
        }
    }
});

const ruleHandlers = {
    block: handleBlock,
    argument: handleAssign,
    objectElement: handleAssign,
    object: handleObject,
    tuple: handleTuple,
    unaryOperation: handleOperation,
    binaryOperation: handleOperation,
    conditional: handleConditional,
    getAttr: handleGetAttr,
    index: handleIndex,
    attrSplat: handleAttrSplat,
    fullSplat: handleFullSplat,
    forTupleExpr: handleForTupleExpr,
    forObjectExpr: handleForObjectExpr,
    functionCall: handleFunctionCall,
    basicLiterals: handleBasicTypes,
    variableExpr: handleBasicTypes,
    heredocContent: handleBasicTypes,
    boolean: handleBoolean,
    quotedTemplate: handleQuotedTemplate,
    stringLiteral: handleStringLiteral,
};

function traverse(tfInfo, parser, node, configs, ranges, identInfo) {
    for (const child of node.children) {
        const ruleName = parser.ruleNames[child.ruleIndex];
        if (ruleName === undefined) {
            continue;
        }

        const handler = ruleHandlers[ruleName];
        if (handler) {
            handler(tfInfo, parser, child, configs, ranges, identInfo);
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

        label = processString(label);
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
    const ident = processString(name);
    const nodeInfo = {
        name: ident,
        blockType: identInfo?.blockType ? identInfo.blockType : 'argument',
        evalNeeded: true,
        range: { __range: { sl: line - 1, sc: start, el: line - 1, ec: start + name.length } },
    };

    try {
        traverse(tfInfo, parser, node.children[2], configs, ranges, nodeInfo);
        let val = configs[ident];
        updateValue(tfInfo, configs, ident, val, true);
    } catch (e) {
        console.log('Error in argument: ' + e);
    }
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
        const nodeInfo = { name: ident, blockType: identInfo.blockType, range: range, evalNeeded: true };
        traverse(tfInfo, parser, child, obj, objRanges, nodeInfo);
        updateValue(tfInfo, configs, ident, obj[ident]);
        updateValue(tfInfo, ranges, ident, objRanges[ident]);
    }
    // Add range for the entire tuple at the end or the list
    updateValue(tfInfo, ranges, ident, identInfo.range);
}

function handleOperation(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let value = node.getText();
    value = evalExpression(value, tfInfo);
    updateValue(tfInfo, configs, ident, value);
    updateValue(tfInfo, ranges, ident, identInfo.range);
}

function handleConditional(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    const nodeInfo = { name: 'conditional', blockType: identInfo.blockType, range: identInfo.range };

    let obj = {};
    traverse(tfInfo, parser, node.children[0], obj, ranges, nodeInfo);
    tfInfo.contextBuffer = {};
    let condition = evalExpression(node.children[0].getText(), tfInfo);
    obj = {};
    if (condition) {
        traverse(tfInfo, parser, node.children[2], obj, ranges, nodeInfo);
    } else {
        traverse(tfInfo, parser, node.children[4], obj, ranges, nodeInfo);
    }

    updateValue(tfInfo, configs, ident, obj.conditional, true);
    updateValue(tfInfo, ranges, ident, identInfo.range, true);
}

function handleGetAttr(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let attr = node.getText();
    let exp = configs[ident] + attr;
    let val = exp;
    if (identInfo.evalNeeded) {
        val = evalExpression(exp, tfInfo);
    }
    updateValue(tfInfo, configs, ident, val, true);
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
    let key = node.getText();
    let val = configs[ident];

    let splatList = evalExpression(val, tfInfo);
    if (key.includes('.*')) {
        let attrs = key
            .split(/\.?\*\./)
            .slice(1)
            .join('.')
            .split('.');
        val = splatList.map((item) => {
            let result = item;
            for (const attr of attrs) {
                if (result && result[attr] !== undefined) {
                    result = result[attr];
                } else {
                    result = undefined;
                    break;
                }
            }
            return result;
        });
    }
    updateValue(tfInfo, configs, ident, val, true);
}

function handleFullSplat(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let val = configs[ident];
    tfInfo.contextBuffer = {};
    let splatList = evalExpression(val, tfInfo);
    let result = splatList;
    if (node.children.length > 3) {
        let suffix = node.children[3].getText();
        result = splatList.map((item) => {
            let exp = `item${suffix}`;
            tfInfo.contextBuffer = { item: item };
            return evalExpression(exp, tfInfo);
        });
    }
    updateValue(tfInfo, configs, ident, result, true);
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
                        value[key] = evalExpression(valueExp[key], tfInfo);
                    }
                    result.push(value);
                } else {
                    result.push(evalExpression(valueExp, tfInfo));
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
                        value[key] = evalExpression(valueExp[key], tfInfo);
                    }
                    result[key] = value;
                } else {
                    let key = evalExpression(keyExp, tfInfo);
                    let value = evalExpression(valueExp, tfInfo);
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
    const ident = identInfo.name;
    let exp = node.getText();
    let val = evalExpression(exp, tfInfo);
    updateValue(tfInfo, configs, ident, val, true);
    updateValue(tfInfo, ranges, ident, identInfo.range, true);
}

function handleFunctionArgs(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    const nodeInfo = {
        name: 'functionArgs',
        blockType: identInfo.blockType,
        range: identInfo.range,
        evalNeeded: false,
    };
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
    value = processValue(value, tfInfo);
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
    value = processString(value);
    if (identInfo.evalNeeded == undefined || identInfo.evalNeeded) {
        value = evalExpression(value, tfInfo);
    }
    updateValue(tfInfo, configs, ident, value);
    ranges[ident] = identInfo.range;
}

function handleStringLiteral(tfInfo, parser, node, configs, ranges, identInfo) {
    let ident = identInfo.name;
    let value = node.getText();
    value = evalExpression(value, tfInfo);
    updateValue(tfInfo, configs, ident, value);
    ranges[ident] = identInfo.range;
}

function evalExpression(exp, tfInfo, allowMultipleValues = false) {
    if (typeof exp !== 'string' || tfInfo.doEval === false) {
        return exp;
    }

    let value = exp;
    let matches = value.match(/\$\{([^}]+)\}/g);
    if (matches) {
        for (const element of matches) {
            let match = element;
            let key = match.substring(2, match.length - 1);
            let val = runEval(key, tfInfo, allowMultipleValues);
            if (typeof val === 'string' || typeof val === 'number') {
                val = processString(String(val));
                value = value.replace(match, val);
            }
        }
    } else {
        value = runEval(value, tfInfo, allowMultipleValues);
    }
    return value;
}

function runEval(exp, tfInfo, allowMultipleValues) {
    let value = exp;
    try {
        let context = getContext(tfInfo);
        if (context === null) {
            return value;
        }
        if (typeof exp === 'string') {
            updateContext(exp, context, tfInfo, allowMultipleValues);
            exp = exp.replace(/try\(/g, 'tryTerraform(');
        }
        value = jsepEval(exp, context);
    } catch (e) {
        console.log('Failed to evaluate expression: ' + exp + ' Error: ' + e);
    }

    return value;
}

function getContext(tfInfo) {
    let context = {
        path: tfInfo.path,
        terraform: tfInfo.terraform,
        inputs: tfInfo.inputs,
        tfInfo: tfInfo,
        traverse: traverse,
        var: {},
        dependency: {},
    };

    try {
        if (tfInfo.useCache) {
            context.configs = tfInfo.tfCache.configs;
            context.module = tfInfo.tfCache.configs.module;
            context.data = tfInfo.tfCache.configs.data;
            context.local = tfInfo.tfCache.configs.locals;
            context.outputs = tfInfo.tfCache.configs.output;
            context.variable = tfInfo.tfCache.configs.variable;
        } else {
            context.configs = tfInfo.configs;
            context.module = tfInfo.configs.module;
            context.data = tfInfo.configs.data;
            context.local = tfInfo.configs.locals;
            context.outputs = tfInfo.configs.output;
            context.variable = tfInfo.configs.variable;
        }
    } catch (e) {
        console.log('Failed to get context: ' + e);
        return null;
    }

    context = Object.assign(context, Terragrunt);
    context = Object.assign(context, Terraform);
    if (tfInfo.contextBuffer) {
        context = Object.assign(context, tfInfo.contextBuffer);
    }
    return context;
}

function updateContext(exp, context, tfInfo, allowMultipleValues = false) {
    if (exp.includes('var.')) {
        const varRegex = /(var\.)([^. |\]}\r\n,)]+)/g;
        exp.match(varRegex).forEach((element) => {
            let key = element.substring(4);
            let varValue;
            if (tfInfo.inputs.hasOwnProperty(key)) {
                varValue = tfInfo.inputs[key];
            } else if (context.configs.variable.hasOwnProperty(key) && context.configs.variable[key].default) {
                varValue = processString(context.configs.variable[key].default);
            } else {
                varValue = 'undefined';
            }

            if (allowMultipleValues) {
                context.var[key] = [varValue, context.configs.variable[key]];
            } else {
                context.var[key] = varValue;
            }
        });
    }
    if (exp.includes('dependency.')) {
        const depRegex = /dependency\.([^.]+)\.outputs\./g;
        exp.match(depRegex).forEach((element) => {
            let key = element.substring(11, element.length - 10);
            let depValue = context.dependency[key].mock_outputs;
            context.dependency[key].outputs = depValue;
        });
    }
}

function processValue(value, tfInfo) {
    if (typeof value === 'string') {
        if (value === 'true' || value === 'false') {
            value = value === 'true';
        } else if (!isNaN(value)) {
            value = Number(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
            value = processString(value);
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
            if (node.name == 'undefined') {
                return undefined;
            }
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
            return evaluateMemberExpression(node, context);
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

function evaluateMemberExpression(node, context) {
    const object = evaluateAst(node.object, context);

    if (node.property.type === 'Literal') {
        return object[node.property.value];
    } else if (node.property.type === 'Identifier') {
        return object[node.property.name];
    } else if (node.property.type === 'MemberExpression') {
        return evaluateMemberExpression(node.property, object);
    } else if (node.property.type === 'ArrayExpression') {
        return node.property.elements.map((element) => evaluateAst(element, context));
    } else if (node.property.type === 'SplatExpression') {
        return object.map((item) => evaluateAst(node.property.expression, { ...context, item }));
    } else if (node.property.type === 'AttributeSplatExpression') {
        return object.map((item) => evaluateAst(node.property.expression, { ...context, item }));
    } else {
        throw new Error(`Unsupported property type: ${node.property.type}`);
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
    let value = evaluateAst(ast, context);
    if (typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))) {
        value = path.resolve(context.path.root, value);
    }
    return value;
}

function processString(value, tfInfo = {}) {
    if (typeof value !== 'string') {
        return value;
    }
    if (value.includes('\\"')) {
        value = value.replace(/\\"/g, '"');
    }

    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
    }

    if (tfInfo && (value.startsWith('./') || value.startsWith('../'))) {
        value = path.resolve(tfInfo.path.root, value);
    }

    return value;
}

function updateValue(tfInfo, obj, key, value, overWrite = false, separator = '') {
    if (key !== undefined && obj !== undefined && key !== null && obj !== null) {
        if (overWrite) {
            obj[key] = value;
        } else if (Array.isArray(obj[key])) {
            obj[key].push(value);
        } else {
            obj[key] = obj[key] === undefined ? value : obj[key] + separator + value;
        }
    }
}

// Update cache so that the vars are replaced with their values
// This will be useful if the local is getting updated from vars and
// the file that we are parsing is not the one containing locals
function updateCacheWithVars(tfInfo, inputs) {
    tfInfo.inputs = inputs;
    tfInfo.useCache = false;
    tfInfo.doEval = true;
    for (let key in tfInfo.configs.locals) {
        let value = tfInfo.configs.locals[key];
        if (typeof value === 'string' && value.includes('var.')) {
            tfInfo.configs.locals[key] = evalExpression(value, tfInfo);
        }
    }
}

const TerragruntParser = {
    traverse: traverse,
    evalExpression: evalExpression,
    processValue: processValue,
    updateCacheWithVars: updateCacheWithVars,
};

module.exports = TerragruntParser;
