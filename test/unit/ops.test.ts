import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { EdgeOps } from '../../src/ops';
import { NodeFs } from '../node-fs';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'vault');

function vault(): { ops: EdgeOps; read: (p: string) => string; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'edge-'));
  cpSync(FIXTURE, dir, { recursive: true });
  const ops = new EdgeOps(new NodeFs(dir), { edge: 'edge', projects: 'projects' });
  return { ops, dir, read: (p) => readFileSync(path.join(dir, ...p.split('/')), 'utf8') };
}

const D = '2026-10-20';

test('capture appends one dated tagged line to the inbox', async () => {
  const v = vault();
  const before = v.read('edge/inbox/inbox.md');
  const line = await v.ops.capture(D, '?', 'does the plugin count as outsourcing');
  const after = v.read('edge/inbox/inbox.md');
  assert.equal(after, before + line + '\n');
  assert.equal(line, '- 2026-10-20 ? does the plugin count as outsourcing');
  const lines = await v.ops.inboxLines();
  assert.equal(lines[lines.length - 1].text, 'does the plugin count as outsourcing');
  rmSync(v.dir, { recursive: true });
});

test('capture creates the inbox when it is missing', async () => {
  const v = vault();
  rmSync(path.join(v.dir, 'edge', 'inbox', 'inbox.md'));
  await v.ops.capture(D, 'p', '0.3 it works');
  assert.equal(v.read('edge/inbox/inbox.md'), '- 2026-10-20 p 0.3 it works\n');
  rmSync(v.dir, { recursive: true });
});

