import { atom, read, update } from 'claude-code';
import type { Register } from 'claude-code';

import type { Briefing, Memory, Saved } from '../types';

import { registerCommand, showBriefing, stopTicker } from './briefing';
import { renderBriefingPane } from './briefing-pane';
import { AGENT, STORE_KEY } from './constants';
import { loadMemories } from './memories';
import { renderMemoriesPane } from './memories-pane';
import { isoDate } from './utils';

const BRIEFING_PANE = 'briefing';
const MEMORIES_PANE = 'memories';

const briefing = atom(
  { plugin: 'obsidian', key: 'briefing' } as const,
  { status: 'idle' } as Briefing,
);

const selectedMemory = atom(
  { plugin: 'obsidian', key: 'selectedMemory' } as const,
  '',
);

const confirmingDelete = atom(
  { plugin: 'obsidian', key: 'confirmingDelete' } as const,
  '',
);

const memories = atom(
  { plugin: 'obsidian', key: 'memories' } as const,
  [] as Memory[],
);

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await registerCommand($);
    await $.command.register({
      name: 'memories',
      description: "Review and clean up Claude's memory files",
    });

    return next(e);
  });

  // Keep the model from delegating to the briefer on its own: only /briefing
  // runs it.
  on('agent.offer', async ($, e, next) =>
    e.agent.endsWith(`:${AGENT}`) ? { isOffered: false } : next(e),
  );

  on('command.run', { command: 'briefing' }, async ($) => {
    await $.ui.open({ id: BRIEFING_PANE, title: 'Morning' });

    return { text: await showBriefing($, false) };
  });

  on('command.run', { command: 'memories' }, async ($) => {
    const found = await loadMemories($);
    await update($, memories, () => found);
    await update($, selectedMemory, () => '');
    await update($, confirmingDelete, () => '');
    await $.ui.open({ id: MEMORIES_PANE, title: 'Memories' });

    return { text: `Opened the memories pane: ${found.length} memories.` };
  });

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

  on('ui.render', { component: 'Pane', requestId: BRIEFING_PANE }, ($, e) =>
    renderBriefingPane($, e),
  );

  on('ui.render', { component: 'Pane', requestId: MEMORIES_PANE }, ($, e) =>
    renderMemoriesPane($, e),
  );
};
