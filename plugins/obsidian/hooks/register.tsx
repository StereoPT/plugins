import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register, Timer } from 'claude-code';

import type { Briefing } from '../types';

const PANE = 'morning';
const AGENT = 'morning-briefer';

const briefing = atom(
  { plugin: 'obsidian', key: 'briefing' } as const,
  { status: 'idle' } as Briefing,
);

const now = atom(
  { plugin: 'obsidian', key: 'now' } as const,
  0,
);

export const todayName = (now: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// The agent's system prompt: where to look and what to write. It runs in the
// vault, so its working directory is the vault's root.
const AGENT_PROMPT = `You write Guido's morning briefing from his Obsidian vault, which is your working directory. You are read-only: never edit or create files.

Look at these, in this order:
1. Daily notes in INBOX/, named YYYY-MM-DD.md. Read the three most recent ones dated before today (today's note is usually still empty). The notes follow no fixed template: read them in full and pick out what is open, unfinished or planned.
2. Tasks.md, a Kanban board with the columns Backlog, To Do, In Progress, Waiting, Done and Archive.
3. Projects/. Each numbered project folder has a main note whose frontmatter has a state. For each In Progress project, read its newest version note to see what is being built.

Write the briefing in English as short Markdown, with exactly these sections. Give each point enough detail to act on without opening the note: a short sentence or two, never a bare label. Avoid long descriptions, repetition and filler. Leave out a section that would be empty:
## Today's focus
Two or three bullets naming what to start with. Each must come from something written in the files, with a short reason why it comes first.
## In progress
The cards in the In Progress column, then the To Do cards, each marked "(to do)".
## Open from recent days
Anything in the daily notes that reads as a follow-up, idea, decision to make or loose end, even if it is not written as a task, with the note's date in parentheses. Say what the item is about, not just its title.
## Waiting or blocked
The Waiting column, and anything a note says is blocked.
## Projects
One line for each In Progress project: its name, the version being built, and in a few words what that version covers. Then one short line naming the On Hold projects. Leave out Not Started projects.

Rules:
- Only state what a file says. If you cannot point to the line a claim comes from, leave it out. Do not describe anything as "live", "ready" or "done" unless a file says so, and do not invent tasks or dates.
- Report what the notes say. Do not turn a note into a task, a question or advice for Guido unless the note itself says it needs doing. Do not write "decide", "follow up" or "check" about something a note merely mentions.
- Ignore any memory notes you were given: they are not part of the vault.
- Leave out finished work (the Done and Archive columns) and the Backlog, unless a daily note makes one of them relevant.
- Write the briefing and nothing else: no introduction, no closing note, and no list of the files you read, since the pane shows that.`;

// A file path shown relative to the vault, so the list reads as notes.
export const relativeTo = (root: string, path: string): string =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;

// Claude Code's own spinner glyphs, played forwards then back.
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽'];
const SPINNER = [...GLYPHS, ...GLYPHS.slice(1, -1).reverse()];
// How often the pane redraws while the briefing runs: the spinner's pace.
const TICK_MS = 120;

export const spinnerFrame = (time: number): string =>
  SPINNER[Math.floor(time / TICK_MS) % SPINNER.length] ?? '';

type ToolInput = { file_path?: string; pattern?: string; path?: string };

// The one line the pane shows while the briefer works: what its latest tool
// call is doing. Other tools (and calls with nothing to show) give undefined.
export const describeActivity = (
  root: string,
  tool: string,
  input: ToolInput,
): string | undefined => {
  if (tool === 'Read' && input.file_path) {
    return `Reading ${relativeTo(root, input.file_path)}…`;
  }
  if (tool === 'Glob' && input.pattern) {
    return `Looking for ${input.pattern}…`;
  }
  if (tool === 'Grep' && input.pattern) {
    const where =
      input.path && input.path !== root
        ? relativeTo(root, input.path)
        : 'the vault';
    return `Searching ${where} for ${input.pattern}…`;
  }
  return undefined;
};

type ToolUse = { tool: string; input: Record<string, unknown> };

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

// What the briefer has done so far, from its tool calls in order: the line
// for the latest one the pane can describe, and the files it has opened.
export const summarizeTools = (
  root: string,
  uses: ToolUse[],
): { activity?: string; sources: string[] } => {
  const sources: string[] = [];
  let activity: string | undefined;
  for (const { tool, input } of uses) {
    const args = {
      file_path: asText(input.file_path),
      pattern: asText(input.pattern),
      path: asText(input.path),
    };
    activity = describeActivity(root, tool, args) ?? activity;
    if (tool === 'Read' && args.file_path && !sources.includes(args.file_path)) {
      sources.push(args.file_path);
    }
  }

  return { activity, sources };
};

export const briefingRequest = (today: string): string =>
  `Today is ${today}. Write this morning's briefing.`;

const STORE_KEY = 'briefing';

// The briefing as kept between sessions, one for the day it was written.
export type Saved = {
  date: string;
  text: string;
  sources: string[];
  writtenAt: number;
};

// What the store holds, if it is a briefing written today.
export const savedFor = (value: unknown, today: string): Saved | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const saved = value as Partial<Saved>;
  return saved.date === today &&
    typeof saved.text === 'string' &&
    Array.isArray(saved.sources) &&
    typeof saved.writtenAt === 'number'
    ? (saved as Saved)
    : undefined;
};

