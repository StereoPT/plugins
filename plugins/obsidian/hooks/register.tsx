import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register, Timer } from 'claude-code';

import type { Briefing, Challenge, ChallengeStore, Saved } from '../types';

import {
  AGENT,
  AGENT_PROMPT,
  CHALLENGE_KEY,
  CHALLENGE_PROMPT,
  FILE_MARK,
  NAME,
  POLL_EVERY,
  STORE_KEY,
  TICK_MS,
} from './constants';
import {
  briefingRequest,
  challengeRequest,
  changedFiles,
  clockTime,
  dateLine,
  greeting,
  isoDate,
  relativeTo,
  savedChallenge,
  storedChallenge,
  savedFor,
  spinnerFrame,
  summarizeTools,
} from './utils';

const PANE = 'morning';

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
  { status: 'idle' } as Challenge,
);

// Whether the "Files opened" list is unfolded.
const filesOpen = atom(
  { plugin: 'obsidian', key: 'filesOpen' } as const,
  false,
);

let ticker: Timer | undefined;
const stopTicker = () => {
  ticker?.cancel();
  ticker = undefined;
};


// Starts the briefer, for /briefing when nothing is saved for today and for
// the Refresh button.
const start = async ($: EngineInterface): Promise<string> => {
  // Registered here rather than at session.start: it needs a bound session,
  // and a module reload would lose the name. Registering again replaces it.
  const registered = await $.agent
    .register({
      name: AGENT,
      description: 'Compiles the morning briefing from the Obsidian vault',
      prompt: AGENT_PROMPT,
      tools: ['Read', 'Glob', 'Grep'],
      model: 'sonnet',
    })
    .catch((error: unknown) => ({ error: String(error) }));
  if ('error' in registered) {
    const message = `Could not register the agent: ${registered.error}`;
    await update($, briefing, () => ({ status: 'failed', message }));
    return message;
  }

  const startedAt = await $.clock.now();
  await update($, briefing, () => ({
    status: 'running',
    startedAt,
    sources: [],
  }));
  await update($, now, () => startedAt);
  stopTicker();
  ticker = $.clock.every(TICK_MS, () => {
    void $.clock.now().then((time) => update($, now, () => time));
    tickCount += 1;
    if (tickCount % POLL_EVERY === 0) void poll($);
  });
  const started = await $.agent.spawn({
    subagentType: registered.agent,
    description: 'Morning briefing',
    prompt: briefingRequest(isoDate(new Date())),
  });
  if (started.deny !== undefined || started.agentId === undefined) {
    const message = started.deny ?? 'The agent did not start.';
    stopTicker();
    await update($, briefing, () => ({ status: 'failed', message }));
    return `Could not start the briefing: ${message}`;
  }
  const agentId = started.agentId;
  await update($, briefing, (current) =>
    current.status === 'running' ? { ...current, agentId } : current,
  );

  return 'Writing the morning briefing.';
};

// Registered at session start and again whenever the briefing is shown: a hot
// reload does not re-run session.start. A name registered again is replaced.
// Not called `morning`: a skill of that name exists, and the two were taken
// for each other.
const registerCommand = async ($: EngineInterface) => {
  await $.command.register({
    name: 'briefing',
    description: "Compile today's morning briefing from the vault",
  });
};

let tickCount = 0;

// Updates the pane's activity line and files list from the briefer's tool
// calls so far.
const poll = async ($: EngineInterface) => {
  const current = await read($, briefing);
  if (current.status !== 'running' || current.agentId === undefined) return;
  const messages = await $.session.messages({ agentId: current.agentId });
  if (!Array.isArray(messages)) return;
  const uses = messages.flatMap((message) => message.toolUses);
  const { activity, sources } = summarizeTools(await $.session.root(), uses);
  await update($, briefing, (latest) =>
    latest.status === 'running' &&
    (latest.activity !== activity || latest.sources.length !== sources.length)
      ? { ...latest, activity, sources }
      : latest,
  );
};

