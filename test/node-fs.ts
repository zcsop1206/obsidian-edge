import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { EdgeFs } from '../src/ops';

/** EdgeFs over a folder on disk, for the tests. Paths are vault-relative with `/`. */
export class NodeFs implements EdgeFs {
  constructor(private root: string) {}
  private abs(p: string): string {
    return path.join(this.root, ...p.split('/'));
  }
  async read(p: string): Promise<string> {
    return fs.readFile(this.abs(p), 'utf8');
  }
  async write(p: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(this.abs(p)), { recursive: true });
    await fs.writeFile(this.abs(p), text, 'utf8');
  }
  async process(p: string, fn: (text: string) => string): Promise<string> {
    const cur = (await this.exists(p)) ? await this.read(p) : '';
    const next = fn(cur);
    await this.write(p, next);
    return next;
  }
  async exists(p: string): Promise<boolean> {
    try {
      await fs.access(this.abs(p));
      return true;
    } catch {
      return false;
    }
  }
  async list(folder: string): Promise<string[]> {
    try {
      const names = await fs.readdir(this.abs(folder), { withFileTypes: true });
      return names.filter((d) => d.isFile() && d.name.endsWith('.md')).map((d) => `${folder}/${d.name}`).sort();
    } catch {
      return [];
    }
  }
  async folders(folder: string): Promise<string[]> {
    try {
      const names = await fs.readdir(this.abs(folder), { withFileTypes: true });
      return names.filter((d) => d.isDirectory()).map((d) => d.name).sort();
    } catch {
      return [];
    }
  }
}
