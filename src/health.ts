import { type WorkspaceLeaf } from 'obsidian';
import { HEALTH_ORDER } from './text';
import { EdgeView } from './views';

export const VIEW_TYPE_HEALTH = 'edge-health';

/**
 * Health: every schema with its state computed from the frontmatter counters (CORE.md):
 * anomalies > exemplars is crisis; anomalies > confirmed is degenerating; confirmed > 0 and
 * anomalies <= confirmed is progressive; confirmed = 0 and exemplars > 0 is holding.
 * Missing counters (v0.1 files) count as 0. Crisis sorts to the top.
 */
export class HealthView extends EdgeView {
  constructor(leaf: WorkspaceLeaf, plugin: import('./main').default) {
    super(leaf, plugin);
  }

  getViewType(): string {
    return VIEW_TYPE_HEALTH;
  }
  getDisplayText(): string {
    return 'Edge: health';
  }
  getIcon(): string {
    return 'activity';
  }

  async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    const schemata = await this.plugin.ops().schemata();
    this.header('Health', `${schemata.length} schemata`);
    if (schemata.length === 0) {
      this.empty('No schemata yet.');
      return;
    }
    schemata.sort((a, b) => HEALTH_ORDER[a.health.state] - HEALTH_ORDER[b.health.state] || a.name.localeCompare(b.name));

    const table = el.createEl('table', { cls: 'edge-table' });
    const thead = table.createEl('thead').createEl('tr');
    for (const h of ['schema', 'state', 'held', 'ex', 'an', 'pr', 'co', 'next drill']) thead.createEl('th', { text: h });
    const tbody = table.createEl('tbody');
    for (const s of schemata) {
      const tr = tbody.createEl('tr', { cls: `edge-row edge-state-${s.health.state}` });
      tr.createEl('td', { cls: 'edge-cell-name', text: s.name });
      const state = tr.createEl('td');
      state.createSpan({ cls: `edge-state edge-state-${s.health.state}`, text: s.health.state });
      if (s.health.legacy) state.createSpan({ cls: 'edge-hint', text: ' v0.1', attr: { title: 'old frontmatter (confidence, cold, modes); counters read as 0' } });
      tr.createEl('td', { text: s.health.held ? 'yes' : 'no' });
      tr.createEl('td', { cls: 'edge-num', text: String(s.health.exemplars) });
      tr.createEl('td', { cls: 'edge-num', text: String(s.health.anomalies) });
      tr.createEl('td', { cls: 'edge-num', text: String(s.health.predictions) });
      tr.createEl('td', { cls: 'edge-num', text: String(s.health.confirmed) });
      tr.createEl('td', { cls: 'edge-num', text: s.fm.drill_next || '' });
      tr.addEventListener('click', () => void this.openPath(s.path));
    }
    el.createEl('p', { cls: 'edge-hint', text: 'ex exemplars, an anomalies, pr predictions, co confirmed. Counters are edited by hand or bumped by triage.' });
  }
}
