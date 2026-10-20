import { type App, normalizePath, TFile, TFolder } from 'obsidian';
import type { EdgeFs } from './ops';

/** EdgeFs over Obsidian's vault API, so every write goes through Obsidian and its cache. */
export class VaultFs implements EdgeFs {
  constructor(private app: App) {}

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return f instanceof TFile ? f : null;
  }

  async read(path: string): Promise<string> {
    const f = this.file(path);
    if (!f) throw new Error(`edge: no file ${path}`);
    return this.app.vault.read(f);
  }

  async write(path: string, text: string): Promise<void> {
    const f = this.file(path);
    if (f) {
      await this.app.vault.modify(f, text);
      return;
    }
    await this.ensureFolder(path.split('/').slice(0, -1).join('/'));
    await this.app.vault.create(normalizePath(path), text);
  }

  async process(path: string, fn: (text: string) => string): Promise<string> {
    const f = this.file(path);
    if (!f) {
      const text = fn('');
      await this.write(path, text);
      return text;
    }
    return this.app.vault.process(f, fn);
  }

  async exists(path: string): Promise<boolean> {
    return this.file(path) !== null;
  }

  async list(folder: string): Promise<string[]> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(folder));
    if (!(f instanceof TFolder)) return [];
    return f.children
      .filter((c): c is TFile => c instanceof TFile && c.extension === 'md')
      .map((c) => c.path)
      .sort();
  }

  async folders(folder: string): Promise<string[]> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(folder));
    if (!(f instanceof TFolder)) return [];
    return f.children
      .filter((c): c is TFolder => c instanceof TFolder)
      .map((c) => c.name)
      .sort();
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) return;
    const parts = folder.split('/');
    let cur = '';
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      if (!this.app.vault.getAbstractFileByPath(normalizePath(cur))) await this.app.vault.createFolder(normalizePath(cur));
    }
  }
}
