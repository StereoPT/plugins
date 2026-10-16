import { atom, read, update } from 'claude-code';
import type { EngineInterface, RenderInput } from 'claude-code';

import type { Memory } from '../types';

import { STALE_DAYS } from './constants';
import {
  formatAge,
  groupByType,
  loadMemories,
  memoryBody,
  memoryDir,
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
// count, the newest age and the stale count.
function renderHeader(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  list: Memory[],
  now: number,
) {
  const { Box, Text, Button } = $.ui.resolve(e);
  const newest = Math.max(...list.map((m) => m.mtimeMs));
  const stale = staleCount(now, list, STALE_DAYS);

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
      {renderHeader($, e, list, now)}
      {groups.map((group) => (
        <Box
          key={group.type}
          flexDirection="column"
          borderStyle="round"
          borderColor="claude"
          paddingX={1}
        >
          <Text bold color="claude">
            {`${group.type[0]?.toUpperCase()}${group.type.slice(1)} (${group.memories.length})`}
          </Text>
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
// type and age, its text without the frontmatter, and its file name.
async function renderMemory(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  list: Memory[],
  memory: Memory,
) {
  const { Box, Text, Markdown, Button } = $.ui.resolve(e);
  const now = await $.clock.now();
  const text = await $.fs
    .read(`${await memoryDir($)}/${memory.file}`)
    .then(memoryBody, (error: unknown) => `Could not read it: ${String(error)}`);

  return (
    <Box flexDirection="column" gap={1}>
      {renderHeader($, e, list, now)}
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
              }}
            />
          </Box>
          <Text dimColor>
            {`${memory.type} · changed ${formatAge(now, memory.mtimeMs)} ago`}
          </Text>
        </Box>
        <Markdown text={text} />
        <Text dimColor>{memory.file}</Text>
      </Box>
    </Box>
  );
}
