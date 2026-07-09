// Feature 4: CodeLens — tests for provideCodeLenses line scanning logic

const PATTERNS = [
    { pattern: /(source\s*=\s*)"git::(ssh:\/\/|)(.*)\/\/([^#\r\n"?]+)(\?ref=(.*)")/, location: 'git' },
    { pattern: /((source|config_path|path)\s*=\s*")([^#\r\n"]+)/, location: 'local' },
    { pattern: /((find_in_parent_folders|file|read_terragrunt_config)\(")([^#\r\n"]+)/, location: 'enclosed' },
];

// Inline the provideCodeLenses line-scanning logic
function getCodeLensLines(fileContent) {
    const lines = fileContent.split('\n');
    const lensLines = [];
    for (let i = 0; i < lines.length; i++) {
        for (const p of PATTERNS) {
            if (lines[i].match(p.pattern)) {
                lensLines.push(i);
                break;
            }
        }
    }
    return lensLines;
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

console.log('--- Feature 4: CodeLens line detection ---');

const hclContent = `
locals {
  env = "prod"
}

# Module reference
source = "../../modules/eks"

dependency "vpc" {
  config_path = "../../vpc"
}

include "root" {
  path = find_in_parent_folders()
}

# git reference
source = "git::https://github.com/org/repo//modules/eks?ref=v1.0"

# No link here
region_code = "us-east-1"
`.trim();

const lensLines = getCodeLensLines(hclContent);

assert('source = (local) gets a code lens', lensLines.includes(5));
assert('config_path = gets a code lens', lensLines.includes(8));
// path = find_in_parent_folders() — no string arg so enclosed doesn't match,
// but path = without a string value doesn't match local either (no ")
// → no lens expected for this line (consistent with feature 1 test)
assert('path = find_in_parent_folders() produces no lens (no string arg)', !lensLines.includes(12));
assert('git source = gets a code lens', lensLines.includes(16));
assert('plain value assignment gets no lens', !lensLines.includes(19));

const multiSource = `
source = "../../mod-a"
source = "../../mod-b"
`.trim();
const multiLines = getCodeLensLines(multiSource);
assert('two source lines produce two lenses', multiLines.length === 2);
assert('first lens at line 0', multiLines[0] === 0);
assert('second lens at line 1', multiLines[1] === 1);

// Empty file
assert('empty file produces no lenses', getCodeLensLines('').length === 0);

// The regex does not skip # comment lines (no HCL comment parsing) — both lines match
const commented = `
# source = "../../modules/eks"
source = "../../modules/eks"
`.trim();
const commentedLines = getCodeLensLines(commented);
assert('regex matches source in comment and non-comment (both get a lens)', commentedLines.length === 2);

// Feature 3 regression: same patterns used
assert('feature 1 path still recognised', getCodeLensLines('  path = "../root.hcl"').length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
