import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, MAX_SOURCE_BYTES } from '../src/auditor.ts';

test('safe code, comments, and string descriptions do not trigger rules', () => {
  const result = audit({ source: `// eval(input)\n/* new Function(userCode) */\nconst text = 'eval(input)';\nconst value = JSON.parse(text);\nelement.innerHTML = '<strong>Hello</strong>';\ndb.query('SELECT * FROM users WHERE id = ?', [id]);` });
  assert.equal(result.findings.length, 0);
  assert.equal(result.score, 100);
  assert.equal(result.rewardEligible, false);
});
test('flags eval, Function, SQL interpolation and HTML insertion with exact lines', () => {
  const result = audit({ source: 'eval(input);\nnew Function(body);\ndb.query(`SELECT * FROM users WHERE id = ${id}`);\nnode.innerHTML = userHtml;' });
  assert.deepEqual(result.findings.map(f => f.line), [1, 2, 4, 3]);
  assert.equal(result.findings.length, 4);
  assert.equal(result.rewardEligible, true);
});
test('never includes private key, source snippets or line contents in returned evidence', () => {
  const secret = 'ab'.repeat(32);
  const source = `const PRIVATE_KEY = '0x${secret}'; eval('SENSITIVE CUSTOMER DATA');`;
  const report = audit({ source });
  assert.ok(report.findings.some(f => f.severity === 'critical'));
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!JSON.stringify(report).includes('SENSITIVE CUSTOMER DATA'));
});
test('dynamic shell commands are flagged but constant commands and unrelated exec are not', () => {
  const report = audit({ source: `import {exec as run, execSync} from 'node:child_process';\nrun('git status');\nrun('ls ' + user);\nexecSync(command);\nregex.exec(text);` });
  assert.deepEqual(report.findings.map(f => f.line), [3, 4]);
  const required = audit({ source: `const cp = require('child_process');\ncp.exec(\`echo \${input}\`);` });
  assert.equal(required.findings.length, 1);
});
test('rejects empty source and multibyte byte limits', () => {
  assert.throws(() => audit({ source: ' ' }), /vide/);
  assert.throws(() => audit({ source: 'é'.repeat(MAX_SOURCE_BYTES / 2 + 1) }), /volumineuse/);
});
test('IDs are stable, duplicate rule on one line is collapsed, input is not executed', () => {
  const source = 'eval(one); eval(two);\nprocess.exit(99);';
  const a = audit({ source });
  const b = audit({ source });
  assert.equal(a.id, b.id);
  assert.deepEqual(a.findings, b.findings);
  assert.equal(a.findings.length, 1);
});

test('bounds report size when a source contains many risky statements', () => {
  const report = audit({ source: 'eval(input);\n'.repeat(1000) });
  assert.equal(report.findings.length, 100);
  assert.match(report.summary, /100 premiers/);
});


test('SQL descriptions and escaped template placeholders do not create false rewards', () => {
  const report = audit({ source: [
    'const example = "db.query(`SELECT * FROM users WHERE id = ${id}`)";',
    'db.query(`SELECT * FROM users WHERE value = \\${literal}`);',
    "import { exec } from 'node:child_process';",
    'exec(`echo \\${literal}`);',
    "db.query('SELECT * FROM users WHERE id = ?', [id]);"
  ].join('\n') });
  assert.equal(report.findings.length, 0);
  assert.equal(report.rewardEligible, false);
});

test('adversarial repeated imports and same-line findings remain bounded', () => {
  const report = audit({ source: 'import{'.repeat(20_000) });
  assert.equal(report.findings.length, 0);
  const repeated = audit({ source: 'eval(input);'.repeat(15_000) });
  assert.equal(repeated.findings.length, 1);
  const malformed = audit({ source: "import { exec } from 'node:child_process';\n" + 'exec('.repeat(10_000) });
  assert.equal(malformed.findings.length, 1);
});
