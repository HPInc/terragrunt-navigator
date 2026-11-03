// Unit tests verifying safe path initialization and find_in_parent_folders resilience (#22)

const path = require('path');
const fs = require('fs');
const Terragrunt = require('../terragrunt');
const Parser = require('../parser');

let passed = 0;
let failed = 0;

function assert(desc, cond) {
    if (cond) {
        console.log('  PASS:', desc);
        passed++;
    } else {
        console.error('  FAIL:', desc);
        failed++;
    }
}

console.log('--- Path resilience & uninitialized path.root ---');

// 1. find_in_parent_folders with undefined path should not throw
let noThrowFind = false;
try {
    const uninitTfInfo = { freshStart: true };
    const res = Terragrunt.find_in_parent_folders.apply(uninitTfInfo, ['nonexistent.hcl']);
    noThrowFind = (res === null);
} catch (e) {
    console.error('Caught unexpected error in find_in_parent_folders:', e);
}
assert('find_in_parent_folders does not throw when this.path is undefined', noThrowFind);

// 2. find_in_parent_folders with populated root finds real parent file
const clusterDir = path.resolve(__dirname, 'env/region/cluster');
const clusterHcl = path.join(clusterDir, 'terragrunt.hcl');
const populatedTfInfo = {
    path: {
        root: clusterDir,
        module: clusterDir,
        cwd: clusterDir,
    },
};
const foundVpc = Terragrunt.find_in_parent_folders.apply(populatedTfInfo, ['vpc.hcl']);
assert('find_in_parent_folders finds vpc.hcl in parent directory', typeof foundVpc === 'string' && foundVpc.endsWith('vpc.hcl'));

// 3. evalExpression does not throw on relative path when tfInfo.path is undefined
let noThrowEval = false;
try {
    const res = Parser.evalExpression('"../../modules/vpc"', { freshStart: true });
    noThrowEval = (typeof res === 'string');
} catch (e) {
    console.error('Caught unexpected error in evalExpression:', e);
}
assert('evalExpression handles relative path without throwing when tfInfo.path is undefined', noThrowEval);

// 4. Default no-arg find_in_parent_folders resolves to terragrunt.hcl in parent
const foundTerragrunt = Terragrunt.find_in_parent_folders.apply(populatedTfInfo, []);
assert('find_in_parent_folders defaults to searching for terragrunt.hcl', typeof foundTerragrunt === 'string' && foundTerragrunt.endsWith('terragrunt.hcl'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
}
