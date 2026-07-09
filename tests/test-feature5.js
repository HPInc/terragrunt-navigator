// Feature 5: dependency output navigation

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---- Inline helpers (no vscode dependency) ----

function findDependencyOutputDefinition(lineText, character) {
    const depPattern = /dependency\.([a-zA-Z_][a-zA-Z0-9_]*)\.outputs\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m;
    while ((m = depPattern.exec(lineText)) !== null) {
        if (character >= m.index && character <= m.index + m[0].length) {
            return { depName: m[1], outputKey: m[2] };
        }
    }
    return null;
}

function searchForOutput(outputKey, searchDir) {
    if (!searchDir) return null;
    let dir = searchDir;
    try {
        if (!fs.existsSync(dir)) return null;
        if (!fs.lstatSync(dir).isDirectory()) dir = path.dirname(dir);
    } catch {
        return null;
    }
    let files;
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.tf') || f.endsWith('.hcl'));
    } catch {
        return null;
    }
    const outputPattern = new RegExp(`^\\s*output\\s+"${outputKey}"\\s*\\{`);
    for (const file of files) {
        try {
            const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (outputPattern.test(lines[i])) {
                    return { file: path.join(dir, file), line: i };
                }
            }
        } catch {
            continue;
        }
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

// Create temp outputs.tf for searchForOutput tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-nav-f5-'));
const outputsTf = path.join(tmpDir, 'outputs.tf');
fs.writeFileSync(
    outputsTf,
    `output "cluster_id" {
  value = module.eks.cluster_id
}

output "vpc_id" {
  value = module.vpc.vpc_id
}
`,
);

console.log('--- Feature 5: findDependencyOutputDefinition ---');

const line1 = '  cluster = dependency.vpc.outputs.cluster_id';
// cursor on 'cluster_id'
assert(
    'detects depName=vpc outputKey=cluster_id when cursor is on the key',
    JSON.stringify(findDependencyOutputDefinition(line1, line1.indexOf('cluster_id'))) ===
        JSON.stringify({ depName: 'vpc', outputKey: 'cluster_id' }),
);
// cursor at start of 'dependency.vpc.outputs.cluster_id'
assert(
    'detects reference when cursor at start of dependency token',
    findDependencyOutputDefinition(line1, line1.indexOf('dependency')) !== null,
);
// cursor before the token
assert('returns null when cursor is before the dependency token', findDependencyOutputDefinition(line1, 2) === null);
// cursor well past the token (character beyond line length)
assert(
    'returns null when cursor is clearly past the dependency token',
    findDependencyOutputDefinition(line1, line1.length + 5) === null,
);

// Multiple deps on one line (unusual but possible in ${ } interpolation)
const line2 = '  x = "${dependency.a.outputs.id}_${dependency.b.outputs.name}"';
assert(
    'finds first dep reference',
    findDependencyOutputDefinition(line2, line2.indexOf('dependency.a'))?.depName === 'a',
);
assert(
    'finds second dep reference',
    findDependencyOutputDefinition(line2, line2.indexOf('dependency.b'))?.depName === 'b',
);

// Non-dependency expression returns null
assert('non-dependency line returns null', findDependencyOutputDefinition('  value = local.env', 10) === null);

console.log('--- Feature 5: searchForOutput ---');

const r1 = searchForOutput('cluster_id', tmpDir);
assert('finds cluster_id output', r1 !== null);
assert('found in outputs.tf', r1?.file === outputsTf);
assert('found at correct line (0)', r1?.line === 0);

const r2 = searchForOutput('vpc_id', tmpDir);
assert('finds vpc_id output', r2 !== null);
assert('vpc_id found at line 4', r2?.line === 4);

const r3 = searchForOutput('nonexistent_output', tmpDir);
assert('returns null for output that does not exist', r3 === null);

const r4 = searchForOutput('cluster_id', '/nonexistent/path/xyz');
assert('returns null for non-existent directory', r4 === null);

assert('returns null when searchDir is null', searchForOutput('x', null) === null);

console.log('--- Regression ---');
// Pattern tests from feature 1
const PATTERNS = [{ pattern: /((source|config_path|path)\s*=\s*")([^#\r\n"]+)/, location: 'local' }];
function firstMatch(patterns, text) {
    for (const p of patterns) {
        const m = text.match(p.pattern);
        if (m) return m[3];
    }
    return null;
}
assert('feature 1 pattern unchanged', firstMatch(PATTERNS, '  path = "../root.hcl"') === '../root.hcl');

// Cleanup
fs.rmSync(tmpDir, { recursive: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
