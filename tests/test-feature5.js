// Dependency output navigation
// Also covers the find_in_parent_folders reference-matching fix

const fs = require('fs');
const path = require('path');
const os = require('os');

const TESTS_DIR = path.join(__dirname);
const CLUSTER_HCL = path.join(TESTS_DIR, 'env', 'region', 'cluster', 'terragrunt.hcl');
const VPC_DIR = path.join(TESTS_DIR, 'env', 'vpc');
const VPC_OUTPUTS_TF = path.join(VPC_DIR, 'outputs.tf');

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

// findMatchingReferences with the find_in_parent_folders fix
const PATTERNS = [
    { pattern: /(source\s*=\s*)"git::(ssh:\/\/|)(.*)\/\/([^#\r\n"?]+)(\?ref=(.*)")/, location: 'git' },
    { pattern: /((source|config_path|path)\s*=\s*")([^#\r\n"]+)/, location: 'local' },
    { pattern: /((find_in_parent_folders|file|read_terragrunt_config)\(")([^#\r\n"]+)/, location: 'enclosed' },
];

function findMatchingReferences(targetFsPath, fileContent, fileFsPath) {
    const targetNorm = targetFsPath.replace(/\\/g, '/');
    const fileDir = path.dirname(fileFsPath);
    const results = [];
    const lines = fileContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
        for (const p of PATTERNS) {
            const m = lines[i].match(p.pattern);
            if (!m) continue;
            const rawPath = m[3];
            if (!rawPath) break;
            if (p.location === 'git') break;
            // find_in_parent_folders walks up at runtime — match by basename only
            if (p.location === 'enclosed' && m[2] === 'find_in_parent_folders') {
                if (path.basename(rawPath) === path.basename(targetFsPath)) {
                    results.push({ line: i, start: m.index + m[1].length, end: m.index + m[0].trimEnd().length });
                }
                break;
            }
            let resolved;
            try {
                resolved = path.isAbsolute(rawPath) ? path.normalize(rawPath) : path.resolve(fileDir, rawPath);
            } catch {
                break;
            }
            const resolvedNorm = resolved.replace(/\\/g, '/');
            if (resolvedNorm === targetNorm || resolvedNorm.startsWith(targetNorm + '/')) {
                results.push({ line: i, start: m.index + m[1].length, end: m.index + m[0].trimEnd().length });
            }
            break;
        }
    }
    return results;
}

// ---- Test runner ----
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

// ---- Section 1: findDependencyOutputDefinition ----
console.log('--- findDependencyOutputDefinition ---');

const line1 = '  cluster = dependency.vpc.outputs.cluster_id';
assert(
    'detects depName=vpc outputKey=cluster_id',
    JSON.stringify(findDependencyOutputDefinition(line1, line1.indexOf('cluster_id'))) ===
        JSON.stringify({ depName: 'vpc', outputKey: 'cluster_id' }),
);
assert(
    'detects reference at start of token',
    findDependencyOutputDefinition(line1, line1.indexOf('dependency')) !== null,
);
assert('returns null when cursor is before the token', findDependencyOutputDefinition(line1, 2) === null);
assert('cursor well past the token returns null', findDependencyOutputDefinition(line1, line1.length + 5) === null);

const line2 = '  x = "${dependency.a.outputs.id}_${dependency.b.outputs.name}"';
assert(
    'finds first dep reference in interpolation',
    findDependencyOutputDefinition(line2, line2.indexOf('dependency.a'))?.depName === 'a',
);
assert(
    'finds second dep reference in interpolation',
    findDependencyOutputDefinition(line2, line2.indexOf('dependency.b'))?.depName === 'b',
);
assert('non-dependency line returns null', findDependencyOutputDefinition('  value = local.env', 10) === null);

// ---- Section 2: searchForOutput against real fixture (tests/env/vpc/outputs.tf) ----
console.log('--- searchForOutput (real tests/env/vpc/outputs.tf) ---');

assert('outputs.tf fixture exists', fs.existsSync(VPC_OUTPUTS_TF));

const r_vpc_id = searchForOutput('vpc_id', VPC_DIR);
assert('finds vpc_id in real vpc dir', r_vpc_id !== null);
assert('vpc_id found in outputs.tf', r_vpc_id?.file === VPC_OUTPUTS_TF);
assert('vpc_id found at line 0', r_vpc_id?.line === 0);

const r_private = searchForOutput('private_subnet_ids', VPC_DIR);
assert('finds private_subnet_ids', r_private !== null);
assert('private_subnet_ids at line 4', r_private?.line === 4);

assert('returns null for output not in vpc dir', searchForOutput('nonexistent', VPC_DIR) === null);

