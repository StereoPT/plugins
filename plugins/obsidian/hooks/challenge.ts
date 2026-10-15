import { atom, read, update } from 'claude-code';
import type { EngineInterface } from 'claude-code';

import type { Challenge, ChallengeStore } from '../types';

import { CHALLENGE_KEY, CHALLENGE_PROMPT, IDLE_CHALLENGE } from './constants';
import {
  challengeRequest,
  isoDate,
  savedChallenge,
  storedChallenge,
} from './utils';

// Declared again in register.tsx, which draws it: the validator reads an atom
// only from the file that uses it. Both are the same value.
const challenge = atom(
  { plugin: 'obsidian', key: 'challenge' } as const,
  IDLE_CHALLENGE as Challenge,
);

// Asks the model for a new challenge and keeps it. Skipped while one is
// already being chosen.
export async function chooseChallenge($: EngineInterface): Promise<void> {
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
}

// Shows today's saved challenge, or chooses one when there is none. A
// challenge that is already shown or being chosen is left alone, so the
// briefing's Refresh keeps it.
export async function showChallenge($: EngineInterface): Promise<void> {
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
}