test('triage: question file from the template, inbox line removed', async () => {
  const v = vault();
  const [first] = await v.ops.inboxLines();
  assert.equal(first.tag, '?');
  const p = await v.ops.createQuestion(D, first.text, `inbox ${first.date} ${first.tag}`);
  assert.equal(p, 'edge/questions/does-the-uk-kk-move-need-its-own-ritual-or-does-daily.md');
  const q = v.read(p);
  assert.match(q, /^opened: 2026-10-20$/m);
  assert.match(q, /^source: inbox 2026-10-17 \?$/m);
  assert.match(q, /^# Q: does the UK->KK move need its own ritual or does daily triage of ~ lines cover it$/m);
  assert.match(q, /^- 2026-10-20:$/m);
  assert.doesNotMatch(q, /\{\{date\}\}/);
  await v.ops.removeInboxLine(first);
  assert.doesNotMatch(v.read('edge/inbox/inbox.md'), /does the UK->KK move/);
  assert.equal((await v.ops.inboxLines()).length, 4);
  // a second question with the same text gets a numbered name
  const p2 = await v.ops.createQuestion(D, first.text, 'again');
  assert.equal(p2, 'edge/questions/does-the-uk-kk-move-need-its-own-ritual-or-does-daily-2.md');
  rmSync(v.dir, { recursive: true });
});

test('triage: anomaly on a v0.1 schema appends under a new heading and adds the counter', async () => {
  const v = vault();
  const s = 'edge/schemata/attempt-before-assist.md';
  const before = v.read(s);
  await v.ops.addToSchema(s, 'Anomalies', '2026-10-17', 'the statement was borrowed, not derived');
  const after = v.read(s);
  assert.match(after, /^anomalies: 1$/m);
  assert.match(after, /^confidence: 1$/m, 'v0.1 fields are kept');
  assert.ok(after.endsWith('## Probe notes\n\n## Anomalies\n- 2026-10-17 the statement was borrowed, not derived\n'), after.slice(-200));
  // the owner's prose between the frontmatter and the new heading is untouched
  const body = (t: string) => t.replace(/^---[\s\S]*?\n---\n/, '').replace(/\n## Anomalies[\s\S]*$/, '');
  assert.equal(body(after), body(before));
  await v.ops.addToSchema(s, 'Anomalies', D, 'second');
  assert.match(v.read(s), /^anomalies: 2$/m);
  assert.match(v.read(s), /## Anomalies\n- 2026-10-17 the statement was borrowed, not derived\n- 2026-10-20 second\n$/);
  rmSync(v.dir, { recursive: true });
});

test('triage: exemplar on a CORE-format schema appends in place and bumps the counter', async () => {
  const v = vault();
  const s = 'edge/schemata/core-format.md';
  await v.ops.addToSchema(s, 'Exemplars', D, 'third worked case');
  const after = v.read(s);
  assert.match(after, /^exemplars: 3$/m);
  assert.match(after, /^anomalies: 1$/m);
  assert.match(after, /## Exemplars\n- 2026-10-19 first worked case\n- 2026-10-19 second worked case\n- 2026-10-20 third worked case\n\n## Anomalies\n/);
  rmSync(v.dir, { recursive: true });
});

test('triage: surprise and prediction on a project', async () => {
  const v = vault();
  const p = 'edge/projects/edge.md';
  await v.ops.addSurprise(p, '2026-10-17', 'the system caught its own first unknown known');
  let t = v.read(p);
  assert.match(t, /## Surprises\n- 2026-10-17 the system caught its own first unknown known\n\n## Stucks\n/);
  await v.ops.addPrediction(p, '2026-10-17', '0.4 probes/surprisal.py runs on the first try without edits');
  t = v.read(p);
  assert.match(
    t,
    /\| 2026-10-17 \| 0\.5 \| The Socratic gate[^\n]*\n\| 2026-10-17 \| 0\.4 \| probes\/surprisal\.py runs on the first try without edits \| \|\n\n## Surprises\n/,
  );
  // a project whose table has only the header
  const tf = 'edge/projects/tubefurnace.md';
  await v.ops.addPrediction(tf, D, 'flat zone measures within 5 mm of 26');
  // tubefurnace.md is a CRLF file, as the real vault has it: the row takes its line ending
  const tt = v.read(tf);
  assert.ok(tt.includes('\r\n'), 'fixture keeps CRLF');
  assert.doesNotMatch(tt, /[^\r]\n/, 'no bare LF was introduced');
  assert.match(tt, /\|---\|---\|---\|---\|\r\n\| 2026-10-20 \|  \| flat zone measures within 5 mm of 26 \| \|\r\n\r\n## Surprises\r\n/);
  rmSync(v.dir, { recursive: true });
});

test('schemata list health and generalization for both frontmatter shapes', async () => {
  const v = vault();
  const all = await v.ops.schemata();
  assert.deepEqual(
    all.map((s) => s.name),
    ['attempt-before-assist', 'core-format'],
  );
  const [legacy, core] = all;
  assert.equal(legacy.health.state, 'untested');
  assert.equal(legacy.health.legacy, true);
  assert.match(legacy.generalization, /^Retrieval attempted before the answer/);
  assert.match(legacy.lens, /^Where in this project/);
  assert.equal(core.health.state, 'degenerating', 'an anomaly with no confirmed prediction');
  assert.equal(core.health.exemplars, 2);
  assert.equal(core.generalization, 'A schema in the CORE.md shape, with counters.');
  rmSync(v.dir, { recursive: true });
});

test('due: today or earlier; pass doubles, fail resets', async () => {
  const v = vault();
  const due = await v.ops.due(D);
  assert.deepEqual(
    due.map((s) => s.name),
    ['attempt-before-assist', 'core-format'],
  );
  assert.equal((await v.ops.due('2026-10-17')).length, 0);
  const s = 'edge/schemata/core-format.md';
  assert.equal(await v.ops.exemplarsText(s), '- 2026-10-19 first worked case\n- 2026-10-19 second worked case');
  const pass = await v.ops.drill(s, 'pass', D);
  assert.deepEqual(pass, { interval: 4, next: '2026-10-24' });
  let t = v.read(s);
  assert.match(t, /^drill_interval: 4$/m);
  assert.match(t, /^drill_next: 2026-10-24$/m);
  assert.match(t, /^exemplars: 2$/m, 'counters untouched by a drill');
  assert.equal((await v.ops.due(D)).map((x) => x.name).join(), 'attempt-before-assist');
  const fail = await v.ops.drill(s, 'fail', D);
  assert.deepEqual(fail, { interval: 1, next: '2026-10-21' });
  t = v.read(s);
  assert.match(t, /^drill_interval: 1$/m);
  assert.match(t, /^drill_next: 2026-10-21$/m);
  // the v0.1 schema keeps its other fields
  const legacy = 'edge/schemata/attempt-before-assist.md';
  await v.ops.drill(legacy, 'pass', D);
  t = v.read(legacy);
  assert.match(t, /^drill_interval: 2$/m);
  assert.match(t, /^drill_next: 2026-10-22$/m);
  assert.match(t, /^drill_prompt: re-derive why/m);
  rmSync(v.dir, { recursive: true });
});

test('sweep: answers land under Lens sweeps; an empty one becomes a question', async () => {
  const v = vault();
  const p = 'edge/projects/tubefurnace.md';
  await v.ops.addLensSweep(p, D, '[[attempt-before-assist]]', 'I read the FEA docs before trying a hand estimate.\nNo feedback on the hand estimate yet.');
  let t = v.read(p);
  const tail =
    "## Lens sweeps\r\ndate, schema used as lens, what it exposed. anything worth showing becomes a dated entry in the project's log, in my own words.\r\n" +
    '- 2026-10-20 [[attempt-before-assist]]: I read the FEA docs before trying a hand estimate.\r\n  No feedback on the hand estimate yet.\r\n';
  assert.ok(t.endsWith(tail), JSON.stringify(t.slice(-300)));
  const q = await v.ops.lensToQuestion(p, D, '[[core-format]]', 'tubefurnace', 'core-format', 'Which counter here would I bump for this project, and why?');
  assert.equal(q, 'edge/questions/which-counter-here-would-i-bump-for-this-project-and-why.md');
  assert.match(v.read(q), /^# Q: Which counter here would I bump for this project, and why\?$/m);
  assert.match(v.read(q), /^source: sweep tubefurnace with core-format$/m);
  t = v.read(p);
  assert.ok(t.endsWith('- 2026-10-20 [[core-format]]: open, became [[which-counter-here-would-i-bump-for-this-project-and-why]]\r\n'));
  rmSync(v.dir, { recursive: true });
});

test('projects: portfolio projects without an edge note can get one from the template', async () => {
  const v = vault();
  assert.deepEqual(await v.ops.portfolioProjectsWithoutNote(), ['openvinyl']);
  const p = await v.ops.createProjectNote(D, 'openvinyl');
  assert.equal(p, 'edge/projects/openvinyl.md');
  const t = v.read(p);
  assert.match(t, /^started: 2026-10-20$/m);
  assert.match(t, /^writeup: "\[\[projects\/openvinyl\/index\]\]"$/m);
  assert.match(t, /^# openvinyl$/m);
  assert.deepEqual(await v.ops.portfolioProjectsWithoutNote(), []);
  assert.equal((await v.ops.projects()).length, 3);
  rmSync(v.dir, { recursive: true });
});
