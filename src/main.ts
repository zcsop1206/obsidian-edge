import { Notice, Platform, Plugin, TFile, type WorkspaceLeaf } from 'obsidian';
import { CaptureModal } from './capture';
import { DueView, VIEW_TYPE_DUE } from './due';
import { HealthView, VIEW_TYPE_HEALTH } from './health';
import { EdgeOps } from './ops';
import { runSurprisalProbe } from './probe';
import { DEFAULT_SETTINGS, EdgeSettingTab, type EdgeSettings, parseSettings } from './settings';
import { SweepView, VIEW_TYPE_SWEEP } from './sweep';
import { TriageView, VIEW_TYPE_TRIAGE } from './triage';
import { VaultFs } from './vault-fs';

/**
 * Edge: a GUI for the edge metacognition folder. Five surfaces: capture, triage, due,
 * health, sweep; plus the surprisal probe on desktop.
 *
 * Hard rule (edge/CORE.md): the plugin surfaces signals, schedules and counts. It never
 * writes derivations, generalizations, exemplars or schema prose, and no probe result
 * changes `held`, the counters or the drill fields.
 */
export default class EdgePlugin extends Plugin {
  settings: EdgeSettings = { ...DEFAULT_SETTINGS };

  ops(): EdgeOps {
    return new EdgeOps(new VaultFs(this.app), { edge: this.settings.edgeFolder, projects: this.settings.projectsFolder });
  }

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.addSettingTab(new EdgeSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_TRIAGE, (leaf) => new TriageView(leaf, this));
    this.registerView(VIEW_TYPE_DUE, (leaf) => new DueView(leaf, this));
    this.registerView(VIEW_TYPE_HEALTH, (leaf) => new HealthView(leaf, this));
    this.registerView(VIEW_TYPE_SWEEP, (leaf) => new SweepView(leaf, this));

    this.addCommand({
      id: 'capture',
      name: 'Capture to inbox',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'e' }],
      callback: () => new CaptureModal(this.app, this).open(),
    });
    this.addRibbonIcon('compass', 'Edge: capture', () => new CaptureModal(this.app, this).open());

    this.addCommand({ id: 'triage', name: 'Open triage', callback: () => void this.openView(VIEW_TYPE_TRIAGE) });
    this.addCommand({ id: 'due', name: 'Open due drills', callback: () => void this.openView(VIEW_TYPE_DUE) });
    this.addCommand({ id: 'health', name: 'Open schema health', callback: () => void this.openView(VIEW_TYPE_HEALTH) });
    this.addCommand({ id: 'sweep', name: 'Open lens sweep', callback: () => void this.openView(VIEW_TYPE_SWEEP) });

    this.addCommand({
      id: 'probe-surprisal',
      name: 'Run surprisal probe on this schema',
      checkCallback: (checking) => {
        if (!Platform.isDesktop) return false;
        const f = this.app.workspace.getActiveFile();
        const inSchemata = f instanceof TFile && f.path.startsWith(`${this.settings.edgeFolder}/schemata/`);
        if (!inSchemata) return false;
        if (!checking) void runSurprisalProbe(this.app, this, f);
        return true;
      },
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Shows the view in the right sidebar, reusing an open one. */
  async openView(type: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(type);
    let leaf: WorkspaceLeaf | null = existing[0] ?? null;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice('edge: no sidebar available');
        return;
      }
      await leaf.setViewState({ type, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  onunload(): void {
    // Obsidian detaches the registered views itself.
  }
}
