import { MarkdownRenderer, Notice, TFile, type WorkspaceLeaf } from 'obsidian';
import type { Note, SchemaNote } from './ops';
import { pickProject } from './pickers';
import { todayIso } from './text';
import { EdgeView } from './views';

export const VIEW_TYPE_SWEEP = 'edge-sweep';

/**
 * Sweep: pick a project; every schema's Lens with a text box. Save appends a dated line
 * under the project's `## Lens sweeps` with the schema and the answer. An empty answer can
 * become a question, made from the lens text.
 */
export class SweepView extends EdgeView {
  private projectPath: string | null = null;
  /** Unsaved answers survive a re-render caused by a save. */
  private drafts = new Map<string, string>();

  constructor(leaf: WorkspaceLeaf, plugin: import('./main').default) {
    super(leaf, plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_SWEEP;
  }
  getDisplayText(): string {
    return 'Edge: sweep';
  }
  getIcon(): string {
    return 'scan-search';
  }

  async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    const ops = this.plugin.ops();
    const header = this.header('Lens sweep');
    const pick = header.createEl('button', { text: this.projectPath ? 'change project' : 'pick a project' });
    pick.addEventListener('click', async () => {
      const p = await pickProject(this.app, ops);
      if (!p) return;
      this.projectPath = p.path;
      this.drafts.clear();
      await this.safeRender();
    });
    if (!this.projectPath) {
      this.empty('Pick a project, then answer each schema’s lens for it. Answers land under the project’s ## Lens sweeps, dated.');
      return;
    }
    if (!(this.app.vault.getAbstractFileByPath(this.projectPath) instanceof TFile)) {
      this.projectPath = null;
      this.empty('That project note is gone. Pick another.');
      return;
    }
    const project = await ops.note(this.projectPath);
    const schemata = await ops.schemata();
    const title = el.createDiv({ cls: 'edge-sweep-project' });
    const link = title.createEl('a', { cls: 'edge-link', text: project.title });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      void this.openPath(project.path);
    });
    title.createSpan({ cls: 'edge-hint', text: ` ${schemata.length} lenses, ${todayIso()}` });
    if (schemata.length === 0) {
      this.empty('No schemata to sweep with.');
      return;
    }
    const list = el.createDiv({ cls: 'edge-list' });
    for (const schema of schemata) await this.renderLens(list, project, schema);
  }

  private async renderLens(list: HTMLElement, project: Note, schema: SchemaNote): Promise<void> {
    const ops = this.plugin.ops();
    const item = list.createDiv({ cls: 'edge-item' });
    const head = item.createDiv({ cls: 'edge-item-head' });
    const link = head.createEl('a', { cls: 'edge-link', text: schema.title });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      void this.openPath(schema.path);
    });
    const lens = item.createDiv({ cls: 'edge-lens' });
    if (schema.lens) await MarkdownRenderer.render(this.app, schema.lens, lens, schema.path, this);
    else lens.setText('(no ## Lens section)');

    const box = item.createEl('textarea', { cls: 'edge-answer', attr: { rows: '3', placeholder: 'what this lens exposes in the project' } });
    box.value = this.drafts.get(schema.path) ?? '';
    box.addEventListener('input', () => this.drafts.set(schema.path, box.value));

    const actions = item.createDiv({ cls: 'edge-actions' });
    const save = actions.createEl('button', { text: 'save', cls: 'mod-cta' });
    const ask = actions.createEl('button', { text: 'make this a question' });
    const paint = () => {
      const empty = box.value.trim() === '';
      save.disabled = empty;
      ask.toggleClass('edge-hidden', !empty || !schema.lens);
    };
    box.addEventListener('input', paint);
    paint();

    save.addEventListener('click', async () => {
      const answer = box.value.trim();
      if (!answer) return;
      save.disabled = true;
      await ops.addLensSweep(project.path, todayIso(), this.schemaLink(schema, project), answer);
      this.drafts.delete(schema.path);
      box.value = '';
      paint();
      new Notice(`sweep saved to ${project.name}`);
    });
    ask.addEventListener('click', async () => {
      ask.disabled = true;
      const path = await ops.lensToQuestion(project.path, todayIso(), this.schemaLink(schema, project), project.name, schema.name, schema.lens);
      await this.openPath(path);
    });
  }

  /** A link to the schema in the vault's own link style, so it resolves on every device. */
  private schemaLink(schema: SchemaNote, project: Note): string {
    const f = this.app.vault.getAbstractFileByPath(schema.path);
    if (f instanceof TFile) return this.app.fileManager.generateMarkdownLink(f, project.path);
    return `[[${schema.name}]]`;
  }
}