// Asks the model for a new challenge and keeps it. Skipped while one is
// already being chosen.
const chooseChallenge = async ($: EngineInterface): Promise<void> => {
  if ((await read($, challenge)).status === 'running') return;
  await update($, challenge, () => ({ status: 'running' }));
  const today = isoDate(new Date());
  try {
    const stored = await $.store.get(CHALLENGE_KEY);
    const result = await $.model.complete({
      model: 'haiku',
      system: CHALLENGE_PROMPT,
      prompt: challengeRequest(today, storedChallenge(stored)?.text),
      maxTokens: 200,
    });
    const text = result.isAnswered ? result.text.trim() : '';
    if (text === '') {
      const why = result.isAnswered ? 'empty-reply' : result.reason;
      await update($, challenge, () => ({
        status: 'failed',
        message: `Could not get a challenge: ${why}.`,
      }));
      return;
    }
    await $.store.set(CHALLENGE_KEY, {
      date: today,
      text,
    } satisfies ChallengeStore);
    await update($, challenge, () => ({ status: 'done', text }));
  } catch (error: unknown) {
    await update($, challenge, () => ({
      status: 'failed',
      message: `Could not get a challenge: ${String(error)}`,
    }));
  }
};

// Shows today's saved challenge, or chooses one when there is none. A
// challenge that is already shown or being chosen is left alone, so the
// briefing's Refresh keeps it.
const showChallenge = async ($: EngineInterface): Promise<void> => {
  const saved = savedChallenge(
    await $.store.get(CHALLENGE_KEY),
    isoDate(new Date()),
  );
  if (saved !== undefined) {
    await update($, challenge, (current) =>
      current.status === 'running' ? current : { status: 'done', text: saved },
    );
    return;
  }
  await chooseChallenge($);
};

// Opens the pane and shows today's briefing: the saved one, or a new one when
// none is saved or `isRefresh`. Returns the command's one line of output.
const show = async ($: EngineInterface, isRefresh: boolean): Promise<string> => {
  await registerCommand($);
  await $.ui.open({ id: PANE, title: 'Morning' });
  void showChallenge($);
  const current = await read($, briefing);
  if (current.status === 'running') {
    return 'The briefing is still being written.';
  }

  // One briefing a day: show today's if it was already written.
  const saved = savedFor(
    isRefresh ? undefined : await $.store.get(STORE_KEY),
    isoDate(new Date()),
  );
  if (saved !== undefined) {
    await update($, briefing, () => ({
      status: 'done',
      text: saved.text,
      sources: saved.sources,
      writtenAt: saved.writtenAt,
    }));
    return "Showing today's briefing.";
  }

  return start($);
};

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await registerCommand($);

    return next(e);
  });

  // Keep the model from delegating to the briefer on its own: only /briefing
  // runs it.
  on('agent.offer', async ($, e, next) =>
    e.agent.endsWith(`:${AGENT}`) ? { isOffered: false } : next(e),
  );

  on('command.run', { command: 'briefing' }, async ($) => ({
    text: await show($, false),
  }));

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) return next(e);
    const current = await read($, briefing);
    if (current.status !== 'running' || current.agentId !== e.agentId) {
      return next(e);
    }
    stopTicker();
    if (e.reason !== 'answer' || e.answer.trim() === '') {
      await update($, briefing, () => ({
        status: 'failed',
        message: `The agent ended with: ${e.reason}.`,
      }));
      return next(e);
    }

    const writtenAt = await $.clock.now();
    const text = e.answer;
    const sources = current.sources;
    await $.store.set(STORE_KEY, {
      date: isoDate(new Date(writtenAt)),
      text,
      sources,
      writtenAt,
    } satisfies Saved);
    await update($, briefing, () => ({
      status: 'done',
      text,
      sources,
      writtenAt,
    }));

    return next(e);
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
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
            list.map((path) => (
              <Text dimColor>{` ${FILE_MARK} ${relativeTo(root, path)}`}</Text>
            ))}
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
                void show($, true).catch((error: unknown) =>
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
            {changed.length > 0 && (
              <Text color="warning">· {changed.join(', ')} changed since</Text>
            )}
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
          <Markdown text={current.text} />
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
  });
};
