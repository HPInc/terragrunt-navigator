const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function abs(value) {
    return Math.abs(value);
}

function abspath(value) {
    return path.resolve(this.path.root, value);
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

function cidrsubnet(cidr, newbits, netnum) {
    let parts = cidr.split('/');
    let ip = parts[0];
    let mask = parseInt(parts[1], 10);
    let newmask = mask + newbits;
    let newcidr = ip + '/' + newmask;
    return newcidr;
}

function concat(...lists) {
    return [].concat(...lists);
}

function coalesce(...values) {
    for (let value of values) {
        if (value !== null && value !== '') {
            return value;
        }
    }
    return null;
}

function contains(list, value) {
    return list.includes(value);
}

function endswith(value, suffix) {
    return value.endsWith(suffix);
}

function file(filePath) {
    if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(this.path.root, filePath);
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
    return formatString.replace(/%([#vtbodxXeEfFgGsq%])/g, (match, specifier) => {
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

function index(list, value) {
    return list.indexOf(value);
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

function keys(map) {
    return Object.keys(map);
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

function list(values) {
    return [values];
}

function log(value) {
    return Math.log(value);
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

function object(values) {
    return values;
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

function regex(pattern, value) {
    return new RegExp(pattern).test(value);
}

function replace(value, search, replacement) {
    return value.split(search).join(replacement);
}

function reverse(list) {
    return list.slice().reverse();
}

function setproduct(...lists) {
    return lists.reduce((acc, list) => acc.flatMap((x) => list.map((y) => x.concat([y]))), [[]]);
}

function sha1(value) {
    return crypto.createHash('sha1').update(value).digest('hex');
}

function signum(value) {
    return Math.sign(value);
}

function slice(list, start, end) {
    return list.slice(start, end);
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

function tolist(list) {
    return list;
}

function tomap(map) {
    return map;
}

function trimspace(value) {
    return value.trim();
}

function tryTerraform(...expressions) {
    for (const expression of expressions) {
        try {
            return expression();
        } catch (e) {
            continue;
        }
    }
    return null;
}

function upper(value) {
    return value.toUpperCase();
}

function uuid() {
    return crypto.randomBytes(16).toString('hex');
}

const Terraform = {
    abs,
    abspath,
    can,
    ceil,
    cidrsubnet,
    concat,
    coalesce,
    contains,
    endswith,
    file,
    filebase64sha256,
    floor,
    format,
    index,
    join,
    jsonencode,
    jsondecode,
    keys,
    length,
    list,
    log,
    lookup,
    lower,
    max,
    merge,
    min,
    object,
    parseint,
    pow,
    range,
    regex,
    replace,
    reverse,
    setproduct,
    sha1,
    signum,
    slice,
    sort,
    split,
    sqrt,
    startswith,
    strlen,
    substr,
    timestamp,
    tomap,
    tolist,
    trimspace,
    tryTerraform,
    upper,
    uuid,
};

module.exports = Terraform;
