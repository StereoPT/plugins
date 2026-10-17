import { atom, read, update } from 'claude-code';
import type { EngineInterface, RenderInput } from 'claude-code';

import type { Memory } from '../types';

import { STALE_DAYS } from './constants';
import {
  deleteMemory,
  formatAge,
  groupByType,
  indexProblems,
  loadMemories,
  memoryBody,
  memoryDir,
  openInEditor,
  readableName,
  staleCount,
} from './memories';

// The values the pane reads, declared again here: the validator reads an atom
// only from the file that uses it.
const memories = atom(
  { plugin: 'obsidian', key: 'memories' } as const,
  [] as Memory[],
);

// The file of the memory shown in full; empty for none.
const selectedMemory = atom(
  { plugin: 'obsidian', key: 'selectedMemory' } as const,
  '',
);

// The file whose delete is waiting for a yes; empty for none.
const confirmingDelete = atom(
  { plugin: 'obsidian', key: 'confirmingDelete' } as const,
  '',
);

// Draws the memories pane: the list, or the selected memory in full.
export async function renderMemoriesPane(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
) {
  const list = await read($, memories);
  const file = await read($, selectedMemory);
  const selected = list.find((m) => m.file === file);

  return selected === undefined
    ? renderList($, e, list)
    : renderMemory($, e, list, selected);
}

// The header both views share: the title with Refresh, and under it the
// count, the newest age and the stale count, and on a third line a warning
// when MEMORY.md and the files disagree.
async function renderHeader(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  list: Memory[],
  now: number,
) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const newest = Math.max(...list.map((m) => m.mtimeMs));
  const stale = staleCount(now, list, STALE_DAYS);
  const index = await $.fs
    .read(`${await memoryDir($)}/MEMORY.md`)
    .catch(() => '');
  const { unindexed, dangling } = indexProblems(
    index,
    list.map((m) => m.file),
  );
  const warning = [
    unindexed > 0 && `${unindexed} not in the index`,
    dangling > 0 &&
      `${dangling} index ${dangling === 1 ? 'line' : 'lines'} without a file`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Memories</Text>
        <Button
          label="Refresh"
          variant="primary"
          onPress={() => {
            void loadMemories($).then((found) =>
              update($, memories, () => found),
            );
          }}
        />
      </Box>
      <Text dimColor>
        {list.length === 0
          ? 'No memories found.'
          : [
              `${list.length} memories`,
              `newest ${formatAge(now, newest)}`,
              stale > 0 && `${stale} older than ${STALE_DAYS}d`,
            ]
              .filter(Boolean)
              .join(' · ')}
      </Text>
      {warning !== '' && <Text color="warning">{warning}</Text>}
    </Box>
  );
}

// A header, then each type with its memories, newest first, and for each its
// name and age. A name opens the memory.
async function renderList(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  list: Memory[],
) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const now = await $.clock.now();

  const groups = groupByType(list);

  return (
    <Box flexDirection="column" gap={1}>
      {await renderHeader($, e, list, now)}
      {groups.map((group) => (
        <Box
          key={group.type}
          flexDirection="column"
          borderStyle="round"
          borderColor="claude"
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color="claude">
              {`${group.type[0]?.toUpperCase()}${group.type.slice(1)} (${group.memories.length})`}
            </Text>
          </Box>
          {group.memories.map((m) => (
            <Box key={m.file} flexDirection="row" justifyContent="space-between">
              <Button
                label={readableName(m)}
                plain
                onPress={() => {
                  void update($, selectedMemory, () => m.file);
                }}
              />
              <Text dimColor>{formatAge(now, m.mtimeMs)}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

// The header, then one memory in full, in a box: its name with a way back to the list, its
// type and age, its text without the frontmatter, and its file name with buttons to open and delete it. Delete asks first.
async function renderMemory(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  list: Memory[],
  memory: Memory,
) {
  const { Box, Text, Markdown, Button } = $.ui.resolve(e);
  const now = await $.clock.now();
  const isConfirming = (await read($, confirmingDelete)) === memory.file;
  const text = await $.fs
    .read(`${await memoryDir($)}/${memory.file}`)
    .then(memoryBody, (error: unknown) => `Could not read it: ${String(error)}`);

  return (
    <Box flexDirection="column" gap={1}>
      {await renderHeader($, e, list, now)}
      <Box
        flexDirection="column"
        gap={1}
        borderStyle="round"
        borderColor="claude"
        paddingX={1}
      >
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color="claude">
              {readableName(memory)}
            </Text>
            <Button
              label="Back"
              plain
              dimColor
              onPress={() => {
                void update($, selectedMemory, () => '');
                void update($, confirmingDelete, () => '');
              }}
            />
          </Box>
          <Text dimColor>
            {`${memory.type} · changed ${formatAge(now, memory.mtimeMs)} ago`}
          </Text>
        </Box>
        <Markdown text={text} />
        {isConfirming ? (
          <Box flexDirection="row" justifyContent="space-between">
            <Text color="warning">Move this memory to the Trash?</Text>
            <Box flexDirection="row" gap={1}>
              <Button
                label="Yes, delete"
                variant="primary"
                onPress={() => {
                  void deleteMemory($, memory).then(async (error) => {
                    await update($, confirmingDelete, () => '');
                    if (error !== undefined) {
                      await $.ui.toast(error);
                      return;
                    }
                    const found = await loadMemories($);
                    await update($, memories, () => found);
                    await update($, selectedMemory, () => '');
                    await $.ui.toast(`Moved ${memory.file} to the Trash.`);
                  });
                }}
              />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  void update($, confirmingDelete, () => '');
                }}
              />
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>{memory.file}</Text>
            <Box flexDirection="row" gap={1}>
              <Button
                label="Open"
                hotkey="o"
                variant="secondary"
                onPress={() => {
                  void openInEditor($, memory);
                }}
              />
              <Button
                label="Delete"
                hotkey="d"
                variant="secondary"
                onPress={() => {
                  void update($, confirmingDelete, () => memory.file);
                }}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
