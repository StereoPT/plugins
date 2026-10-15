import { atom, read, update } from 'claude-code';
import type { Register } from 'claude-code';

import type { Briefing, Saved } from '../types';

import { registerCommand, showBriefing, stopTicker } from './briefing';
import { AGENT, STORE_KEY } from './constants';
import { renderPane } from './pane';
import { isoDate } from './utils';

const PANE = 'morning';

const briefing = atom(
  { plugin: 'obsidian', key: 'briefing' } as const,
  { status: 'idle' } as Briefing,
);

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

  on('command.run', { command: 'briefing' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Morning' });

    return { text: await showBriefing($, false) };
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

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) =>
    renderPane($, e),
  );
};
