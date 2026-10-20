/**
 * Pure text functions over the edge markdown. No Obsidian here, so the tests run in node.
 * Everything that changes a file keeps the owner's prose untouched: these functions only add
 * dated lines under headings, add table rows, and set frontmatter fields.
 */

export const TAGS = ['?', '!', '~', '=', 'x', 'p'] as const;
export type Tag = (typeof TAGS)[number];

export const TAG_LABELS: Record<Tag, string> = {
  '?': 'question',
  '!': 'surprise',
  '~': 'hunch',
  '=': 'derivation',
  'x': 'error',
  'p': 'prediction',
};

export interface InboxLine {
  date: string;
  tag: Tag;
  text: string;
  /** The line as it stands in the file, used to remove exactly it. */
  raw: string;
}

const INBOX_RE = /^- (\d{4}-\d{2}-\d{2}) ([?!~=xp]) (.*)$/;

export function parseInbox(text: string): InboxLine[] {
  const out: InboxLine[] = [];
  for (const raw of text.split('\n')) {
    const m = INBOX_RE.exec(raw.replace(/\r$/, ''));
    if (m) out.push({ date: m[1], tag: m[2] as Tag, text: m[3].trim(), raw: raw.replace(/\r$/, '') });
  }
  return out;
}

export function inboxLine(date: string, tag: Tag, text: string): string {
  return `- ${date} ${tag} ${text.replace(/\s*\n\s*/g, ' ').trim()}`;
}

/** The file's own line ending, so an edit never mixes CRLF and LF. */
export function nlOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Appends one line, making sure the file ends with a newline before and after. */
export function appendLine(text: string, line: string): string {
  const nl = nlOf(text);
  if (text.length === 0) return line + '\n';
  return (text.endsWith('\n') ? text : text + nl) + line + nl;
}

/** Removes the first line equal to `raw`. Returns the text unchanged if it is not there. */
export function removeLine(text: string, raw: string): string {
  const nl = nlOf(text);
  const lines = splitLines(text);
  const i = lines.findIndex((l) => l === raw);
  if (i < 0) return text;
  lines.splice(i, 1);
  return lines.join(nl);
}

export function todayIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayIso(dt);
}

export type Frontmatter = Record<string, string>;

