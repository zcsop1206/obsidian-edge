import { ItemView, Notice, TFile, type WorkspaceLeaf } from 'obsidian';
import type EdgePlugin from './main';

/** Shared base: a side-panel view that re-renders when a file in the edge folder changes. */
export abstract class EdgeView extends ItemView {
  protected refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, protected plugin: EdgePlugin) {
    super(leaf);
  }

  abstract render(): Promise<void>;

  getIcon(): string {
    return 'compass';
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('edge-view');
    this.registerEvent(this.app.vault.on('modify', (f) => this.onVaultChange(f.path)));
    this.registerEvent(this.app.vault.on('create', (f) => this.onVaultChange(f.path)));
    this.registerEvent(this.app.vault.on('delete', (f) => this.onVaultChange(f.path)));
    this.registerEvent(this.app.vault.on('rename', (f) => this.onVaultChange(f.path)));
    await this.safeRender();
  }

  protected onVaultChange(path: string): void {
    if (!path.startsWith(this.plugin.settings.edgeFolder + '/')) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.safeRender();
    }, 250);
  }

  protected async safeRender(): Promise<void> {
    try {
      await this.render();
    } catch (e) {
      console.error('edge:', e);
      this.contentEl.empty();
      this.contentEl.createEl('p', { cls: 'edge-error', text: `edge: ${(e as Error).message ?? e}` });
    }
  }

  protected async openPath(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      new Notice(`edge: cannot open ${path}`);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(f);
  }

  protected header(text: string, hint?: string): HTMLElement {
    const h = this.contentEl.createDiv({ cls: 'edge-header' });
    h.createEl('h4', { text });
    if (hint) h.createSpan({ cls: 'edge-hint', text: hint });
    return h;
  }

  protected empty(text: string): void {
    this.contentEl.createEl('p', { cls: 'edge-empty', text });
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.contentEl.empty();
  }
}
