# Edge

An Obsidian plugin that gives a GUI to the `edge/` folder of plain markdown: the metacognition system for moving knowledge across known known, known unknown, unknown known and unknown unknown. The system's rules are in that folder's `PROTOCOL.md`; what a schema is and why the five surfaces are these five is in its `CORE.md`.

## The hard rule

The plugin surfaces signals, schedules and counts. It never writes derivations, generalizations, exemplars or any other schema prose. Every line it adds to a file is a line the owner typed, dated, pasted under the right heading. No probe result changes `held`, a counter or a drill field. If anything this plugin writes could be pasted into a schema as understanding, it is a bug.

## Five surfaces

1. **Capture** (`Edge: Capture to inbox`, default hotkey Ctrl/Cmd+Shift+E, also the compass ribbon icon). A modal with six tag buttons (`?` question, `!` surprise, `~` hunch, `=` derivation, `x` error, `p` prediction) and a text field. Enter appends `- YYYY-MM-DD <tag> <text>` to `<edge>/inbox/inbox.md`. Works on mobile.
2. **Triage** (`Edge: Open triage`). The inbox as a list. Each line has buttons for what it becomes: **question** (a file in `<edge>/questions/` from `templates/question.md`, with the date filled and the line as the `# Q:` heading, then opened); **anomaly on schema** / **exemplar on schema** (pick a schema, append a dated bullet under `## Anomalies` or `## Exemplars`, creating the heading if missing, and bump the matching frontmatter counter); **surprise on project** / **prediction on project** (pick a project note in `<edge>/projects/`, append under `## Surprises` or add a row to the Predictions table, where a leading number is taken as `p`); **delete**. Every action removes the line from the inbox. The suggested action for the line's tag is highlighted.
3. **Due** (`Edge: Open due drills`). Schemata whose `drill_next` is today or earlier, each with the prompt "solve a new exemplar" and the schema's `## Generalization` (or the older `## Statement`). **Pass** stays disabled until the schema's `## Exemplars` section has grown since the view opened, so the exemplar is written by hand first; it then doubles `drill_interval` and sets `drill_next` to today plus the interval. **Fail** sets the interval to 1, `drill_next` to tomorrow, and opens Capture pre-tagged `x`.
4. **Health** (`Edge: Open schema health`). A table of schemata with the state computed from the frontmatter counters: anomalies > exemplars is **crisis**; else anomalies > confirmed is **degenerating**; else confirmed > 0 is **progressive**; else exemplars > 0 is **holding**; all zeros is untested. Crisis sorts to the top. Clicking a row opens the schema. Files still in the v0.1 shape (`confidence`, `cold`, `modes`) are read with missing counters as 0 and marked `v0.1`.
5. **Sweep** (`Edge: Open lens sweep`). Pick a project note; every schema's `## Lens` appears with a text box. **Save** appends `- YYYY-MM-DD [[schema]]: answer` under the project's `## Lens sweeps`. An empty answer offers **make this a question**, which creates a question file from the lens text and records the link under the sweep.

A project in the projects folder with no note in `<edge>/projects/` yet is offered in the project picker; choosing it creates the note from `templates/project.md`, with the date filled, the heading named and `writeup` linked.

**Probe** (`Edge: Run surprisal probe on this schema`, desktop only). With a schema file active, runs `python <edge>/probes/surprisal.py <schema> --model <setting>` and opens the output note in `<edge>/probes/out/`. The script writes its own file; the plugin never writes to a schema.

## Settings

- **Edge folder**: vault path of the edge folder, default `edge`.
- **Projects folder**: vault path of the portfolio projects (one folder per project), default `projects`.
- **Python executable**: for the probe, default `python` from the PATH.
- **Probe model**: the `--model` argument, default `google/gemma-2-2b`.

## File edits, precisely

Files are edited as text, not regenerated: a bullet is inserted after the last non-blank line of a section, a frontmatter field is replaced in place or added at the end of the block, a table row goes after the last row, and the file's own line ending (LF or CRLF) is kept. Every edit goes through Obsidian's vault API, so the metadata cache and other devices see it.

## Install

1. Install **BRAT** from Community plugins and enable it.
2. BRAT → Add beta plugin → `zcsop1206/obsidian-edge`.
3. Enable **Edge** under Community plugins and set the edge folder if it is not `edge`.

To work on it: `npm install`, `npm run build` produces `main.js`; copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/edge/`. `npm test` builds and runs the unit tests, which exercise every file operation on copies of real edge files and read them back.
