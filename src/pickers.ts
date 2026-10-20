import { type App, FuzzySuggestModal, Notice } from 'obsidian';
import type { EdgeOps, Note, SchemaNote } from './ops';
import { todayIso } from './text';

/** Fuzzy pick of one note. Resolves null when dismissed. */
class NotePicker<T extends Note> extends FuzzySuggestModal<T> {
  private chosen = false;
  constructor(app: App, private items: T[], private resolve: (n: T | null) => void, placeholder: string) {
    super(app);
    this.setPlaceholder(placeholder);
  }
  getItems(): T[] {
    return this.items;
  }
  getItemText(item: T): string {
    return item.title === item.name ? item.name : `${item.name}  ${item.title}`;
  }
  onChooseItem(item: T): void {
    this.chosen = true;
    this.resolve(item);
  }
  onClose(): void {
    // Obsidian closes the modal before it calls onChooseItem, so give the choice a tick to land.
    window.setTimeout(() => {
      if (!this.chosen) this.resolve(null);
    }, 0);
  }
}

export function pickSchema(app: App, ops: EdgeOps): Promise<SchemaNote | null> {
  return ops.schemata().then((items) => {
    if (items.length === 0) {
      new Notice(`edge: no schemata in ${ops.schemataFolder}`);
      return null;
    }
    return new Promise<SchemaNote | null>((resolve) => new NotePicker(app, items, resolve, 'schema…').open());
  });
}

interface ProjectChoice extends Note {
  /** Set when choosing creates the edge note for a portfolio project that has none. */
  newSlug?: string;
}

/** A project note in <edge>/projects/, or a portfolio project to make a note for. */
export async function pickProject(app: App, ops: EdgeOps): Promise<Note | null> {
  const items: ProjectChoice[] = await ops.projects();
  for (const slug of await ops.portfolioProjectsWithoutNote()) {
    items.push({ path: '', name: slug, title: `${slug} (new edge note)`, fm: {}, text: '', newSlug: slug });
  }
  if (items.length === 0) {
    new Notice(`edge: no project notes in ${ops.projectsFolder}`);
    return null;
  }
  const chosen = await new Promise<ProjectChoice | null>((resolve) =>
    new NotePicker(app, items, resolve, 'project…').open(),
  );
  if (!chosen) return null;
  if (chosen.newSlug) {
    const path = await ops.createProjectNote(todayIso(), chosen.newSlug);
    return ops.note(path);
  }
  return chosen;
}
