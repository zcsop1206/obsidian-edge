import { type App, PluginSettingTab, Setting } from 'obsidian';
import type EdgePlugin from './main';

export interface EdgeSettings {
  /** Vault-relative path of the edge folder. */
  edgeFolder: string;
  /** Vault-relative path of the portfolio projects folder (one sub-folder per project). */
  projectsFolder: string;
  /** Python executable for the probes. Empty means `python` on the PATH. Desktop only. */
  python: string;
  /** The `--model` passed to probes/surprisal.py. */
  probeModel: string;
}

export const DEFAULT_SETTINGS: EdgeSettings = {
  edgeFolder: 'edge',
  projectsFolder: 'projects',
  python: '',
  probeModel: 'google/gemma-2-2b',
};

export function parseSettings(raw: unknown): EdgeSettings {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.edgeFolder === 'string' && r.edgeFolder.trim()) s.edgeFolder = r.edgeFolder.trim().replace(/^\/+|\/+$/g, '');
    if (typeof r.projectsFolder === 'string') s.projectsFolder = r.projectsFolder.trim().replace(/^\/+|\/+$/g, '');
    if (typeof r.python === 'string') s.python = r.python.trim();
    if (typeof r.probeModel === 'string' && r.probeModel.trim()) s.probeModel = r.probeModel.trim();
  }
  return s;
}

export class EdgeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: EdgePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Edge folder')
      .setDesc('Vault path of the edge folder (inbox, questions, schemata, projects, templates, probes).')
      .addText((t) =>
        t
          .setPlaceholder('edge')
          .setValue(this.plugin.settings.edgeFolder)
          .onChange(async (v) => {
            this.plugin.settings.edgeFolder = v.trim().replace(/^\/+|\/+$/g, '') || 'edge';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Projects folder')
      .setDesc('Vault path of the portfolio projects, one folder per project. Used to offer an edge project note for a project that has none yet.')
      .addText((t) =>
        t
          .setPlaceholder('projects')
          .setValue(this.plugin.settings.projectsFolder)
          .onChange(async (v) => {
            this.plugin.settings.projectsFolder = v.trim().replace(/^\/+|\/+$/g, '');
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Python executable')
      .setDesc('For the probes, desktop only. Leave empty to use `python` from the PATH.')
      .addText((t) =>
        t
          .setPlaceholder('python')
          .setValue(this.plugin.settings.python)
          .onChange(async (v) => {
            this.plugin.settings.python = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Probe model')
      .setDesc('Passed as --model to probes/surprisal.py.')
      .addText((t) =>
        t
          .setPlaceholder(DEFAULT_SETTINGS.probeModel)
          .setValue(this.plugin.settings.probeModel)
          .onChange(async (v) => {
            this.plugin.settings.probeModel = v.trim() || DEFAULT_SETTINGS.probeModel;
            await this.plugin.saveSettings();
          }),
      );
  }
}
