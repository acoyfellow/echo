const plan = await Bun.file(new URL('../PLAN.md', import.meta.url)).text();

const requiredSections = [
  '## Product contract',
  '## Evidence schema',
  '## Independent E2E runner',
  '## Build order and file map',
  '## Release and stop rules',
];

const requiredTerms = [
  'Chrome',
  'Safari',
  'wrong agent',
  'wrong tab-session',
  'operationId',
  'outcome_unknown',
  'Stop',
  'Worker Loader',
  'networking disabled',
  'independent browser observation',
  'never sufficient proof',
  'extension deprecation',
];

const failures: string[] = [];
for (const section of requiredSections) {
  if (!plan.includes(section)) failures.push(`missing section: ${section}`);
}
for (const term of requiredTerms) {
  if (!plan.includes(term)) failures.push(`missing required term: ${term}`);
}

const phases = [...plan.matchAll(/^## Phase (\d+) —[^\n]*\n([\s\S]*?)(?=^## Phase |^## Independent E2E runner)/gm)];
if (phases.length !== 8) failures.push(`expected 8 phases, found ${phases.length}`);
for (const phase of phases) {
  const number = phase[1];
  const body = phase[2];
  for (const field of ['**Claim:**', '**Acceptance command:**', '**Evidence:**', '**Rollback:**']) {
    if (!body.includes(field)) failures.push(`phase ${number} missing ${field}`);
  }
  if (!body.includes('```sh')) failures.push(`phase ${number} missing runnable shell command`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log('PASS: Echo extension-free plan satisfies the planning contract');
