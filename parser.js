const Terragrunt = require('./terragrunt');
const Terraform = require('./terraform');
const path = require('path');
const jsep = require('jsep');

function traverse(tfInfo, parser, node, configs, ranges, identInfo) {
    if (!node?.children || typeof node.children !== 'object') {
        return;
    }

    let ident = identInfo ? identInfo.name : null;
    for (const element of node.children) {
        const child = element;
        let ruleName = parser.ruleNames[child.ruleIndex];
        if (ruleName === undefined) {
            continue;
        } else {
            //console.debug(ruleName + " -> " + child.getText());
        }
        if (ruleName === 'block') {
            let firstChild = child.children[0];
            let blockType = firstChild.getText();
            const identInfo = {
                name: blockType,
                blockType: blockType,
                evalNeeded: false,
                range: {
                    __range: {
                        sl: child.start.line - 1,
                        sc: child.start.column,
                        el: child.start.line - 1,
                        ec: child.start.column + firstChild.getText().length,
                    },
                },
            };

            let block = configs;
            let rangesBlock = ranges;
            let identifierCount = 0;
            let stringLiteralCount = 0;
            for (const _ of child.children) {
                let label = null;
                if (child.IDENTIFIER(identifierCount)) {
                    label = child.IDENTIFIER(identifierCount).getText();
                    identifierCount++;
                } else if (child.STRING_LITERAL(stringLiteralCount)) {
                    label = child.STRING_LITERAL(stringLiteralCount).getText();
                    stringLiteralCount++;
                }

                if (!label) {
                    continue;
                }

                label = label.replace(/"/g, '');
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

            traverse(tfInfo, parser, child, configs, ranges, identInfo);
            ranges['__range'] = identInfo.range.__range;
            configs = block;
            ranges = rangesBlock;
        } else if (ruleName === 'argument' || ruleName === 'objectElement') {
            const firstChild = child.children[0];
            const line = firstChild.start ? firstChild.start.line : child.start.line;
            const start = firstChild.start ? firstChild.start.column : child.start.column;
            const name = firstChild.getText();
            const childIdentInfo = {
                name: name,
                blockType: identInfo?.blockType ? identInfo.blockType : 'argument',
                evalNeeded: false,
                range: {
                    __range: {
                        sl: line - 1,
                        sc: start,
                        el: line - 1,
                        ec: start + name.length,
                    },
                },
            };

            try {
                traverse(tfInfo, parser, child, configs, ranges, childIdentInfo);
                ident = childIdentInfo.name;
                if (childIdentInfo.evalNeeded) {
                    tfInfo.contextBuffer = {};
                    configs[ident] = evalExpression(configs[ident], tfInfo);
                }
                configs[ident] = processValue(configs[ident], tfInfo);
            } catch (e) {
                console.log('Error in argument: ' + e);
            }
        } else if (ruleName === 'expression') {
            let obj = {};
            let objRanges = {};
            const childIdentInfo = { name: 'expression', blockType: identInfo.blockType, range: identInfo.range };
            traverse(tfInfo, parser, child, obj, objRanges, childIdentInfo);
            let value = obj.expression;
            tfInfo.contextBuffer = {};
            value = childIdentInfo.evalNeeded ? evalExpression(value, tfInfo) : processValue(value, tfInfo);
            updateValue(tfInfo, configs, ident, value);
            updateValue(tfInfo, ranges, ident, objRanges.expression);
        } else if (ruleName === 'object') {
            let mapConfigs = configs;
            let mapRanges = ranges;
            if (Array.isArray(configs[ident])) {
                let obj = {};
                let objRanges = {};
                traverse(tfInfo, parser, child, obj, objRanges, identInfo);
                updateValue(tfInfo, configs, ident, obj);
                updateValue(tfInfo, ranges, ident, objRanges);
            } else if (typeof configs[ident] === 'object') {
                traverse(tfInfo, parser, child, configs, ranges, identInfo);
            } else {
                configs[ident] = {};
                ranges[ident] = {};
                ranges[ident]['__range'] = identInfo.range.__range;
                configs = configs[ident];
                ranges = ranges[ident];
                traverse(tfInfo, parser, child, configs, ranges, identInfo);
                configs = mapConfigs;
                ranges = mapRanges;
            }
        } else if (ruleName === 'tuple') {
            if (Array.isArray(configs[ident])) {
                let obj = [];
                let objRanges = [];
                traverse(tfInfo, parser, child, obj, objRanges, identInfo);
                updateValue(tfInfo, configs, ident, obj);
                updateValue(tfInfo, ranges, ident, objRanges);
            } else {
                configs[ident] = [];
                ranges[ident] = [];
                traverse(tfInfo, parser, child, configs, ranges, identInfo);
            }
        } else if (ruleName === 'unaryOperator' || ruleName === 'binaryOperator') {
            let value = child.getText();
            updateValue(tfInfo, configs, ident, value);
            traverse(tfInfo, parser, child, configs, ranges, identInfo);
            identInfo.evalNeeded = true;
        } else if (ruleName === 'conditional') {
            let obj = {};
            const childIdentInfo = { name: 'conditional', blockType: identInfo.blockType, range: identInfo.range };
            traverse(tfInfo, parser, child.children[0], obj, ranges, childIdentInfo);
            tfInfo.contextBuffer = {};
            let condition = evalExpression(obj.conditional, tfInfo);
            obj = {};
            traverse(tfInfo, parser, child.children[2], obj, ranges, childIdentInfo);
            let trueValue = evalExpression(obj.conditional, tfInfo);
            obj = {};
            traverse(tfInfo, parser, child.children[4], obj, ranges, childIdentInfo);
            let falseValue = evalExpression(obj.conditional, tfInfo);
            try {
                configs[ident] = condition ? trueValue : falseValue;
                ranges[ident] = identInfo.range;
            } catch (e) {
                console.log('Error in conditional: ' + child.getText() + ' Error: ' + e);
            }
        } else if (ruleName === 'getAttr') {
            let attr = child.getText();
            updateValue(tfInfo, configs, ident, attr);
            identInfo.evalNeeded = true;
        } else if (ruleName === 'index') {
            let obj = {};
            const childIdentInfo = { name: 'index', blockType: identInfo.blockType, range: identInfo.range };
            traverse(tfInfo, parser, child, obj, ranges, childIdentInfo);
            let index = obj.index;
            updateValue(tfInfo, configs, ident, index);
            childIdentInfo.evalNeeded = true;
        } else if (ruleName === 'attrSplat') {
            let key = child.getText().split('.').pop();
            let splatList = evalExpression(configs[ident], tfInfo);
            configs[ident] = splatList.map((item) => item[key]);
        } else if (ruleName === 'fullSplat') {
            let splatList = evalExpression(configs[ident], tfInfo);
            configs[ident] = splatList;
        } else if (ruleName === 'forTupleExpr') {
            try {
                let forRule = child.children[1].children.map((child) => child.getText());
                let key = forRule[1];
                tfInfo.contextBuffer = {};
                let list = evalExpression(forRule[3], tfInfo);
                let obj = {};
                let objRanges = {};
                let childIdentInfo = {
                    name: 'forTupleExpr',
                    blockType: identInfo.blockType,
                    range: identInfo.range,
                    evalNeeded: false,
                };
                traverse(tfInfo, parser, child.children[2], obj, objRanges, childIdentInfo);
                let valueExp = obj.forTupleExpr;
                let conditionExp = null;
                if (child.children.length > 4) {
                    conditionExp = child.children[3].children[1].getText();
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

                configs[ident] = result;
                ranges[ident] = identInfo.range;
            } catch (e) {
                console.log('Error in forTupleExpr: ' + e);
            }
        } else if (ruleName === 'forObjectExpr') {
            try {
                let forRule = child.children[1].children.map((child) => child.getText());
                let key = forRule[1];
                tfInfo.contextBuffer = {};
                let list = evalExpression(forRule[3], tfInfo);
                let keyExp = child.children[2].getText();
                let obj = {};
                let objRanges = {};
                let childIdentInfo = {
                    name: 'forObjectExpr',
                    blockType: identInfo.blockType,
                    range: identInfo.range,
                    evalNeeded: false,
                };
                traverse(tfInfo, parser, child.children[4], obj, objRanges, childIdentInfo);
                let valueExp = obj.forObjectExpr;
                let conditionExp = null;
                if (child.children.length > 4) {
                    conditionExp = child.children[5].children[1].getText();
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

                configs[ident] = result;
                ranges[ident] = identInfo.range;
            } catch (e) {
                console.log('Error in forObjectExpr: ' + e);
            }
        } else if (ruleName === 'functionCall') {
            const childIdentInfo = { name: 'functionCall', blockType: identInfo.blockType, range: identInfo.range };
            let funcName = child.children[0].getText();
            let obj = {};
            traverse(tfInfo, parser, child, obj, ranges, childIdentInfo);
            let args = obj.functionCall !== undefined ? obj.functionCall : '';
            let funcString = funcName;
            if (typeof args === 'string') {
                funcString += '(' + args + ')';
            } else {
                funcString += '(args)';
                tfInfo.contextBuffer = { args: args };
            }
            configs[ident] = evalExpression(funcString, tfInfo);
            ranges[ident] = identInfo.range;
        } else if (ruleName == 'functionArgs') {
            const childIdentInfo = { name: 'functionArgs', blockType: identInfo.blockType, range: identInfo.range };
            if (child.children) {
                for (const element of child.children) {
                    let obj = { functionArgs: '' };
                    traverse(tfInfo, parser, element, obj, ranges, childIdentInfo);
                    if (obj.functionArgs !== '') {
                        updateValue(tfInfo, configs, ident, obj.functionArgs, ',');
                    }
                }
            }
        } else if (ruleName === 'basicLiterals' || ruleName === 'variableExpr' || ruleName === 'heredocContent') {
            let value = child.getText();
            updateValue(tfInfo, configs, ident, value);
            ranges[ident] = identInfo.range;
        } else if (ruleName === 'boolean') {
            let value = child.getText() == 'true';
            updateValue(tfInfo, configs, ident, value);
            ranges[ident] = identInfo.range;
        } else if (ruleName === 'quotedTemplate') {
            let value = child.getText();
            tfInfo.contextBuffer = {};
            value = value.substring(1, value.length - 1);
            if (identInfo.evalNeeded == undefined || identInfo.evalNeeded) {
                value = evalExpression(value, tfInfo);
            }
            updateValue(tfInfo, configs, ident, value);
            ranges[ident] = identInfo.range;
        } else if (ruleName === 'stringLiteral') {
            let value = child.getText();
            tfInfo.contextBuffer = {};
            value = evalExpression(value, tfInfo);
            updateValue(tfInfo, configs, ident, value);
            ranges[ident] = identInfo.range;
        } else if (child.children) {
            traverse(tfInfo, parser, child, configs, ranges, identInfo);
        }
    }
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
            if (typeof val === 'string') {
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.substring(1, val.length - 1);
                }
                value = value.replace(match, val);
            }
        }
    } else {
        value = runEval(value, tfInfo);
    }
    if (processOutput) {
        value = processValue(value, tfInfo);
    }
    return value;
}

function runEval(exp, tfInfo, processOutput = false) {
    let value = exp;
    try {
        if (typeof exp === 'string') {
            if (exp.includes('var.')) {
                exp = exp.replace(/(var\.)([^. |\]}\r\n,]+)([^ |\]}\r\n,]*)/g, 'tfInfo.configs.variable.$2.default$3');
            }
            if (exp.includes('dependency.')) {
                exp = exp.replace(/dependency\.([^.]+)\.outputs\./g, 'tfInfo.configs.dependency.$1.mock_outputs.');
            }
            exp = exp.replace(/try\(/g, 'tryTerraform(');
        }
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

        value = jsepEval(exp, context);
        if (typeof value === 'string') {
            value = quote(value);
        }
        if (processOutput) {
            value = processValue(value, tfInfo);
        }
    } catch (e) {
        console.log('Failed to evaluate expression: ' + exp + ' Error: ' + e);
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
            value = value.substring(1, value.length - 1);
        } else if (value.startsWith('./') || value.startsWith('../')) {
            if (tfInfo.path?.root !== undefined) {
                value = path.resolve(tfInfo.path.root, value);
            }
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

function updateValue(tfInfo, obj, key, value, separator = '') {
    if (key !== undefined && obj !== undefined && key !== null && obj !== null) {
        if (Array.isArray(obj[key])) {
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
