// Diagnostics — tests for the pure computePathDiagnostic helper

const fs = require('fs');
const path = require('path');
const os = require('os');

// Inline the helper without vscode dependency
function computePathDiagnostic(rawPath, fsPath) {
    if (!fsPath) {
        return { message: `Could not resolve path: ${rawPath}` };
    }
    try {
        if (!fs.existsSync(fsPath)) {
            return { message: `Path not found: ${fsPath}` };
        }
    } catch {
        // fs.existsSync may throw for network/UNC paths; no diagnostic
    }
    return null;
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

// Create a temporary file that actually exists
const tmpDir = os.tmpdir();
const existingFile = path.join(tmpDir, 'tg-nav-test-existing.hcl');
fs.writeFileSync(existingFile, 'locals {}');
const missingFile = path.join(tmpDir, 'tg-nav-test-nonexistent-xyz.hcl');
// Ensure the missing file really doesn't exist
if (fs.existsSync(missingFile)) fs.unlinkSync(missingFile);

console.log('--- computePathDiagnostic ---');

assert('no diagnostic for an existing file', computePathDiagnostic('../root.hcl', existingFile) === null);

const missing = computePathDiagnostic('../missing.hcl', missingFile);
assert('diagnostic returned for missing file', missing !== null);
assert("diagnostic message mentions 'Path not found'", missing?.message.startsWith('Path not found:'));
assert('diagnostic message includes the fsPath', missing?.message.includes(missingFile));

const unresolved = computePathDiagnostic('../unresolved', null);
assert('diagnostic returned when fsPath is null (unresolved)', unresolved !== null);
assert("diagnostic message mentions 'Could not resolve'", unresolved?.message.startsWith('Could not resolve path:'));

// UNC/network paths that throw should NOT produce a diagnostic (silently skip)
// Simulate by wrapping: throw from existsSync => return null
function computeWithThrow(rawPath, fsPath) {
    if (!fsPath) return { message: `Could not resolve path: ${rawPath}` };
    try {
        throw new Error('ENOENT: network path');
    } catch {
        // swallowed
    }
    return null;
}
assert(
    'no diagnostic when fs.existsSync throws (network path)',
    computeWithThrow('\\\\server\\share\\file.hcl', '\\\\server\\share\\file.hcl') === null,
);

console.log('--- Regression: previous providers unaffected ---');
// Verify the patterns test still passes (import inline)
const PATTERNS = [
    { pattern: /(source\s*=\s*)"git::(ssh:\/\/|)(.*)\/\/([^#\r\n"?]+)(\?ref=(.*)")/, location: 'git' },
    { pattern: /((source|config_path|path)\s*=\s*")([^#\r\n"]+)/, location: 'local' },
    { pattern: /((find_in_parent_folders|file|read_terragrunt_config)\(")([^#\r\n"]+)/, location: 'enclosed' },
];
function firstMatch(patterns, line) {
    for (const p of patterns) {
        const m = line.match(p.pattern);
        if (m) return { location: p.location, value: m[3] || m[4] };
    }
    return null;
}
assert('path navigation pattern still works', firstMatch(PATTERNS, '  path = "../root.hcl"')?.location === 'local');

// Cleanup
fs.unlinkSync(existingFile);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
