import { atom, read, update } from 'claude-code';
import type { Register, Timer } from 'claude-code';

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

export const briefingRequest = (today: string): string =>
  `Today is ${today}. Write this morning's briefing.`;

export const register: Register = (on) => {
  let ticker: Timer | undefined;
  const stopTicker = () => {
    ticker?.cancel();
    ticker = undefined;
  };

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'morning',
      description: "Compile today's morning briefing from the vault",
    });

    return next(e);
  });

  // Keep the model from delegating to the briefer on its own: only /morning
  // runs it.
  on('agent.offer', async ($, e, next) =>
    e.agent.endsWith(`:${AGENT}`) ? { isOffered: false } : next(e),
  );

  on('command.run', { command: 'morning' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Morning' });
    const current = await read($, briefing);
    if (current.status === 'running') {
      return { text: 'The briefing is still being written.' };
    }

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
      await update($, briefing, () => ({
        status: 'failed',
        message: `Could not register the agent: ${registered.error}`,
      }));
      return { text: `Could not register the agent: ${registered.error}` };
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
      return { text: `Could not start the briefing: ${message}` };
    }
    const agentId = started.agentId;
    await update($, briefing, (current) =>
      current.status === 'running' ? { ...current, agentId } : current,
    );

    return { text: 'Writing the morning briefing.' };
  });

  // What the briefer is doing now, for the pane's one line, and the files it
  // opens, for the "files opened" list. Glob and Grep run in this build but
  // are not in its typed tool list, so the input is read untyped.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const input = e as unknown as ToolInput;
      const activity = describeActivity(await $.session.root(), e.tool, input);
      if (activity !== undefined) {
        const opened = e.tool === 'Read' ? input.file_path : undefined;
        await update($, briefing, (current) =>
          current.status === 'running' && current.agentId === e.agentId
            ? {
                ...current,
                activity,
                sources:
                  opened !== undefined && !current.sources.includes(opened)
                    ? [...current.sources, opened]
                    : current.sources,
              }
            : current,
        );
      }
    }

    return next(e);
  });

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) return next(e);
    const current = await read($, briefing);
    if (current.status !== 'running' || current.agentId !== e.agentId) {
      return next(e);
    }
    stopTicker();
    await update($, briefing, () =>
      e.reason === 'answer' && e.answer.trim() !== ''
        ? {
            status: 'done',
            text: e.answer,
            sources: current.sources,
          }
        : { status: 'failed', message: `The agent ended with: ${e.reason}.` },
    );

    return next(e);
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Markdown } = $.ui.resolve(e);
    const current = await read($, briefing);
    const time = await read($, now);
    const root = await $.session.root();

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
          <Text dimColor>Run /morning to write today's briefing.</Text>
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
            {sources(current.sources)}
          </Box>
        )}
        {current.status === 'failed' && (
          <Box flexDirection="column">
            <Text color="red">{current.message}</Text>
            <Text dimColor>Run /morning to try again.</Text>
          </Box>
        )}
      </Box>
    );
  });
};
