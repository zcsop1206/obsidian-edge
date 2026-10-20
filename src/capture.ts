import { type App, Modal, Notice } from 'obsidian';
import type EdgePlugin from './main';
import { TAG_LABELS, TAGS, type Tag, todayIso } from './text';

/**
 * Capture: six tag buttons and a text field. Enter (or the Capture button, for touch) appends
 * `- YYYY-MM-DD <tag> <text>` to the inbox. Nothing else.
 */
export class CaptureModal extends Modal {
  private tag: Tag | null;
  private buttons = new Map<Tag, HTMLButtonElement>();
  private input!: HTMLInputElement;

  constructor(app: App, private plugin: EdgePlugin, preset: { tag?: Tag; text?: string } = {}) {
    super(app);
    this.tag = preset.tag ?? null;
    this.presetText = preset.text ?? '';
  }
  private presetText: string;

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('edge-capture');
    this.titleEl.setText('Capture');

    const tags = contentEl.createDiv({ cls: 'edge-tags' });
    for (const tag of TAGS) {
      const b = tags.createEl('button', { cls: 'edge-tag', attr: { type: 'button', 'aria-label': TAG_LABELS[tag] } });
      b.createSpan({ cls: 'edge-tag-sign', text: tag });
      b.createSpan({ cls: 'edge-tag-label', text: TAG_LABELS[tag] });
      b.addEventListener('click', () => {
        this.tag = tag;
        this.paint();
        this.input.focus();
      });
      this.buttons.set(tag, b);
    }

    const row = contentEl.createDiv({ cls: 'edge-capture-row' });
    this.input = row.createEl('input', {
      cls: 'edge-capture-input',
      attr: { type: 'text', placeholder: 'one line, tag first', enterkeyhint: 'done', autocapitalize: 'off' },
    });
    this.input.value = this.presetText;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        void this.submit();
      }
    });
    const go = row.createEl('button', { cls: 'mod-cta', text: 'Capture', attr: { type: 'button' } });
    go.addEventListener('click', () => void this.submit());

    this.paint();
    window.setTimeout(() => this.input.focus(), 0);
  }

  private paint(): void {
    for (const [tag, b] of this.buttons) b.toggleClass('is-active', tag === this.tag);
  }

  private async submit(): Promise<void> {
    const text = this.input.value.trim();
    if (!this.tag) {
      new Notice('edge: pick a tag first');
      return;
    }
    if (!text) {
      new Notice('edge: nothing to capture');
      return;
    }
    const line = await this.plugin.ops().capture(todayIso(), this.tag, text);
    new Notice(`captured: ${line.slice(2)}`);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
