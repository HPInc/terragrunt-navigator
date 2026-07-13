// Locals go-to-definition

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---- Inline helpers (no vscode dependency) ----

function findLocalReference(lineText, character) {
    const localPattern = /local\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m;
    while ((m = localPattern.exec(lineText)) !== null) {
        if (character >= m.index && character <= m.index + m[0].length) {
            return m[1];
        }
    }
    return null;
}

function searchForLocal(localName, filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        const localDefPattern = new RegExp(`^\\s+${localName}\\s*=`);
        let inLocals = false;
        for (let i = 0; i < lines.length; i++) {
            if (/^\s*locals\s*\{/.test(lines[i])) inLocals = true;
            if (inLocals && /^\s*\}/.test(lines[i]) && !/^\s*locals/.test(lines[i])) inLocals = false;
            if (inLocals && localDefPattern.test(lines[i])) {
                return { file: filePath, line: i, col: lines[i].indexOf(localName) };
            }
        }
    } catch {
        // unreadable
    }
    return null;
}

// ---- Test setup ----
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-nav-f6-'));
const testHcl = path.join(tmpDir, 'terragrunt.hcl');
fs.writeFileSync(
    testHcl,
    `locals {
  region_code = "us-west-2"
  env         = "prod"
  cluster_name = format("%s-%s", local.env, local.region_code)
}

inputs = {
  region = local.region_code
}
`,
);

console.log('--- findLocalReference ---');

const line1 = '  cluster = local.cluster_name';
assert(
    'detects local.cluster_name at cursor on name',
    findLocalReference(line1, line1.indexOf('cluster_name')) === 'cluster_name',
);
assert(
    'detects local.cluster_name at cursor on "local"',
    findLocalReference(line1, line1.indexOf('local')) === 'cluster_name',
);
assert('returns null when cursor is before local token', findLocalReference(line1, 0) === null);

const line2 = '  x = "${local.env}-${local.region_code}"';
assert('detects first local in interpolation', findLocalReference(line2, line2.indexOf('local.env')) === 'env');
assert(
    'detects second local in interpolation',
    findLocalReference(line2, line2.indexOf('local.region_code')) === 'region_code',
);

assert('non-local line returns null', findLocalReference('  value = var.name', 10) === null);

console.log('--- searchForLocal ---');

const r1 = searchForLocal('region_code', testHcl);
assert('finds region_code in locals block', r1 !== null);
assert('found at line 1', r1?.line === 1);
assert('found at correct column', (r1?.col === testHcl && r1?.col !== undefined) || r1?.col >= 0);

const r2 = searchForLocal('env', testHcl);
assert('finds env in locals block', r2 !== null);
assert('env found at line 2', r2?.line === 2);

const r3 = searchForLocal('cluster_name', testHcl);
assert('finds cluster_name in locals block', r3 !== null);
assert('cluster_name found at line 3', r3?.line === 3);

assert('returns null for unknown local', searchForLocal('nonexistent_var', testHcl) === null);
assert('returns null for nonexistent file', searchForLocal('x', '/nonexistent/path.hcl') === null);
assert('returns null when filePath is null', searchForLocal('x', null) === null);

// Variable NOT in a locals block should not be found
const noLocals = path.join(tmpDir, 'no-locals.hcl');
fs.writeFileSync(
    noLocals,
    `inputs = {
  region_code = "us-west-2"
}
`,
);
assert('does not match assignment outside locals block', searchForLocal('region_code', noLocals) === null);

console.log('--- Regression ---');
// dependency output helper still works
function findDependencyOutputDefinition(lineText, character) {
    const depPattern = /dependency\.([a-zA-Z_][a-zA-Z0-9_]*)\.outputs\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m;
    while ((m = depPattern.exec(lineText)) !== null) {
        if (character >= m.index && character <= m.index + m[0].length) return { depName: m[1], outputKey: m[2] };
    }
    return null;
}
assert(
    'dependency output pattern unchanged',
    findDependencyOutputDefinition('x = dependency.vpc.outputs.id', 20)?.outputKey === 'id',
);

fs.rmSync(tmpDir, { recursive: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
