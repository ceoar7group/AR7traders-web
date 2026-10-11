// Read a workflow the way the runner does.
//
// Shared by scripts/workflow-contracts.test.mjs (does it parse, does it talk to
// things that exist, are the schedules sane) and scripts/workflow-execution.test.mjs
// (does the shell actually DO the right thing when the endpoint answers). Both
// need the same answer to "what shell does this step get?", and two copies of
// that would drift — which is the whole class of bug these suites exist for.
//
// Not a test file: it prints nothing and asserts nothing.

/**
 * Every `run:` step in a workflow, as the shell text the runner executes.
 *
 * Handles both `run: |` blocks (dedented by their own minimum indentation, the
 * way YAML block scalars work) and one-line `- run: cmd` steps. A job whose id
 * is literally `run` (`jobs: run:`) is not a step: a bare `run:` with nothing
 * after the colon is a mapping key, never a command.
 *
 * @param {string} text the workflow file
 * @returns {{line: number, shell: string}[]}
 */
export function runBlocks(text) {
  const lines = text.split('\n');
  const indentOf = l => l.match(/^\s*/)[0].length;
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const blockOpen = line.match(/^(\s*)(?:- )?run:\s*\|?\s*$/);
    if (blockOpen) {
      const base = indentOf(line);
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (!lines[j].trim()) { body.push(''); continue; }
        if (indentOf(lines[j]) <= base) break;
        body.push(lines[j]);
      }
      const filled = body.filter(l => l.trim());
      if (!filled.length) { i = j - 1; continue; }
      const strip = Math.min(...filled.map(indentOf));
      found.push({ line: i + 1, shell: body.map(l => (l.trim() ? l.slice(strip) : '')).join('\n').trimEnd() });
      i = j - 1;
      continue;
    }
    const inline = line.match(/^(\s*)(?:- )?run:\s+(\S.*)$/);
    if (inline) found.push({ line: i + 1, shell: inline[2] });
  }
  return found;
}

/**
 * The `node -e "…"` bodies inside one shell block, so they can be parsed as JS.
 * `closed` is false when the closing quote is missing — the runner would treat
 * the rest of the step as script text.
 *
 * @param {string} shell
 * @returns {{line: number, body: string, closed: boolean}[]}
 */
export function nodeEvalBodies(shell) {
  const lines = shell.split('\n');
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/node -e "?$/.test(lines[i])) continue;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (lines[j].trim().startsWith('"')) break;
      body.push(lines[j]);
    }
    bodies.push({ line: i + 1, body: body.join('\n'), closed: j < lines.length });
    i = j;
  }
  return bodies;
}

/**
 * The one `run:` step that mentions `marker` — how the execution suite picks
 * "the step that triggers the sync" out of a workflow without hard-coding its
 * line number.
 *
 * @param {string} text the workflow file
 * @param {string|RegExp} marker
 * @returns {{line: number, shell: string}}
 */
export function stepContaining(text, marker) {
  const match = runBlocks(text).find(block =>
    typeof marker === 'string' ? block.shell.includes(marker) : marker.test(block.shell));
  if (!match) throw new Error(`no run: step contains ${String(marker)}`);
  return match;
}

/**
 * The `run:` step whose `- name:` is (or contains) `name`.
 *
 * Steps are selected by name rather than by line, and by name rather than by
 * "the first step that mentions curl": a workflow's step order is allowed to
 * change, but a step that is renamed has to be renamed here too — which is the
 * point, since renaming "Trigger machinery sync on Vercel" is a real change.
 *
 * @param {string} text the workflow file
 * @param {string} name
 * @returns {{line: number, shell: string, name: string}}
 */
export function stepNamed(text, name) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^(\s*)- name:\s*(.+?)\s*$/);
    if (!heading || !heading[2].includes(name)) continue;
    const stepIndent = heading[1].length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].match(/^(\s*)- (name|uses|run):/);
      if (next && next[1].length === stepIndent) { end = j; break; }
    }
    const [block] = runBlocks(lines.slice(i, end).join('\n'));
    if (!block) throw new Error(`the step "${name}" has no run: block`);
    return { ...block, name: heading[2] };
  }
  throw new Error(`no step is named "${name}"`);
}