// Simulate navigateToDependencyOutput: cluster depends on vpc via config_path = "../../vpc"
const clusterDir = path.dirname(CLUSTER_HCL);
const resolvedVpcDir = path.resolve(clusterDir, '../../vpc');
assert('resolved vpc dir from cluster matches tests/env/vpc', resolvedVpcDir === VPC_DIR);
const r_nav = searchForOutput('vpc_id', resolvedVpcDir);
assert('navigateToDependencyOutput simulation: vpc_id found in resolved vpc dir', r_nav !== null);

// ---- Section 3: searchForOutput unit tests ----
console.log('--- searchForOutput (temporary fixture) ---');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-nav-f5-'));
const outputsTf = path.join(tmpDir, 'outputs.tf');
fs.writeFileSync(outputsTf, `output "cluster_id" {\n  value = "x"\n}\n\noutput "sg_id" {\n  value = "y"\n}\n`);

assert('finds cluster_id at line 0', searchForOutput('cluster_id', tmpDir)?.line === 0);
assert('finds sg_id at line 4', searchForOutput('sg_id', tmpDir)?.line === 4);
assert('returns null for nonexistent dir', searchForOutput('x', '/nonexistent/xyz') === null);
assert('returns null when dir is null', searchForOutput('x', null) === null);

// ---- Section 4: findMatchingReferences — find_in_parent_folders fix ----
console.log('--- findMatchingReferences: find_in_parent_folders fix ---');

// geo-us.hcl is found by walking UP from envs/prod/app — path.resolve would give wrong dir
const geoHclTarget = '/workspace/project/geo-us.hcl';
const content1 = `locals {\n  geo_vars = read_terragrunt_config(find_in_parent_folders("geo-us.hcl"))\n  geo_code = local.geo_vars.locals.geo_code\n}`;
const content2 = `locals {\n  geo_vars = read_terragrunt_config(find_in_parent_folders("geo-us.hcl"))\n}`;
const contentOther = `locals {\n  region_vars = read_terragrunt_config(find_in_parent_folders("region.hcl"))\n}`;

const r1 = findMatchingReferences(geoHclTarget, content1, '/workspace/project/envs/prod/app/terragrunt.hcl');
assert('geo-us.hcl match from depth prod/app (old path.resolve bug = 0)', r1.length === 1);

const r2 = findMatchingReferences(geoHclTarget, content2, '/workspace/project/envs/prod/cluster/terragrunt.hcl');
assert('same filename from different depth also matches', r2.length === 1);

const rOther = findMatchingReferences(geoHclTarget, contentOther, '/workspace/project/envs/prod/app/terragrunt.hcl');
assert('find_in_parent_folders("region.hcl") does NOT match geo-us.hcl', rOther.length === 0);

// Regular relative path references (non find_in_parent_folders) still resolve correctly
const relContent = `source = "../../modules/vpc"`;
const rRel = findMatchingReferences(
    '/workspace/project/modules/vpc',
    relContent,
    '/workspace/project/envs/prod/terragrunt.hcl',
);
assert('regular relative source path still resolves correctly', rRel.length === 1);

// ---- Section 5: findMatchingReferences against real cluster fixture ----
console.log('--- findMatchingReferences: real cluster.hcl ---');

const clusterContent = fs.readFileSync(CLUSTER_HCL, 'utf8');

// cluster has find_in_parent_folders("vpc.hcl") but it is EMBEDDED inside a git
// source line, so the git pattern fires first and enclosed is never reached —
// the vpc.hcl there is NOT a separate navigable local reference
const vpcHclTarget = path.join(path.dirname(CLUSTER_HCL), '..', '..', 'vpc.hcl');
const rVpcHcl = findMatchingReferences(vpcHclTarget, clusterContent, CLUSTER_HCL);
assert(
    'find_in_parent_folders("vpc.hcl") inside git source line is NOT matched (git pattern fires first)',
    rVpcHcl.length === 0,
);

// config_path = "../../vpc" resolves to tests/env/vpc and should match
const vpcDirTarget = path.resolve(path.dirname(CLUSTER_HCL), '../../vpc');
const rVpcDir = findMatchingReferences(vpcDirTarget, clusterContent, CLUSTER_HCL);
assert('cluster config_path "../../vpc" matches vpc dir target', rVpcDir.length >= 1);

// find_in_parent_folders(local.region_file) uses a variable — not matched (no literal string arg)
const regionHclTarget = path.join(path.dirname(CLUSTER_HCL), '..', 'region.hcl');
const rRegion = findMatchingReferences(regionHclTarget, clusterContent, CLUSTER_HCL);
assert('find_in_parent_folders(local.var) not matched (no literal string)', rRegion.length === 0);

// Cleanup
fs.rmSync(tmpDir, { recursive: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
