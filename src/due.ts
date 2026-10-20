import { MarkdownRenderer, Notice, type WorkspaceLeaf } from 'obsidian';
import { CaptureModal } from './capture';
import type { SchemaNote } from './ops';
import { todayIso } from './text';
import { EdgeView } from './views';

export const VIEW_TYPE_DUE = 'edge-due';

/**
 * Due: schemata whose drill_next is today or earlier. The drill is always "solve a new
 * exemplar". Pass stays disabled until the schema's Exemplars section has grown since the
 * view opened, so the exemplar is written by hand before the interval doubles.
 */
export class DueView extends EdgeView {
  /** Exemplars text per schema path when first seen by this view. */
  private baseline = new Map<string, string>();

  constructor(leaf: WorkspaceLeaf, plugin: import('./main').default) {
    super(leaf, plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_DUE;
  }
  getDisplayText(): string {
    return 'Edge: due';
  }
  getIcon(): string {
    return 'alarm-clock';
  }

  async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    const ops = this.plugin.ops();
    const today = todayIso();
    const due = await ops.due(today);
    this.header('Due', due.length === 0 ? 'nothing due' : `${due.length} to drill`);
    if (due.length === 0) {
      this.empty('No schema is due. Work on something else.');
      return;
    }
    for (const path of Array.from(this.baseline.keys())) if (!due.some((s) => s.path === path)) this.baseline.delete(path);
    const list = el.createDiv({ cls: 'edge-list' });
    for (const schema of due) await this.renderSchema(list, schema, today);
  }

  private async renderSchema(list: HTMLElement, schema: SchemaNote, today: string): Promise<void> {
    const ops = this.plugin.ops();
    const exemplars = await ops.exemplarsText(schema.path);
    if (!this.baseline.has(schema.path)) this.baseline.set(schema.path, exemplars);
    const grown = exemplars.length > (this.baseline.get(schema.path) ?? '').length;

    const item = list.createDiv({ cls: 'edge-item' });
    const head = item.createDiv({ cls: 'edge-item-head' });
    const link = head.createEl('a', { cls: 'edge-link', text: schema.title });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      void this.openPath(schema.path);
    });
    const overdue = schema.fm.drill_next < today;
    head.createSpan({ cls: 'edge-date', text: `due ${schema.fm.drill_next}${overdue ? ' (overdue)' : ''}, interval ${schema.fm.drill_interval || 1} d` });

    item.createDiv({ cls: 'edge-drill-prompt', text: 'solve a new exemplar' });
    const gen = item.createDiv({ cls: 'edge-generalization' });
    if (schema.generalization) await MarkdownRenderer.render(this.app, schema.generalization, gen, schema.path, this);
    else gen.setText('(no Generalization or Statement section)');

    const status = item.createDiv({ cls: 'edge-status' });
    status.setText(grown ? 'Exemplars grew since this view opened.' : 'Write the exemplar under ## Exemplars in the schema first; Pass unlocks when the section grows.');

    const actions = item.createDiv({ cls: 'edge-actions' });
    const pass = actions.createEl('button', { text: 'pass', cls: 'mod-cta' });
    pass.disabled = !grown;
    pass.addEventListener('click', async () => {
      pass.disabled = true;
      const r = await ops.drill(schema.path, 'pass', today);
      this.baseline.delete(schema.path);
      new Notice(`${schema.name}: next ${r.next} (interval ${r.interval} d)`);
    });
    const fail = actions.createEl('button', { text: 'fail' });
    fail.addEventListener('click', async () => {
      fail.disabled = true;
      const r = await ops.drill(schema.path, 'fail', today);
      this.baseline.delete(schema.path);
      new Notice(`${schema.name}: next ${r.next} (interval 1 d)`);
      new CaptureModal(this.app, this.plugin, { tag: 'x', text: `failed drill ${schema.name}: ` }).open();
    });
    const open = actions.createEl('button', { text: 'open schema' });
    open.addEventListener('click', () => void this.openPath(schema.path));
  }
}
