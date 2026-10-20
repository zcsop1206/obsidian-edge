/**
 * The file operations behind every surface, over a small file-system interface so the same
 * code runs on Obsidian's vault and, in the tests, on a folder on disk.
 *
 * The hard rule (CORE.md): these operations surface signals, schedule and count. They append
 * the owner's own captured line under a heading, add a table row, bump a counter, move a
 * drill date, or create a new note from a template with the owner's text as its heading. They
 * never write derivations, generalizations, exemplars or any other schema prose.
 */
import {
  addDays,
  addPredictionRow,
  appendLine,
  appendUnderHeading,
  basename,
  fillProjectTemplate,
  fillQuestionTemplate,
  type Frontmatter,
  generalization,
  health,
  type Health,
  inboxLine,
  type InboxLine,
  lensSweepLines,
  num,
  parseInbox,
  parsePrediction,
  readFrontmatter,
  removeLine,
  section,
  setFrontmatter,
  slugify,
  type Tag,
  title,
} from './text';

export interface EdgeFs {
  read(path: string): Promise<string>;
  /** Creates the file (and its folders) or overwrites it. */
  write(path: string, text: string): Promise<void>;
  /** Read, transform, write, as one operation. Creates the file when it is missing. */
  process(path: string, fn: (text: string) => string): Promise<string>;
  exists(path: string): Promise<boolean>;
  /** Vault-relative paths of the markdown files directly in `folder`, sorted. */
  list(folder: string): Promise<string[]>;
  /** Names of the sub-folders directly in `folder`, sorted. */
  folders(folder: string): Promise<string[]>;
}

export interface Note {
  path: string;
  name: string;
  title: string;
  fm: Frontmatter;
  text: string;
}

export interface SchemaNote extends Note {
  health: Health;
  generalization: string;
  lens: string;
}

export interface Paths {
  edge: string;
  projects: string;
}

export const SECTIONS = {
  anomalies: 'Anomalies',
  exemplars: 'Exemplars',
  surprises: 'Surprises',
  predictions: 'Predictions',
  lensSweeps: 'Lens sweeps',
  exemplarsCounter: 'exemplars',
  anomaliesCounter: 'anomalies',
} as const;

export type SchemaHeading = 'Anomalies' | 'Exemplars';

export class EdgeOps {
  constructor(private fs: EdgeFs, private paths: Paths) {}

  get edge(): string {
    return this.paths.edge.replace(/\/+$/, '');
  }
  get inboxPath(): string {
    return `${this.edge}/inbox/inbox.md`;
  }
  get questionsFolder(): string {
    return `${this.edge}/questions`;
  }
  get schemataFolder(): string {
    return `${this.edge}/schemata`;
  }
  get projectsFolder(): string {
    return `${this.edge}/projects`;
  }
  get templatesFolder(): string {
    return `${this.edge}/templates`;
  }
  get probesOutFolder(): string {
    return `${this.edge}/probes/out`;
  }
  get portfolioProjectsFolder(): string {
    return this.paths.projects.replace(/\/+$/, '');
  }

  // --- capture ---------------------------------------------------------------------------

  async capture(date: string, tag: Tag, text: string): Promise<string> {
    const line = inboxLine(date, tag, text);
    await this.fs.process(this.inboxPath, (t) => appendLine(t, line));
    return line;
  }

  // --- triage ----------------------------------------------------------------------------

  async inboxLines(): Promise<InboxLine[]> {
    if (!(await this.fs.exists(this.inboxPath))) return [];
    return parseInbox(await this.fs.read(this.inboxPath));
  }

  async removeInboxLine(line: InboxLine): Promise<void> {
    await this.fs.process(this.inboxPath, (t) => removeLine(t, line.raw));
  }

  /** A new question file from the template, named after the question. Returns its path. */
  async createQuestion(date: string, question: string, source: string): Promise<string> {
    const template = await this.fs.read(`${this.templatesFolder}/question.md`);
    const path = await this.freePath(this.questionsFolder, slugify(question));
    await this.fs.write(path, fillQuestionTemplate(template, date, question, source));
    return path;
  }

  /** Appends `- date text` under `## Anomalies` or `## Exemplars` and bumps the counter. */
  async addToSchema(schemaPath: string, heading: SchemaHeading, date: string, text: string): Promise<void> {
    const counter = heading === 'Anomalies' ? SECTIONS.anomaliesCounter : SECTIONS.exemplarsCounter;
    await this.fs.process(schemaPath, (t) => {
      const fm = readFrontmatter(t);
      const bumped = setFrontmatter(t, { [counter]: num(fm[counter]) + 1 });
      return appendUnderHeading(bumped, heading, [`- ${date} ${text}`]);
    });
  }

