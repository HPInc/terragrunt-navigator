// Find All References — tests for the pure findMatchingReferences helper

const path = require('path');

const PATTERNS = [
    {
        pattern: /(source\s*=\s*)"git::(ssh:\/\/|)(.*)\/\/([^#\r\n"?]+)(\?ref=(.*)")/,
        location: 'git',
    },
    {
        pattern: /((source|config_path|path)\s*=\s*")([^#\r\n"]+)/,
        location: 'local',
    },
    {
        pattern: /((find_in_parent_folders|file|read_terragrunt_config)\(")([^#\r\n"]+)/,
        location: 'enclosed',
    },
];

// Inline the helper so the test doesn't need vscode
function findMatchingReferences(patterns, targetFsPath, fileContent, fileFsPath) {
    const targetNorm = targetFsPath.replace(/\\/g, '/');
    const fileDir = path.dirname(fileFsPath);
    const results = [];
    const lines = fileContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
        for (const p of patterns) {
            const m = lines[i].match(p.pattern);
            if (!m) continue;
            const rawPath = m[3];
            if (!rawPath) break;
            if (p.location === 'git') break;
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

// Simulate workspace root
const BASE = '/workspace/project';

console.log('--- findMatchingReferences ---');

// Two callers in different subdirectories both resolving to the same module
const moduleTarget = BASE + '/modules/vpc';
// From /workspace/project/envs/prod/  →  ../../modules/vpc
const caller1Content = `
locals { env = "prod" }
source = "../../modules/vpc"
`;
// From /workspace/project/envs/prod/app/  →  ../../../modules/vpc
const caller2Content = `
source = "../../../modules/vpc"
`;
const caller3Content = `
source = "${BASE}/modules/vpc"
`;
const nonMatchContent = `
source = "../../modules/eks"
`;
const gitContent = `
source = "git::https://github.com/org/repo//modules/vpc?ref=v1.0"
`;

const r1 = findMatchingReferences(PATTERNS, moduleTarget, caller1Content, BASE + '/envs/prod/terragrunt.hcl');
const r2 = findMatchingReferences(PATTERNS, moduleTarget, caller2Content, BASE + '/envs/prod/app/terragrunt.hcl');
const r3 = findMatchingReferences(PATTERNS, moduleTarget, caller3Content, BASE + '/anywhere/terragrunt.hcl');
const rNone = findMatchingReferences(PATTERNS, moduleTarget, nonMatchContent, BASE + '/envs/prod/terragrunt.hcl');
const rGit = findMatchingReferences(PATTERNS, moduleTarget, gitContent, BASE + '/envs/prod/terragrunt.hcl');

assert('relative ../modules/vpc resolves and matches', r1.length === 1);
assert('relative ../../modules/vpc resolves and matches', r2.length === 1);
assert('absolute path matches', r3.length === 1);
assert('../modules/eks does NOT match vpc target', rNone.length === 0);
assert('git source is skipped (not a local path)', rGit.length === 0);

// Column range is set to the path text itself (not the keyword prefix)
// Column range: start is after 'source = "' (9 chars), end is after the path value
assert('match range starts after source = "', r1[0]?.start === 'source = "'.length);

// config_path is also picked up
// From /workspace/project/envs/prod/app/  →  ../../../vpc
const depContent = `
dependency "vpc" {
  config_path = "../../../vpc"
}
`;
const r5 = findMatchingReferences(PATTERNS, BASE + '/vpc', depContent, BASE + '/envs/prod/app/main.hcl');
assert('config_path reference found', r5.length === 1);

// Multiple references in one file
const multiContent = `
source = "../../modules/vpc"
config_path = "../../modules/vpc"
`;
const r6 = findMatchingReferences(PATTERNS, moduleTarget, multiContent, BASE + '/envs/prod/terragrunt.hcl');
assert('two references in same file both found', r6.length === 2);

console.log('--- Regression: path navigation pattern still correct ---');
// From /workspace/project/envs/prod/  →  ../../root.hcl
const pathNavContent = `
include "root" {
  path = "../../root.hcl"
}
`;
const rf1 = findMatchingReferences(PATTERNS, BASE + '/root.hcl', pathNavContent, BASE + '/envs/prod/terragrunt.hcl');
assert('path = in include block is found as reference', rf1.length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
