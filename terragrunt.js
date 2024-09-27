const antlr4 = require('antlr4');
const hclLexer = require('./generated-cjs/hclLexer').default;
const hclParser = require('./generated-cjs/hclParser').default;
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

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
    let currentDir = path.dirname(this.path.root);
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
    } else if (!this.path.root) {
        throw new Error('startDir is not provided');
    } else {
        filePath = path.resolve(this.path.root, filePath);
    }

    if (this.freshStart) {
        this.path = {
            module: configStartDir,
            root: configStartDir,
            cwd: configStartDir,
        };
        this.terraform = {
            workspace: 'default',
        };
        this.freshStart = false;
    }
    this.contextBuffer = null;

    tfInfo.path = this.path;
    tfInfo.terraform = this.terraform;
    tfInfo.configs = tfInfo.configs === undefined ? {} : tfInfo.configs;
    tfInfo.ranges = tfInfo.ranges === undefined ? {} : tfInfo.ranges;

    const input = fs.readFileSync(filePath, 'utf8');
    const chars = new antlr4.InputStream(input);
    const lexer = new hclLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    const parser = new hclParser(tokens);
    parser.buildParseTrees = true;
    const tree = parser.configFile();

    if (this.printTree) {
        console.log(tree.toStringTree(parser.ruleNames));
    }
    this.traverse(tfInfo, parser, tree, tfInfo.configs, tfInfo.ranges, null);

    return tfInfo.configs;
}

function path_relative_from_include(includeName = null, configs = this.configs) {
    let includePath = '';
    if (includeName) {
        includePath = configs?.include ? configs.include[includeName] : null;
    } else {
        includePath = configs?.include ? configs.include : null;
    }

    if (!includePath || includePath === undefined) {
        return null;
    }

    let includeDir = path.dirname(includePath);
    let relativePath = path.relative(includeDir, this.path.root);
    return relativePath;
}

function fetch_key_info(configs, ranges, depth = 0) {
    if (configs === null || configs === undefined) {
        return;
    }

    for (let key in configs) {
        if (ranges?.hasOwnProperty(key)) {
            let value = configs[key];
            let range = ranges[key];
            if (Array.isArray(value) && Array.isArray(range)) {
                print_key_info(value, range[range.length - 1], depth);
                for (let i = 0; i < value.length; i++) {
                    let v = value[i];
                    let r = range[i];
                    if (typeof v === 'object' && v !== null) {
                        fetch_key_info(v, r, depth + 1);
                    } else {
                        print_key_info(v, r, depth + 1);
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                print_key_info(value, range, depth);
                fetch_key_info(value, range, depth + 1);
            } else {
                print_key_info(value, range, depth);
            }
        }
    }
}

function print_key_info(value, range, depth) {
    if (range?.hasOwnProperty('__range')) {
        let r = range.__range;
        let indent = ' '.repeat(depth * 2);
        let message;

        if (value === null) {
            message = 'null';
        } else if (typeof value === 'object') {
            let jsonString = JSON.stringify(value, null, 2);
            let jsonLines = jsonString.split('\n');
            message = jsonLines.map((line) => indent + line).join('\n');
        } else if (typeof value === 'string') {
            message = `${indent}"${value}"`;
        } else {
            message = `${indent}${value.toString()}`;
        }

        console.error(`${message} => {${r.sl}, ${r.sc}, ${r.el}, ${r.ec}}`);
    }
}

const Terragrunt = {
    get_aws_account_id,
    find_in_parent_folders,
    read_terragrunt_config,
    path_relative_from_include,
};

module.exports = Terragrunt;

if (require.main === module) {
    const Parser = require('./parser');

    const argv = minimist(process.argv.slice(2), {
        boolean: ['printTree', 'printRange', 'printKeyInfo', 'allFiles'],
        string: ['file'],
        alias: { t: 'printTree', r: 'printRange', k: 'printKeyInfo', f: 'file', a: 'allFiles' },
    });

    let tfInfo = {
        freshStart: true,
        printTree: argv.printTree || false,
        traverse: Parser.traverse,
        configs: {
            variable: {},
        },
    };

    try {
        let filePath = argv.file;

        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(filePath);
        }

        // If the same directory contains input.json, read the input.json file
        let baseDir = path.dirname(filePath);
        let inputJson = path.join(baseDir, 'input.json');
        if (fs.existsSync(inputJson)) {
            tfInfo.configs.variable = {};
            console.log('Reading input file: ' + inputJson);
            let input = fs.readFileSync(inputJson, 'utf8');
            let inputs = JSON.parse(input);
            tfInfo.configs.variable = Object.assign(tfInfo.configs.variable, inputs['inputs']);
        }

        if (argv.allFiles) {
            // Read all the .tf files in the same directory
            let files = fs.readdirSync(baseDir);
            files.forEach((file) => {
                let tfFile = path.join(baseDir, file);
                if (file.endsWith('.tf') && tfFile !== filePath) {
                    tfInfo.freshStart = true;
                    read_terragrunt_config.apply(tfInfo, [tfFile, tfInfo]);
                }
            });
        }

        tfInfo.freshStart = true;
        read_terragrunt_config.apply(tfInfo, [filePath, tfInfo]);

        console.log(JSON.stringify(tfInfo.configs, null, 2));
        if (argv.printRange) {
            console.error(JSON.stringify(tfInfo.ranges, null, 2));
        }
        if (argv.printKeyInfo) {
            fetch_key_info(tfInfo.configs, tfInfo.ranges);
        }
    } catch (e) {
        console.log('Failed to read terragrunt config: ' + e);
        console.log(tfInfo.configs);
    }
}
