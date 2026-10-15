import { atom, read, update } from 'claude-code';
import type { EngineInterface, Timer } from 'claude-code';

import type { Briefing } from '../types';

import { showChallenge } from './challenge';
import {
  AGENT,
  AGENT_PROMPT,
  POLL_EVERY,
  STORE_KEY,
  TICK_MS,
} from './constants';
import {
  briefingRequest,
  isoDate,
  savedFor,
  summarizeTools,
} from './utils';

// Declared again in register.tsx, which reads them: the validator reads an atom
// only from the file that uses it. Each pair is the same value.
const briefing = atom(
  { plugin: 'obsidian', key: 'briefing' } as const,
  { status: 'idle' } as Briefing,
);

const now = atom(
  { plugin: 'obsidian', key: 'now' } as const,
  0,
);

let ticker: Timer | undefined;
export function stopTicker(): void {
  ticker?.cancel();
  ticker = undefined;
}

// Starts the briefer, for /briefing when nothing is saved for today and for
// the Refresh button.
export async function startBriefing($: EngineInterface): Promise<string> {
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
}

// Registered at session start and again whenever the briefing is shown: a hot
// reload does not re-run session.start. A name registered again is replaced.
// Not called `morning`: a skill of that name exists, and the two were taken
// for each other.
export async function registerCommand($: EngineInterface): Promise<void> {
  await $.command.register({
    name: 'briefing',
    description: "Compile today's morning briefing from the vault",
  });
}

// Ticks since the briefing started: every POLL_EVERY-th one looks at the
// briefer's transcript.
let tickCount = 0;

// Updates the pane's activity line and files list from the briefer's tool
// calls so far.
async function poll($: EngineInterface): Promise<void> {
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
}

// Shows today's briefing: the saved one, or a new one when none is saved or
// `isRefresh`. Returns the command's one line of output.
export async function showBriefing(
  $: EngineInterface,
  isRefresh: boolean,
): Promise<string> {
  await registerCommand($);
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

  return startBriefing($);
}
