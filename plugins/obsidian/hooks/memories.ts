import type { EngineInterface } from 'claude-code';

import type { Memory, MemoryType } from '../types';

export const MEMORY_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

// The value of a frontmatter key, indented or not. Quotes around it are
// dropped.
const field = (frontmatter: string, key: string): string | undefined => {
  const match = frontmatter.match(new RegExp(`^\\s*${key}:[ \\t]*(.*)$`, 'm'));
  const value = match?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  return value === '' ? undefined : value;
};

// A memory file's frontmatter as a Memory. Files that are not memories (no
// frontmatter, or no name or known type) give undefined.
export const parseMemory = (
  file: string,
  text: string,
  mtimeMs: number,
): Memory | undefined => {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (frontmatter === undefined) return undefined;
  const name = field(frontmatter, 'name');
  const type = MEMORY_TYPES.find((t) => t === field(frontmatter, 'type'));
  if (name === undefined || type === undefined) return undefined;

  return {
    file,
    name,
    description: field(frontmatter, 'description') ?? '',
    type,
    mtimeMs,
  };
};

// The memories by type, in the order of MEMORY_TYPES, newest first. A type
// with no memories is left out.
export const groupByType = (
  memories: Memory[],
): { type: MemoryType; memories: Memory[] }[] =>
  MEMORY_TYPES.map((type) => ({
    type,
    memories: memories
      .filter((m) => m.type === type)
      .sort((a, b) => b.mtimeMs - a.mtimeMs),
  })).filter((group) => group.memories.length > 0);

// MEMORY.md without the line that points at a file.
export const removeIndexLine = (index: string, file: string): string =>
  index
    .split('\n')
    .filter((line) => !line.includes(`](${file})`))
    .join('\n');

// The folder Claude keeps a project's memories in: the project's root with
// every character other than a letter or digit turned into a dash.
export const memoryDirFor = (home: string, root: string): string =>
  `${home}/.claude/projects/${root.replace(/[^a-zA-Z0-9]/g, '-')}/memory`;

// Where the session's project keeps its memory files.
export async function memoryDir($: EngineInterface): Promise<string> {
  const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim();

  return memoryDirFor(home, await $.session.root());
}

// The memories of the session's project. A missing folder, and files that are
// not memories, leave nothing in the list.
export async function loadMemories($: EngineInterface): Promise<Memory[]> {
  const dir = await memoryDir($);
  const entries = await $.fs.list(dir).catch(() => []);
  const memories = await Promise.all(
    entries
      .filter((f) => f.kind === 'file' && f.name.endsWith('.md'))
      .filter((f) => f.name !== 'MEMORY.md')
      .map(async (f) =>
        parseMemory(f.name, await $.fs.read(`${dir}/${f.name}`), f.mtimeMs),
      ),
  );

  return memories.filter((m): m is Memory => m !== undefined);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// How long ago a file changed, in the largest whole unit: "today", "3d",
// "2w", "5mo" or "1y".
export const formatAge = (now: number, mtimeMs: number): string => {
  const days = Math.floor((now - mtimeMs) / DAY_MS);
  if (days < 1) return 'today';
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;

  return `${Math.floor(days / 365)}y`;
};

// How many memories last changed at least `days` days ago.
export const staleCount = (
  now: number,
  memories: Memory[],
  days: number,
): number =>
  memories.filter((m) => now - m.mtimeMs >= days * DAY_MS).length;

// A memory's name without the type it starts with ("feedback-vault-skills" in
// the feedback group is "vault-skills"). A name with no such prefix, or that
// is nothing but the prefix, stays as it is.
export const shortName = (memory: Memory): string => {
  const prefix = `${memory.type}-`;

  return memory.name.startsWith(prefix) && memory.name.length > prefix.length
    ? memory.name.slice(prefix.length)
    : memory.name;
};

// A memory's name as a line of text: no type prefix, spaces for dashes and a
// capital first letter ("feedback-vault-skills" is "Vault skills").
export const readableName = (memory: Memory): string => {
  const text = shortName(memory).replace(/[-_]+/g, ' ');

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

// A memory file's text without its frontmatter.
export const memoryBody = (text: string): string =>
  text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

// Opens a memory file in VS Code. When `code` is missing or fails, a toast
// says so.
export async function openInEditor(
  $: EngineInterface,
  memory: Memory,
): Promise<void> {
  const path = `${await memoryDir($)}/${memory.file}`;
  const result = await $.process.run(['code', path]).catch(() => undefined);
  if (result === undefined || result.exitCode !== 0) {
    await $.ui.toast(`Could not open ${memory.file} with the code command.`);
  }
}

// The name a memory file gets in the Trash: the time is added so it never
// replaces a file of the same name already there (the Trash cannot be listed
// to check).
export const trashName = (file: string, now: number): string =>
  file.replace(/(\.md)?$/, `-${now}$1`);

// Moves a memory file to the Trash and removes its line from MEMORY.md. The
// line goes only once the file has moved. Resolves with a message when it
// could not, and undefined when it did.
export async function deleteMemory(
  $: EngineInterface,
  memory: Memory,
): Promise<string | undefined> {
  const dir = await memoryDir($);
  const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim();
  const trash = `${home}/.Trash/${trashName(memory.file, await $.clock.now())}`;
  const moved = await $.process
    .run(['mv', `${dir}/${memory.file}`, trash])
    .catch(() => undefined);
  if (moved === undefined || moved.exitCode !== 0) {
    return `Could not move ${memory.file} to the Trash.`;
  }

  const index = await $.fs.read(`${dir}/MEMORY.md`).catch(() => undefined);
  if (index === undefined) return undefined;
  const without = removeIndexLine(index, memory.file);
  if (without !== index) await $.fs.write(`${dir}/MEMORY.md`, without);

  return undefined;
}