// HH:MM in local time.
export const clockTime = (ms: number): string => {
  const time = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(time.getHours())}:${pad(time.getMinutes())}`;
};

// The files modified after the briefing was written, shown relative to the
// vault.
export const changedFiles = (
  root: string,
  files: { path: string; mtimeMs: number }[],
  writtenAt: number,
): string[] =>
  files
    .filter((file) => file.mtimeMs > writtenAt)
    .map((file) => relativeTo(root, file.path));

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
    prompt: briefingRequest(todayName(new Date())),
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

// How many ticks pass between looks at the briefer's transcript (about a
// second). The transcript is read rather than watching tool.call events: an
// agent started from a button press had its events go untracked.
const POLL_EVERY = 8;
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

// Opens the pane and shows today's briefing: the saved one, or a new one when
// none is saved or `isRefresh`. Returns the command's one line of output.
const show = async ($: EngineInterface, isRefresh: boolean): Promise<string> => {
  await registerCommand($);
  await $.ui.open({ id: PANE, title: 'Morning' });
  const current = await read($, briefing);
  if (current.status === 'running') {
    return 'The briefing is still being written.';
  }

  // One briefing a day: show today's if it was already written.
  const saved = savedFor(
    isRefresh ? undefined : await $.store.get(STORE_KEY),
    todayName(new Date()),
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
      date: todayName(new Date(writtenAt)),
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
    const refresh = (label: string) => (
      <Box flexDirection="row">
        <Button
          label={label}
          variant="primary"
          hotkey="r"
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
    );

    const sources = (list: string[]) =>
      list.length > 0 && (
        <Box flexDirection="column">
          <Text bold dimColor>
            Files opened
          </Text>
          {list.map((path) => (
            <Text dimColor>{relativeTo(root, path)}</Text>
          ))}
        </Box>
      );

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{todayName(new Date())}</Text>
        {current.status === 'idle' && (
          <Text dimColor>Run /briefing to write today's briefing.</Text>
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
            <Markdown text={current.text} />
            {changed.length > 0 && (
              <Text color="warning">
                {changed.join(', ')} changed since this was written at{' '}
                {clockTime(current.writtenAt)}.
              </Text>
            )}
            {refresh('Refresh (r)')}
            {sources(current.sources)}
          </Box>
        )}
        {current.status === 'failed' && (
          <Box flexDirection="column">
            <Text color="red">{current.message}</Text>
            {refresh('Try again (r)')}
          </Box>
        )}
      </Box>
    );
  });
};
