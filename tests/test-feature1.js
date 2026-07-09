// Feature 1: path = "..." in include/generate blocks should be navigable

const PATTERNS_BEFORE = [
    { pattern: /(source\s*=\s*)"git::(ssh:\/\/|)(.*)\/\/([^#\r\n"?]+)(\?ref=(.*)")/, location: 'git' },
    { pattern: /((source|config_path)\s*=\s*")([^#\r\n"]+)/, location: 'local' },
    { pattern: /((find_in_parent_folders|file|read_terragrunt_config)\(")([^#\r\n"]+)/, location: 'enclosed' },
];

const PATTERNS_AFTER = [
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

console.log('--- Regression: existing patterns still work ---');
assert(
    'git source still matched',
    firstMatch(PATTERNS_AFTER, '  source = "git::https://github.com/org/repo//modules/eks?ref=v1.0"')?.location ===
        'git',
);
assert(
    'local source still matched',
    firstMatch(PATTERNS_AFTER, '  source = "../../modules/eks"')?.location === 'local',
);
assert('config_path still matched', firstMatch(PATTERNS_AFTER, '  config_path = "../../vpc"')?.location === 'local');
assert(
    'find_in_parent_folders with arg still matched',
    firstMatch(PATTERNS_AFTER, '  path = find_in_parent_folders("region.hcl")')?.location === 'enclosed',
);
assert(
    'read_terragrunt_config still matched',
    firstMatch(PATTERNS_AFTER, '  region_vars = read_terragrunt_config(find_in_parent_folders("region.hcl"))')
        ?.location === 'enclosed',
);

console.log('--- Feature 1: path = "..." ---');
assert('path literal NOT matched BEFORE', firstMatch(PATTERNS_BEFORE, '  path = "../root.hcl"') === null);
assert(
    'path literal matched AFTER (local)',
    firstMatch(PATTERNS_AFTER, '  path = "../root.hcl"')?.location === 'local',
);
assert('path value extracted correctly', firstMatch(PATTERNS_AFTER, '  path = "../root.hcl"')?.value === '../root.hcl');
assert(
    'path with extra spacing matched',
    firstMatch(PATTERNS_AFTER, '  path  =  "../configs/base.hcl"')?.location === 'local',
);
assert(
    'path = func(arg) uses enclosed pattern (not local)',
    firstMatch(PATTERNS_AFTER, '  path = find_in_parent_folders("root.hcl")')?.location === 'enclosed',
);
assert(
    'path = func() no-arg is not matched by any pattern (expected no match)',
    firstMatch(PATTERNS_AFTER, '  path = find_in_parent_folders()') === null,
);
assert(
    'generate block if_exists path matched',
    firstMatch(PATTERNS_AFTER, '  path = "provider.tf"')?.location === 'local',
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
