import fs from 'node:fs';

const questions = JSON.parse(fs.readFileSync('public/questions.json', 'utf8'));
const banks = new Map();
for (const question of questions) {
  const key = `${question.exam}|${question.subject}`;
  if (!banks.has(key)) banks.set(key, []);
  banks.get(key).push(question);
}

const issues = [];
for (const [key, bank] of banks) {
  const history = [];
  const attempts = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const used = new Set(history);
    const fresh = bank.filter((question) => !used.has(question.id));
    const source = fresh.length >= 5 ? fresh : bank;
    const selected = source.slice(0, 5);
    if (selected.length !== 5) issues.push(`${key}: attempt ${attempt + 1} returned ${selected.length}`);
    const selectedIds = selected.map((question) => question.id);
    if (selectedIds.some((id) => history.includes(id)) && fresh.length >= 5) {
      issues.push(`${key}: repeated question before cycle reset`);
    }
    attempts.push(selectedIds);
    history.push(...selectedIds);
  }

  const firstCycle = new Set(attempts.slice(0, 4).flat());
  if (firstCycle.size !== 20) issues.push(`${key}: first four attempts cover ${firstCycle.size}, expected 20`);
  if (attempts[4].length !== 5) issues.push(`${key}: reset attempt failed`);
}

console.log(`BANKS=${banks.size}`);
console.log(`ISSUES=${issues.length ? issues.join(' || ') : 'NONE'}`);
