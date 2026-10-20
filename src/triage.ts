import { Notice, type WorkspaceLeaf } from 'obsidian';
import { pickProject, pickSchema } from './pickers';
import { type InboxLine, TAG_LABELS, todayIso } from './text';
import { EdgeView } from './views';

export const VIEW_TYPE_TRIAGE = 'edge-triage';

/**
 * Triage: the inbox as a list. Each line has buttons for what it becomes. The plugin pastes
 * the line, dated, under the right heading and removes it from the inbox; the owner writes
 * everything beyond that.
 */
export class TriageView extends EdgeView {
  constructor(leaf: WorkspaceLeaf, plugin: import('./main').default) {
    super(leaf, plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_TRIAGE;
  }
  getDisplayText(): string {
    return 'Edge: triage';
  }
  getIcon(): string {
    return 'inbox';
  }

  async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    const ops = this.plugin.ops();
    const lines = await ops.inboxLines();
    this.header('Inbox', lines.length === 0 ? 'empty' : `${lines.length} to triage`);
    if (lines.length === 0) {
      this.empty('Inbox is empty. Capture during work; triage daily.');
      return;
    }
    const list = el.createDiv({ cls: 'edge-list' });
    for (const line of lines) this.renderLine(list, line);
  }

  private renderLine(list: HTMLElement, line: InboxLine): void {
    const item = list.createDiv({ cls: 'edge-item' });
    const head = item.createDiv({ cls: 'edge-item-head' });
    head.createSpan({ cls: `edge-tag-sign edge-tag-${TAG_LABELS[line.tag]}`, text: line.tag, attr: { title: TAG_LABELS[line.tag] } });
    head.createSpan({ cls: 'edge-date', text: line.date });
    item.createDiv({ cls: 'edge-item-text', text: line.text });

    const actions = item.createDiv({ cls: 'edge-actions' });
    const button = (label: string, run: () => Promise<void>, primary = false) => {
      const b = actions.createEl('button', { text: label, cls: primary ? 'mod-cta' : '' });
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await run();
        } catch (e) {
          console.error('edge:', e);
          new Notice(`edge: ${(e as Error).message ?? e}`);
          b.disabled = false;
        }
      });
    };

    const ops = this.plugin.ops();
    const date = todayIso();
    const primary: Record<string, string> = { '?': 'question', '!': 'surprise', 'p': 'prediction', 'x': 'anomaly', '=': 'exemplar', '~': 'exemplar' };

    button(
      'question',
      async () => {
        const path = await ops.createQuestion(date, line.text, `inbox ${line.date} ${line.tag}`);
        await ops.removeInboxLine(line);
        await this.openPath(path);
      },
      primary[line.tag] === 'question',
    );
    button(
      'anomaly on schema',
      async () => {
        const schema = await pickSchema(this.app, ops);
        if (!schema) return;
        await ops.addToSchema(schema.path, 'Anomalies', line.date, line.text);
        await ops.removeInboxLine(line);
        await this.openPath(schema.path);
      },
      primary[line.tag] === 'anomaly',
    );
    button(
      'exemplar on schema',
      async () => {
        const schema = await pickSchema(this.app, ops);
        if (!schema) return;
        await ops.addToSchema(schema.path, 'Exemplars', line.date, line.text);
        await ops.removeInboxLine(line);
        await this.openPath(schema.path);
      },
      primary[line.tag] === 'exemplar',
    );
    button(
      'surprise on project',
      async () => {
        const project = await pickProject(this.app, ops);
        if (!project) return;
        await ops.addSurprise(project.path, line.date, line.text);
        await ops.removeInboxLine(line);
        await this.openPath(project.path);
      },
      primary[line.tag] === 'surprise',
    );
    button(
      'prediction on project',
      async () => {
        const project = await pickProject(this.app, ops);
        if (!project) return;
        await ops.addPrediction(project.path, line.date, line.text);
        await ops.removeInboxLine(line);
        await this.openPath(project.path);
      },
      primary[line.tag] === 'prediction',
    );
    const del = actions.createEl('button', { text: 'delete', cls: 'edge-danger' });
    del.addEventListener('click', async () => {
      await ops.removeInboxLine(line);
    });
  }
}
