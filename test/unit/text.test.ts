import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays,
  addPredictionRow,
  appendLine,
  appendUnderHeading,
  fillQuestionTemplate,
  health,
  inboxLine,
  parseInbox,
  parsePrediction,
  readFrontmatter,
  removeLine,
  section,
  setFrontmatter,
  slugify,
} from '../../src/text';

test('parseInbox reads only tagged dated bullets', () => {
  const lines = parseInbox('# inbox\n<!-- c -->\n- 2026-10-17 ? why\n- 2026-10-17 p 0.5 claim\n- not a capture\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], { date: '2026-10-17', tag: '?', text: 'why', raw: '- 2026-10-17 ? why' });
  assert.equal(lines[1].tag, 'p');
});

test('inboxLine flattens newlines; appendLine keeps a trailing newline', () => {
  assert.equal(inboxLine('2026-10-20', '!', ' a\n b '), '- 2026-10-20 ! a b');
  assert.equal(appendLine('x', 'y'), 'x\ny\n');
  assert.equal(appendLine('x\n', 'y'), 'x\ny\n');
  assert.equal(appendLine('', 'y'), 'y\n');
});

test('removeLine removes exactly one matching line', () => {
  assert.equal(removeLine('a\nb\nb\nc\n', 'b'), 'a\nb\nc\n');
  assert.equal(removeLine('a\n', 'z'), 'a\n');
});

test('frontmatter read and set keep order and add missing keys', () => {
  const t = '---\nconfidence: 1\ncold: false\ndrill_next: 2026-10-18\n---\n\n# s\n';
  assert.deepEqual(readFrontmatter(t), { confidence: '1', cold: 'false', drill_next: '2026-10-18' });
  const u = setFrontmatter(t, { drill_next: '2026-10-22', anomalies: 1 });
  assert.equal(u, '---\nconfidence: 1\ncold: false\ndrill_next: 2026-10-22\nanomalies: 1\n---\n\n# s\n');
  assert.equal(setFrontmatter('# s\n', { a: 1 }), '---\na: 1\n---\n# s\n');
});

test('appendUnderHeading inserts before the next heading, after the last non-blank line', () => {
  const t = '# p\n\n## Surprises\ndesc line\n\n## Stucks\ntext\n';
  assert.equal(appendUnderHeading(t, 'Surprises', ['- 2026-10-20 x']), '# p\n\n## Surprises\ndesc line\n- 2026-10-20 x\n\n## Stucks\ntext\n');
  assert.equal(appendUnderHeading(t, 'Stucks', ['- y']), '# p\n\n## Surprises\ndesc line\n\n## Stucks\ntext\n- y\n');
  assert.equal(appendUnderHeading('# p\n', 'Anomalies', ['- z']), '# p\n\n## Anomalies\n- z\n');
  assert.equal(appendUnderHeading('# p\n\n## Lens\nq\n\n## Probe notes\n', 'Probe notes', ['- n']), '# p\n\n## Lens\nq\n\n## Probe notes\n- n\n');
});

test('CRLF files keep CRLF through every edit', () => {
  const t = '---\r\nexemplars: 1\r\n---\r\n\r\n# s\r\n\r\n## Exemplars\r\n- a\r\n\r\n## Lens\r\nq\r\n';
  assert.equal(setFrontmatter(t, { exemplars: 2, drill_next: '2026-10-21' }), '---\r\nexemplars: 2\r\ndrill_next: 2026-10-21\r\n---\r\n\r\n# s\r\n\r\n## Exemplars\r\n- a\r\n\r\n## Lens\r\nq\r\n');
  assert.equal(appendUnderHeading(t, 'Exemplars', ['- b']), '---\r\nexemplars: 1\r\n---\r\n\r\n# s\r\n\r\n## Exemplars\r\n- a\r\n- b\r\n\r\n## Lens\r\nq\r\n');
  assert.equal(appendUnderHeading(t, 'Anomalies', ['- c']), t + '\r\n## Anomalies\r\n- c\r\n');
  assert.equal(section(t, 'Exemplars'), '- a');
  assert.deepEqual(readFrontmatter(t), { exemplars: '1' });
  assert.equal(removeLine('- x\r\n- y\r\n', '- x'), '- y\r\n');
  assert.equal(appendLine('- x\r\n', '- y'), '- x\r\n- y\r\n');
  assert.deepEqual(parseInbox('- 2026-10-17 ? why\r\n')[0].raw, '- 2026-10-17 ? why');
});

test('section returns the body or null', () => {
  assert.equal(section('## A\nx\ny\n\n## B\n', 'A'), 'x\ny');
  assert.equal(section('## A\n', 'B'), null);
});

test('addPredictionRow appends after the last table line or makes the table', () => {
  const t = '## Predictions\nmade before.\n\n| date | p | claim | outcome |\n|---|---|---|---|\n\n## Surprises\n';
  assert.equal(
    addPredictionRow(t, '2026-10-20', '0.4', 'it | runs'),
    '## Predictions\nmade before.\n\n| date | p | claim | outcome |\n|---|---|---|---|\n| 2026-10-20 | 0.4 | it \\| runs | |\n\n## Surprises\n',
  );
  assert.equal(
    addPredictionRow('# p\n', '2026-10-20', '', 'c'),
    '# p\n\n## Predictions\n| date | p | claim | outcome |\n|---|---|---|---|\n| 2026-10-20 |  | c | |\n',
  );
});

test('parsePrediction splits a leading probability', () => {
  assert.deepEqual(parsePrediction('0.5 by end of week'), { p: '0.5', claim: 'by end of week' });
  assert.deepEqual(parsePrediction('no number here'), { p: '', claim: 'no number here' });
});

test('slugify and dates', () => {
  assert.equal(slugify('When is attempting wasteful? (really)'), 'when-is-attempting-wasteful-really');
  assert.equal(slugify('a'.repeat(80)).length, 60);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 64), '2027-03-05');
});

test('fillQuestionTemplate fills date, heading and source only', () => {
  const tpl = '---\nstatus: open\nopened: {{date}}\ndomain:\nsource:\n---\n\n# Q: <the question>\n\n## Attempts\n- {{date}}:\n';
  assert.equal(
    fillQuestionTemplate(tpl, '2026-10-20', 'why?', 'inbox'),
    '---\nstatus: open\nopened: 2026-10-20\ndomain:\nsource: inbox\n---\n\n# Q: why?\n\n## Attempts\n- 2026-10-20:\n',
  );
});

test('health follows CORE.md with missing counters as 0', () => {
  assert.equal(health({ confidence: '1', cold: 'false' }).state, 'untested');
  assert.equal(health({ confidence: '1', cold: 'false' }).legacy, true);
  assert.equal(health({ exemplars: '2' }).state, 'holding');
  assert.equal(health({ exemplars: '2', confirmed: '1' }).state, 'progressive');
  assert.equal(health({ exemplars: '2', confirmed: '1', anomalies: '1' }).state, 'progressive');
  assert.equal(health({ exemplars: '3', confirmed: '1', anomalies: '2' }).state, 'degenerating');
  assert.equal(health({ exemplars: '1', anomalies: '2' }).state, 'crisis');
  assert.equal(health({ anomalies: '1' }).state, 'crisis');
});
