const antlr4 = require('antlr4');
const hclLexer = require('./generated-cjs/hclLexer').default;
const hclParser = require('./generated-cjs/hclParser').default;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let globalTfInfo = {};

function traverse(tfInfo, parser, node, configs, ranges, identInfo) {
    if (!node || !node.children || typeof node.children !== 'object') {
        return;
    }

    let ident = identInfo ? identInfo.name : null;
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
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
            for (let j = 0; j < child.children.length; j++) {
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
            const identInfo = {
                name: name,
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
            traverse(tfInfo, parser, child, configs, ranges, identInfo);
            ident = identInfo.name;
            if (identInfo.evalNeeded) {
                tfInfo.contextBuffer = {};
                configs[ident] = evalExpression(configs[ident], tfInfo);
            }
            configs[ident] = processValue(configs[ident], tfInfo);
        } else if (ruleName === 'expression') {
            let obj = {};
            let objRanges = {};
            const childIdentInfo = { name: 'expression', range: identInfo.range };
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
        } else if (ruleName === 'unaryOperator') {
            let value = child.getText();
            updateValue(tfInfo, configs, ident, value);
            traverse(tfInfo, parser, child, configs, ranges, identInfo);
            identInfo.evalNeeded = true;
        } else if (ruleName === 'binaryOperator') {
            let value = child.getText();
            updateValue(tfInfo, configs, ident, value);
            traverse(tfInfo, parser, child, configs, ranges, identInfo);
            identInfo.evalNeeded = true;
        } else if (ruleName === 'conditional') {
            let obj = {};
            const childIdentInfo = { name: 'conditional', range: identInfo.range };
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
            const childIdentInfo = { name: 'index', range: identInfo.range };
            traverse(tfInfo, parser, child, obj, ranges, childIdentInfo);
            let index = obj.index;
            updateValue(tfInfo, configs, ident, index);
            childIdentInfo.evalNeeded = true;
        } else if (ruleName === 'forTupleExpr') {
            try {
                let forRule = child.children[1].children.map((child) => child.getText());
                let key = forRule[1];
                tfInfo.contextBuffer = {};
                let list = evalExpression(forRule[3], tfInfo);
                let valueExp = child.children[2].getText();
                let condition = null;
                if (child.children.length > 4) {
                    condition = child.children[3].children[1].getText();
                }

                let result = [];
                list.forEach((item) => {
                    tfInfo.contextBuffer[key] = item;
                    let conditionValue = condition != null ? evalExpression(condition, tfInfo) : true;
                    if (conditionValue) {
                        result.push(evalExpression(valueExp, tfInfo, true));
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
                let valueExp = child.children[4].getText();
                let condition = null;
                if (child.children.length > 5) {
                    condition = child.children[5].children[1].getText();
                }

                let result = {};
                list.forEach((item) => {
                    tfInfo.contextBuffer[key] = item;
                    conditionValue = condition != null ? evalExpression(condition, tfInfo) : true;
                    if (conditionValue) {
                        let key = evalExpression(keyExp, tfInfo, true);
                        let value = evalExpression(valueExp, tfInfo, true);
                        result[key] = value;
                    }
                });

                configs[ident] = result;
                ranges[ident] = identInfo.range;
            } catch (e) {
                console.log('Error in forObjectExpr: ' + e);
            }
        } else if (ruleName === 'functionCall') {
            const childIdentInfo = { name: 'functionCall', range: identInfo.range };
            let funcName = child.children[0].getText();
            let obj = {};
            traverse(tfInfo, parser, child, obj, ranges, childIdentInfo);
            let args = obj.functionCall !== undefined ? obj.functionCall : '';
            let funcString = funcName + '(' + args + ')';
            tfInfo.contextBuffer = { args: args };
            configs[ident] = evalExpression(funcString, tfInfo);
            ranges[ident] = identInfo.range;
        } else if (ruleName == 'functionArgs') {
            const childIdentInfo = { name: 'functionArgs', range: identInfo.range };
            if (child.children) {
                for (let j = 0; j < child.children.length; j++) {
                    let obj = { functionArgs: '' };
                    traverse(tfInfo, parser, child.children[j], obj, ranges, childIdentInfo);
                    if (obj.functionArgs !== '') {
                        updateValue(tfInfo, configs, ident, obj.functionArgs, ',');
                    }
                }
            }
        } else if (ruleName === 'basicLiterals' || ruleName === 'variableExpr') {
            let value = child.getText();
            updateValue(tfInfo, configs, ident, value);
            ranges[ident] = identInfo.range;
        } else if (ruleName === 'boolean') {
            let value = child.getText() == 'true';
            updateValue(tfInfo, configs, ident, value);
            ranges[ident] = identInfo.range;
        } else if (ruleName === 'interpolatedString') {
            let value = child.getText();
            tfInfo.contextBuffer = {};
            value = value.substring(1, value.length - 1);
            value = evalExpression(value, tfInfo);
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

function abs(value) {
    return Math.abs(value);
}

function can(exp) {
    try {
        eval(exp);
        return true;
    } catch (e) {
        return false;
    }
}

function ceil(value) {
    return Math.ceil(value);
}

function concat(...lists) {
    return [].concat(...lists);
}

function contains(list, value) {
    return list.includes(value);
}

function endswith(value, suffix) {
    return value.endsWith(suffix);
}

function file(filePath) {
    if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(globalTfInfo.path.root, filePath);
    }
    if (!fs.existsSync(filePath)) {
        return 'FileNotFound';
    }
    return fs.readFileSync(filePath, 'utf8');
}

function filebase64sha256(filePath) {
    let content = file(filePath);
    return crypto.createHash('sha256').update(content).digest('base64');
}

function floor(value) {
    return Math.floor(value);
}

function format(formatString, ...args) {
    return formatString.replace(/%([#vbtbodxXeEfFgGsq%])/g, (match, specifier) => {
        if (specifier === '%') {
            return '%';
        }
        const value = args.shift();
        switch (specifier) {
            case 'v':
                return String(value);
            case '#v':
                return JSON.stringify(value);
            case 't':
                return Boolean(value).toString();
            case 'b':
                return parseInt(value, 10).toString(2);
            case 'd':
                return parseInt(value, 10).toString(10);
            case 'o':
                return parseInt(value, 10).toString(8);
            case 'x':
                return parseInt(value, 10).toString(16);
            case 'X':
                return parseInt(value, 10).toString(16).toUpperCase();
            case 'e':
                return Number(value).toExponential();
            case 'E':
                return Number(value).toExponential().toUpperCase();
            case 'f':
                return Number(value).toFixed();
            case 'g':
                return Number(value).toPrecision();
            case 'G':
                return Number(value).toPrecision().toUpperCase();
            case 's':
                return String(value);
            case 'q':
                return JSON.stringify(String(value));
            default:
                return match;
        }
    });
}

function join(separator, list) {
    return list.join(separator);
}

function jsonencode(value) {
    return JSON.stringify(value);
}

function jsondecode(value) {
    return JSON.parse(value);
}

function length(value) {
    if (typeof value === 'string' || Array.isArray(value)) {
        return value.length;
    } else if (value instanceof Map) {
        return value.size;
    } else if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length;
    } else {
        console.log('Unsupported type for size function');
        return 0;
    }
}

function lookup(map, key, defaultValue = null) {
    return map.hasOwnProperty(key) ? map[key] : defaultValue;
}

function lower(value) {
    return value.toLowerCase();
}

function max(...values) {
    return Math.max(...values);
}

function merge(...maps) {
    return Object.assign({}, ...maps);
}

function min(...values) {
    return Math.min(...values);
}

function parseint(value, base = 10) {
    return parseInt(value, base);
}

function pow(base, exponent) {
    return Math.pow(base, exponent);
}

function range(start, end) {
    return Array.from({ length: end - start }, (_, i) => i + start);
}

function replace(value, search, replacement) {
    return value.split(search).join(replacement);
}

function reverse(list) {
    return list.slice().reverse();
}

function sha1(value) {
    return crypto.createHash('sha1').update(value).digest('hex');
}

function signum(value) {
    return Math.sign(value);
}

function sort(list) {
    return list.slice().sort();
}

function split(separator, value) {
    return value.split(separator);
}

function sqrt(value) {
    return Math.sqrt(value);
}

function startswith(value, prefix) {
    return value.startsWith(prefix);
}

function strlen(value) {
    return value.length;
}

function substr(value, start, length) {
    return value.substr(start, length);
}

function timestamp() {
    return new Date().toISOString();
}

function tomap(map) {
    return map;
}

function trimspace(value) {
    return value.trim();
}

function upper(value) {
    return value.toUpperCase();
}

function uuid() {
    return crypto.randomBytes(16).toString('hex');
}

function get_aws_account_id() {
    if (process.env.AWS_ACCOUNT_ID) {
        return process.env.AWS_ACCOUNT_ID;
    }

    return '123456789012';
}

function find_in_parent_folders(fileName = null) {
    if (fileName === null) {
        fileName = 'terragrunt.hcl';
    }
    let currentDir = path.dirname(globalTfInfo.path.root);
    while (currentDir !== '/') {
        let filePath = path.join(currentDir, fileName);
        if (fs.existsSync(filePath)) {
            return filePath;
        }
        currentDir = path.dirname(currentDir);
    }
    return null;
}

function read_terragrunt_config(filePath, tfInfo = {}) {
    let configStartDir = null;
    console.log('Reading file:', filePath);
    if (path.isAbsolute(filePath)) {
        configStartDir = path.dirname(filePath);
    } else if (!globalTfInfo.path.root) {
        throw new Error('startDir is not provided');
    } else {
        filePath = path.resolve(globalTfInfo.path.root, filePath);
    }

    if (tfInfo.freshStart) {
        if (tfInfo.configs === undefined) {
            tfInfo.configs = {};
        }
        if (tfInfo.ranges === undefined) {
            tfInfo.ranges = {};
        }
        tfInfo.path = {
            module: configStartDir,
            root: configStartDir,
            cwd: configStartDir,
        };
        tfInfo.terraform = {
            workspace: 'default',
        };
        tfInfo.contextBuffer = null;
        tfInfo.tfConfigCount = 0;
        globalTfInfo = tfInfo;
        tfInfo.freshStart = false;
    } else {
        tfInfo.path = globalTfInfo.path;
        tfInfo.terraform = globalTfInfo.terraform;
        tfInfo.tfConfigCount = globalTfInfo.tfConfigCount;
        tfInfo.contextBuffer = null;
        tfInfo.configs = {};
        tfInfo.ranges = {};
    }
    tfInfo.tfConfigCount++;

    const input = fs.readFileSync(filePath, 'utf8');
    const chars = new antlr4.InputStream(input);
    const lexer = new hclLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    const parser = new hclParser(tokens);
    parser.buildParseTrees = true;
    const tree = parser.configFile();

    //console.log(tree.toStringTree(parser.ruleNames));
    traverse(tfInfo, parser, tree, tfInfo.configs, tfInfo.ranges, null);

    return tfInfo.configs;
}

function path_relative_from_include(includeName = null, configs = globalTfInfo.configs) {
    let includePath = '';
    if (!includeName) {
        includePath = configs && configs.include ? configs.include : null;
    } else {
        includePath = configs && configs.include ? configs.include[includeName] : null;
    }

    if (!includePath || includePath === undefined) {
        return null;
    }

    let includeDir = path.dirname(includePath);
    let relativePath = path.relative(includeDir, globalTfInfo.path.root);
    return relativePath;
}

function evalExpression(exp, tfInfo, processOutput = false) {
    if (typeof exp !== 'string') {
        return exp;
    }

    let value = exp;
    let matches = value.match(/\$\{([^}]+)\}/g);
    if (matches) {
        for (let i = 0; i < matches.length; i++) {
            let match = matches[i];
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
                exp = exp.replace(/var\./g, 'tfInfo.configs.variable.');
            }
            if (exp.includes('dependency.')) {
                exp = exp.replace(/dependency\.([^.]+)\.outputs\./g, 'tfInfo.configs.dependency.$1.mock_outputs.');
            }
        }
        let context = {
            path: tfInfo.path,
            terraform: tfInfo.terraform,
            configs: tfInfo.configs,
            module: tfInfo.configs.module,
            data: tfInfo.configs.data,
            local: tfInfo.configs.locals,
        };
        if (tfInfo.contextBuffer) {
            context = Object.assign(context, tfInfo.contextBuffer);
        }
        //console.log("Evaluating expression: " + exp);
        value = (function () {
            with (context) {
                let val = eval(exp);
                val = quote(val);
                return val;
            }
        })();
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
            value === 'true';
        } else if (!isNaN(value)) {
            value = Number(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
        } else if (value.startsWith('./') || value.startsWith('../')) {
            if (tfInfo.path !== undefined && globalTfInfo.path.root !== undefined) {
                value = path.resolve(globalTfInfo.path.root, value);
            }
        }
    } else if (value === undefined) {
        value = 'undefined';
    }
    return value;
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

const Terragrunt = {
    find_in_parent_folders: find_in_parent_folders,
    read_terragrunt_config: read_terragrunt_config,
    evalExpression: evalExpression,
    processValue: processValue,
};

module.exports = Terragrunt;
if (require.main === module) {
    let tfInfo = {
        freshStart: true,
        configs: {},
        ranges: {},
        tfConfigCount: 0,
    };
    try {
        let filePath = process.argv[2];
        let printRange = false;
        if (process.argv.length > 3) {
            printRange = process.argv[3] === 'true';
        }

        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(filePath);
        }
        console.log('Reading config for ' + filePath);
        if (path.basename(filePath) === 'main.tf') {
            let varFile = filePath.replace('main.tf', 'variables.tf');
            if (fs.existsSync(varFile)) {
                console.log('Reading variables for main.tf ' + varFile);
                this.configs = read_terragrunt_config(varFile, tfInfo);
            }
        }
        tfInfo.freshStart = true;
        configs = read_terragrunt_config(filePath, tfInfo);
        console.log(JSON.stringify(tfInfo.configs, null, 2));
        if (printRange) {
            console.log(JSON.stringify(tfInfo.ranges, null, 2));
        }
    } catch (e) {
        console.log('Failed to read terragrunt config: ' + e);
        console.log(tfInfo.configs);
    }
}
