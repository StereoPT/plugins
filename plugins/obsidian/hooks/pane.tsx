import { atom, read, update } from 'claude-code';
import type { EngineInterface, RenderInput } from 'claude-code';

import type { Briefing, Challenge } from '../types';

import { showBriefing } from './briefing';
import { chooseChallenge } from './challenge';
import { FILE_MARK, IDLE_CHALLENGE, NAME } from './constants';
import {
  changedFiles,
  clockTime,
  dateLine,
  greeting,
  relativeTo,
  spinnerFrame,
  splitSections,
} from './utils';

// The four values the pane reads, declared again here: the validator reads an
// atom only from the file that uses it. Each is the same value as in the file
// that writes it.
const briefing = atom(
  { plugin: 'obsidian', key: 'briefing' } as const,
  { status: 'idle' } as Briefing,
);

const now = atom(
  { plugin: 'obsidian', key: 'now' } as const,
  0,
);

const challenge = atom(
  { plugin: 'obsidian', key: 'challenge' } as const,
  IDLE_CHALLENGE as Challenge,
);

// Whether the "Files opened" list is unfolded.
const filesOpen = atom(
  { plugin: 'obsidian', key: 'filesOpen' } as const,
  false,
);

// Draws the morning pane: the briefing and, under it, the challenge.
export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Markdown, Button } = $.ui.resolve(e);
  const current = await read($, briefing);
  const time = await read($, now);
  const challengeNow = await read($, challenge);
  const challengeStatus = challengeNow.status;
  const root = await $.session.root();
  // Files the briefing read that were edited after it was written.
  const changed =
    current.status === 'done'
      ? changedFiles(
          root,
          await Promise.all(
            current.sources.map(async (path) => ({
              path,
              mtimeMs:
                (await $.fs.stat(path).catch(() => undefined))?.mtimeMs ?? 0,
            })),
          ),
          current.writtenAt,
        )
      : [];
  const refreshLabel =
    current.status === 'failed'
      ? 'Try again'
      : current.status === 'idle'
        ? 'Write briefing'
        : 'Refresh';

  const isFilesOpen = await read($, filesOpen);
  const sources = (list: string[]) =>
    list.length > 0 && (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Button
            label={`${isFilesOpen ? '▾' : '▸'} Files opened (${list.length})`}
            plain
            dimColor
            onPress={() => {
              void update($, filesOpen, (open) => !open);
            }}
          />
        </Box>
        {isFilesOpen &&
          list.map((path) => {
            const name = relativeTo(root, path);

            return changed.includes(name) ? (
              <Text color="warning">{` ${FILE_MARK} ${name} *`}</Text>
            ) : (
              <Text dimColor>{` ${FILE_MARK} ${name}`}</Text>
            );
          })}
      </Box>
    );

  const today = new Date();

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>
            {greeting(today.getHours())}, {NAME}
          </Text>
          <Button
            label={refreshLabel}
            variant="primary"
            onPress={() => {
              void showBriefing($, true).catch((error: unknown) =>
                update($, briefing, () => ({
                  status: 'failed',
                  message: `Could not refresh: ${String(error)}`,
                })),
              );
            }}
          />
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Text dimColor>
            {dateLine(today)}
          </Text>
          {current.status === 'done' && (
            <Text dimColor>
              · written {clockTime(current.writtenAt)} from{' '}
              {current.sources.length} files
            </Text>
          )}
          {changed.length > 0 && <Text color="warning">*</Text>}
        </Box>
      </Box>
      {current.status === 'idle' && (
        <Text dimColor>No briefing written yet today.</Text>
      )}
      {current.status === 'running' && (
        <Box flexDirection="row" gap={1}>
          <Text color="claude">{spinnerFrame(time)}</Text>
          <Text color="claude">
            {current.activity ?? 'Reading your notes, tasks and projects…'}
          </Text>
          <Text dimColor>
            {Math.max(0, Math.floor((time - current.startedAt) / 1000))}s
          </Text>
        </Box>
      )}
      {current.status === 'done' && (
        <Box flexDirection="column" gap={1}>
          {splitSections(current.text).map((section) => (
            <Box flexDirection="column">
              {section.heading !== undefined && (
                <Text bold color="claude">
                  {section.heading}
                </Text>
              )}
              {section.body !== '' && <Markdown text={section.body} />}
            </Box>
          ))}
        </Box>
      )}
      {current.status === 'failed' && (
        <Text color="red">{current.message}</Text>
      )}
      {challengeStatus !== 'idle' && (
        <Box
          flexDirection="column"
          gap={1}
          borderStyle="round"
          borderColor="claude"
          paddingX={1}
        >
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color="claude">
              Challenge of the Day
            </Text>
            {challengeNow.status !== 'running' && (
              <Button
                label={
                  challengeNow.status === 'failed' ? 'Try again' : 'New challenge'
                }
                plain
                dimColor
                onPress={() => {
                  void chooseChallenge($);
                }}
              />
            )}
          </Box>
          {challengeNow.status === 'running' && (
            <Text dimColor>Thinking of one…</Text>
          )}
          {challengeNow.status === 'done' && (
            <Markdown text={challengeNow.text} />
          )}
          {challengeNow.status === 'failed' && (
            <Text color="red">{challengeNow.message}</Text>
          )}
        </Box>
      )}
      {current.status === 'done' && sources(current.sources)}
    </Box>
  );
}
