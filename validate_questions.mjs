import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('public/questions.json', 'utf8'));
const expected = {
  JEE: { Physics: 20, Chemistry: 20, Mathematics: 20 },
  NEET: { Physics: 20, Chemistry: 20, Biology: 20 },
  Board: { Physics: 20, Chemistry: 20, Mathematics: 20, Biology: 20, Hindi: 20, English: 20 },
  CA: { Accounting: 20, Law: 20, Economics: 20, Taxation: 20 },
  UPSC: { History: 20, Geography: 20, Polity: 20, Economics: 20, 'General Science': 20 },
  NDA: { Mathematics: 20, English: 20, 'General Science': 20, History: 20, Geography: 20 },
  SSC: { 'Quantitative Aptitude': 20, Reasoning: 20, English: 20, 'General Awareness': 20 },
  CUET: { 'General Test': 20, English: 20, 'General Knowledge': 20, Reasoning: 20, Mathematics: 20 },
};

const counts = {};
const ids = new Set();
const texts = new Set();
const issues = [];

for (const item of data) {
  counts[item.exam] = counts[item.exam] || {};
  counts[item.exam][item.subject] = (counts[item.exam][item.subject] || 0) + 1;
  if (!item.id.startsWith('v2-')) issues.push(`old id: ${item.id}`);
  if (ids.has(item.id)) issues.push(`duplicate id: ${item.id}`);
  ids.add(item.id);
  const text = `${item.exam}|${item.subject}|${String(item.question).trim().toLowerCase()}`;
  if (texts.has(text)) issues.push(`duplicate question: ${text}`);
  texts.add(text);
  if (!Array.isArray(item.options) || item.options.length !== 4 || !item.options.includes(item.correctAnswer)) {
    issues.push(`invalid options: ${item.id}`);
  }
}

for (const [exam, subjects] of Object.entries(expected)) {
  for (const [subject, expectedCount] of Object.entries(subjects)) {
    const actualCount = counts[exam]?.[subject] || 0;
    if (actualCount !== expectedCount) issues.push(`${exam}/${subject}: ${actualCount}, expected ${expectedCount}`);
  }
}

console.log(`TOTAL=${data.length}`);
console.log(`UNIQUE_IDS=${ids.size}`);
console.log(`UNIQUE_QUESTIONS=${texts.size}`);
console.log(`ISSUES=${issues.length ? issues.join(' || ') : 'NONE'}`);