  async addSurprise(projectPath: string, date: string, text: string): Promise<void> {
    await this.fs.process(projectPath, (t) => appendUnderHeading(t, SECTIONS.surprises, [`- ${date} ${text}`]));
  }

  /** A row in the Predictions table. The inbox text's leading number is taken as p. */
  async addPrediction(projectPath: string, date: string, text: string): Promise<void> {
    const { p, claim } = parsePrediction(text);
    await this.fs.process(projectPath, (t) => addPredictionRow(t, date, p, claim));
  }

  // --- notes -----------------------------------------------------------------------------

  async schemata(): Promise<SchemaNote[]> {
    const out: SchemaNote[] = [];
    for (const path of await this.fs.list(this.schemataFolder)) {
      const note = await this.note(path);
      out.push({
        ...note,
        health: health(note.fm),
        generalization: generalization(note.text),
        lens: section(note.text, 'Lens') ?? '',
      });
    }
    return out;
  }

  async projects(): Promise<Note[]> {
    const out: Note[] = [];
    for (const path of await this.fs.list(this.projectsFolder)) out.push(await this.note(path));
    return out;
  }

  async note(path: string): Promise<Note> {
    const text = await this.fs.read(path);
    const name = basename(path);
    return { path, name, title: title(text, name), fm: readFrontmatter(text), text };
  }

  /** Portfolio project slugs (folders under the projects setting) with no edge note yet. */
  async portfolioProjectsWithoutNote(): Promise<string[]> {
    const folder = this.portfolioProjectsFolder;
    if (!folder) return [];
    const slugs = await this.fs.folders(folder);
    const out: string[] = [];
    for (const slug of slugs) {
      if (slug.startsWith('.')) continue;
      if (!(await this.fs.exists(`${this.projectsFolder}/${slug}.md`))) out.push(slug);
    }
    return out;
  }

  /** A new edge project note for a portfolio project, from the template. Returns its path. */
  async createProjectNote(date: string, slug: string): Promise<string> {
    const template = await this.fs.read(`${this.templatesFolder}/project.md`);
    const path = `${this.projectsFolder}/${slug}.md`;
    const writeup = `${this.portfolioProjectsFolder}/${slug}/index`;
    const hasWriteup = await this.fs.exists(`${writeup}.md`);
    await this.fs.write(path, fillProjectTemplate(template, date, slug, hasWriteup ? `[[${writeup}]]` : null));
    return path;
  }

  // --- due -------------------------------------------------------------------------------

  async due(today: string): Promise<SchemaNote[]> {
    const all = await this.schemata();
    return all.filter((s) => s.fm.drill_next && s.fm.drill_next <= today);
  }

  /** The Exemplars section as it stands, for the "has it grown" check. */
  async exemplarsText(schemaPath: string): Promise<string> {
    return section(await this.fs.read(schemaPath), SECTIONS.exemplars) ?? '';
  }

  /** Pass doubles the interval; fail resets it to 1. Both move drill_next. */
  async drill(schemaPath: string, result: 'pass' | 'fail', today: string): Promise<{ interval: number; next: string }> {
    let interval = 1;
    let next = addDays(today, 1);
    await this.fs.process(schemaPath, (t) => {
      const fm = readFrontmatter(t);
      interval = result === 'pass' ? Math.max(1, num(fm.drill_interval) || 1) * 2 : 1;
      next = addDays(today, interval);
      return setFrontmatter(t, { drill_interval: interval, drill_next: next });
    });
    return { interval, next };
  }

  // --- sweep -----------------------------------------------------------------------------

  async addLensSweep(projectPath: string, date: string, schemaLink: string, answer: string): Promise<void> {
    await this.fs.process(projectPath, (t) =>
      appendUnderHeading(t, SECTIONS.lensSweeps, lensSweepLines(date, schemaLink, answer)),
    );
  }

  /** A lens with no answer becomes a question; the sweep records the link to it. */
  async lensToQuestion(
    projectPath: string,
    date: string,
    schemaLink: string,
    projectName: string,
    schemaName: string,
    lens: string,
  ): Promise<string> {
    const path = await this.createQuestion(date, lens, `sweep ${projectName} with ${schemaName}`);
    await this.fs.process(projectPath, (t) =>
      appendUnderHeading(t, SECTIONS.lensSweeps, [`- ${date} ${schemaLink}: open, became [[${basename(path)}]]`]),
    );
    return path;
  }

  // --- helpers ---------------------------------------------------------------------------

  private async freePath(folder: string, slug: string): Promise<string> {
    let path = `${folder}/${slug}.md`;
    for (let n = 2; await this.fs.exists(path); n++) path = `${folder}/${slug}-${n}.md`;
    return path;
  }
}