/** The frontmatter block as raw `key: value` strings, or {} when the file has none. */
export function readFrontmatter(text: string): Frontmatter {
  const block = frontmatterBlock(text);
  const fm: Frontmatter = {};
  if (!block) return fm;
  for (const line of splitLines(block.body)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

function frontmatterBlock(text: string): { body: string; start: number; end: number } | null {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  return { body: m[1], start: 0, end: m[0].length };
}

export type FrontmatterValue = string | number | boolean;

/**
 * Sets fields in the frontmatter, in place where they exist, appended to the block where
 * they do not. Order and every other line are kept. A file with no frontmatter gets one.
 */
export function setFrontmatter(text: string, fields: Record<string, FrontmatterValue>): string {
  const block = frontmatterBlock(text);
  const nl = nlOf(text);
  if (!block) {
    const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(nl);
    return `---${nl}${body}${nl}---${nl}` + text;
  }
  const lines = splitLines(block.body);
  for (const [k, v] of Object.entries(fields)) {
    const re = new RegExp(`^${k}:.*$`);
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) lines[i] = `${k}: ${v}`;
    else lines.push(`${k}: ${v}`);
  }
  return `---${nl}${lines.join(nl)}${nl}---${nl}` + text.slice(block.end);
}

export function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isHeading(line: string): boolean {
  return /^#{1,2} /.test(line);
}

function findSection(lines: string[], heading: string): { start: number; end: number } | null {
  const re = new RegExp(`^## ${escapeRe(heading)}\\s*$`);
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isHeading(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The body of `## heading`, trimmed, or null when the heading is missing. */
export function section(text: string, heading: string): string | null {
  const lines = splitLines(text);
  const s = findSection(lines, heading);
  if (!s) return null;
  return lines.slice(s.start + 1, s.end).join('\n').trim();
}

/**
 * Appends lines at the end of `## heading` (after its last non-blank line, before the next
 * heading). Creates the heading at the end of the file when it is missing.
 */
export function appendUnderHeading(text: string, heading: string, newLines: string[]): string {
  const nl = nlOf(text);
  const lines = splitLines(text);
  const s = findSection(lines, heading);
  if (!s) {
    const base = text.length === 0 || text.endsWith('\n') ? text : text + nl;
    const sep = base.length === 0 || base.endsWith(nl + nl) ? '' : nl;
    return base + sep + `## ${heading}${nl}` + newLines.join(nl) + nl;
  }
  let end = s.end;
  while (end > s.start + 1 && lines[end - 1].trim() === '') end--;
  const before = lines.slice(0, end);
  const after = lines.slice(end);
  if (after.length > 0 && after[0].trim() !== '') after.unshift('');
  const out = [...before, ...newLines, ...after];
  let joined = out.join(nl);
  if (!joined.endsWith('\n')) joined += nl;
  return joined;
}

const PREDICTIONS_HEADER = ['| date | p | claim | outcome |', '|---|---|---|---|'];

/** Adds a row to the table under `## Predictions`, creating the table when there is none. */
export function addPredictionRow(text: string, date: string, p: string, claim: string): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  const row = `| ${date} | ${cell(p)} | ${cell(claim)} | |`;
  const lines = splitLines(text);
  const s = findSection(lines, 'Predictions');
  if (!s) return appendUnderHeading(text, 'Predictions', [...PREDICTIONS_HEADER, row]);
  let last = -1;
  for (let i = s.start + 1; i < s.end; i++) if (lines[i].trim().startsWith('|')) last = i;
  if (last < 0) return appendUnderHeading(text, 'Predictions', [...PREDICTIONS_HEADER, row]);
  lines.splice(last + 1, 0, row);
  return lines.join(nlOf(text));
}

/** `0.5 the claim` -> p "0.5", claim "the claim". No leading number -> p "". */
export function parsePrediction(text: string): { p: string; claim: string } {
  const m = /^(\d*\.?\d+%?)\s+(.*)$/s.exec(text.trim());
  if (m) return { p: m[1], claim: m[2].trim() };
  return { p: '', claim: text.trim() };
}

export function slugify(s: string, max = 60): string {
  let slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > max) {
    slug = slug.slice(0, max);
    const cut = slug.lastIndexOf('-');
    if (cut > max / 2) slug = slug.slice(0, cut);
  }
  return slug || 'untitled';
}

/**
 * A new question file from the template: `{{date}}` filled, the `# Q:` heading replaced by the
 * question, `source:` set. Nothing else in the template is touched; the owner edits the rest.
 */
export function fillQuestionTemplate(template: string, date: string, question: string, source: string): string {
  let out = template.replace(/\{\{date\}\}/g, date);
  const q = question.replace(/\s*\n\s*/g, ' ').trim();
  if (/^# Q:.*$/m.test(out)) out = out.replace(/^# Q:.*$/m, `# Q: ${q}`);
  else if (/^# .*$/m.test(out)) out = out.replace(/^# .*$/m, `# Q: ${q}`);
  else out = appendLine(out, `# Q: ${q}`);
  if (/^source:.*$/m.test(out)) out = out.replace(/^source:.*$/m, `source: ${source}`);
  else out = setFrontmatter(out, { source });
  return out;
}

/** A new project note from the template: `{{date}}` filled, the heading named, the writeup linked. */
export function fillProjectTemplate(template: string, date: string, slug: string, writeupLink: string | null): string {
  let out = template.replace(/\{\{date\}\}/g, date);
  if (/^# .*$/m.test(out)) out = out.replace(/^# .*$/m, `# ${slug}`);
  else out = appendLine(out, `# ${slug}`);
  if (writeupLink) out = setFrontmatter(out, { writeup: `"${writeupLink}"` });
  return out;
}

export type HealthState = 'crisis' | 'degenerating' | 'progressive' | 'holding' | 'untested';

export interface Health {
  state: HealthState;
  held: boolean;
  exemplars: number;
  anomalies: number;
  predictions: number;
  confirmed: number;
  /** True when the file still carries v0.1 fields and none of the counters. */
  legacy: boolean;
}

/**
 * Missing counters count as 0, so v0.1 files (confidence, cold, modes) still get a state.
 * Checked in this order: crisis, degenerating, progressive, holding, so a schema with
 * exemplars and an anomaly but no confirmed prediction is degenerating (it has only been
 * patched after the fact), and holding means exemplars with no anomaly and no confirmed
 * prediction yet. All zeros is untested.
 */
export function health(fm: Frontmatter): Health {
  const exemplars = num(fm.exemplars);
  const anomalies = num(fm.anomalies);
  const predictions = num(fm.predictions);
  const confirmed = num(fm.confirmed);
  let state: HealthState;
  if (anomalies > exemplars) state = 'crisis';
  else if (anomalies > confirmed) state = 'degenerating';
  else if (confirmed > 0 && anomalies <= confirmed) state = 'progressive';
  else if (confirmed === 0 && exemplars > 0) state = 'holding';
  else state = 'untested';
  const legacy =
    ('confidence' in fm || 'cold' in fm) &&
    !('exemplars' in fm) && !('anomalies' in fm) && !('confirmed' in fm);
  return { state, held: fm.held === 'true', exemplars, anomalies, predictions, confirmed, legacy };
}

export const HEALTH_ORDER: Record<HealthState, number> = {
  crisis: 0,
  degenerating: 1,
  holding: 2,
  progressive: 3,
  untested: 4,
};

/** The `# heading` of a note, or its basename when it has none. */
export function title(text: string, fallback: string): string {
  const m = /^# (.+)$/m.exec(text);
  return m ? m[1].trim() : fallback;
}

export function basename(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.md$/, '');
}

/** The schema's statement for the drill: `## Generalization`, else the v0.1 `## Statement`. */
export function generalization(text: string): string {
  return section(text, 'Generalization') ?? section(text, 'Statement') ?? '';
}

/** A dated line under `## Lens sweeps`. Multi-line answers are indented under the bullet. */
export function lensSweepLines(date: string, schemaLink: string, answer: string): string[] {
  const parts = answer.replace(/\r\n/g, '\n').trim().split('\n');
  const first = `- ${date} ${schemaLink}: ${parts[0]}`.replace(/\s+$/, '');
  return [first, ...parts.slice(1).map((l) => `  ${l}`)];
}
