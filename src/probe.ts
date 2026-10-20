import { type App, FileSystemAdapter, Notice, Platform, TFile } from 'obsidian';
import type EdgePlugin from './main';

/** The slice of node's child_process the probe uses, typed here to keep @types/node out. */
interface ChildProcessLike {
  stdout: { on(event: 'data', cb: (chunk: { toString(): string }) => void): void };
  stderr: { on(event: 'data', cb: (chunk: { toString(): string }) => void): void };
  on(event: 'error', cb: (e: Error) => void): void;
  on(event: 'close', cb: (code: number | null) => void): void;
}
type Spawn = (cmd: string, args: string[], opts: { cwd: string; windowsHide: boolean }) => ChildProcessLike;

/**
 * Probe: runs `python <edge>/probes/surprisal.py <schema> --model <setting>` and opens the
 * output note in <edge>/probes/out/. Desktop only. It never writes to a schema: the script
 * reads the schema and writes its own file, and the plugin only opens that file.
 */
export async function runSurprisalProbe(app: App, plugin: EdgePlugin, schema: TFile): Promise<void> {
  if (!Platform.isDesktop) {
    new Notice('edge: probes run on desktop only');
    return;
  }
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    new Notice('edge: no file system access');
    return;
  }
  const base = adapter.getBasePath();
  // Required here, not imported, so the bundle still loads on iOS where node is absent.
  const nodeRequire = (window as unknown as { require: (id: string) => unknown }).require;
  const { spawn } = nodeRequire('child_process') as { spawn: Spawn };
  const path = nodeRequire('path') as { join: (...parts: string[]) => string };

  const ops = plugin.ops();
  const edgeAbs = path.join(base, ops.edge);
  const script = path.join(edgeAbs, 'probes', 'surprisal.py');
  const python = plugin.settings.python || 'python';
  const model = plugin.settings.probeModel;
  const args = [script, path.join(base, schema.path), '--model', model];

  const notice = new Notice(`edge: probing ${schema.basename} with ${model}…`, 0);
  const child = spawn(python, args, { cwd: edgeAbs, windowsHide: true });
  let stderr = '';
  let stdout = '';
  child.stdout.on('data', (d) => (stdout += d.toString()));
  child.stderr.on('data', (d) => (stderr += d.toString()));
  child.on('error', (e: Error) => {
    notice.hide();
    new Notice(`edge: could not start ${python}: ${e.message}`, 8000);
  });
  child.on('close', async (code: number | null) => {
    notice.hide();
    if (code !== 0) {
      console.error('edge probe failed', { code, stdout, stderr });
      new Notice(`edge: probe exited ${code}. ${stderr.trim().split('\n').pop() ?? ''}`, 10000);
      return;
    }
    const tag = model.split('/').pop()!.toLowerCase();
    const outPath = `${ops.probesOutFolder}/${schema.basename}.surprisal.${tag}.md`;
    // The vault notices the new file a moment after the script wrote it.
    for (let i = 0; i < 20; i++) {
      const f = app.vault.getAbstractFileByPath(outPath);
      if (f instanceof TFile) {
        await app.workspace.getLeaf(false).openFile(f);
        new Notice(`edge: ${stdout.trim().split('\n').pop() ?? 'probe done'}`, 8000);
        return;
      }
      await new Promise((r) => window.setTimeout(r, 250));
    }
    new Notice(`edge: probe done; output at ${outPath}`, 8000);
  });
}
