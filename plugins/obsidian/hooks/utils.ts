import type {
  ChallengeStore,
  Saved,
  Section,
  ToolInput,
  ToolUse,
} from '../types';

import { DAYS, MONTHS, SPINNER, TICK_MS } from './constants';

export const isoDate = (now: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// The briefing pane's greeting for an hour of the day (0 to 23).
export const greeting = (hour: number): string =>
  hour >= 5 && hour < 12
    ? 'Good morning'
    : hour >= 12 && hour < 18
      ? 'Good afternoon'
      : 'Good evening';

// "Thursday, 8 October".
export const dateLine = (date: Date): string =>
  `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;

// HH:MM in local time.
export const clockTime = (ms: number): string => {
  const time = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(time.getHours())}:${pad(time.getMinutes())}`;
};

// A file path shown relative to the vault, so the list reads as notes.
export const relativeTo = (root: string, path: string): string =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;

export const spinnerFrame = (time: number): string =>
  SPINNER[Math.floor(time / TICK_MS) % SPINNER.length] ?? '';

// The one line the briefing pane shows while the briefer works: what its latest tool
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

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

// What the briefer has done so far, from its tool calls in order: the line
// for the latest one the briefing pane can describe, and the files it has opened.
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

// The challenge the store holds, from whichever day it was chosen.
export const storedChallenge = (value: unknown): ChallengeStore | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { date, text } = value as Partial<ChallengeStore>;
  return typeof date === 'string' && typeof text === 'string' && text !== ''
    ? { date, text }
    : undefined;
};

// The stored challenge's text, if it was chosen today.
export const savedChallenge = (
  value: unknown,
  today: string,
): string | undefined => {
  const stored = storedChallenge(value);
  return stored?.date === today ? stored.text : undefined;
};

export const challengeRequest = (today: string, previous?: string): string =>
  `Today is ${today}.${
    previous ? `\n\nThe previous challenge, not to be repeated: ${previous}` : ''
  }\n\nGive today's challenge.`;

// The briefing split at its `## ` headings, so the briefing pane can colour them. A
// briefing without any is one section with no heading.
export const splitSections = (text: string): Section[] => {
  const sections: Section[] = [];
  let heading: string | undefined;
  let lines: string[] = [];
  let inFence = false;
  const close = () => {
    const body = lines.join('\n').trim();
    if (heading !== undefined || body !== '') {
      sections.push(heading === undefined ? { body } : { heading, body });
    }
    lines = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const match = inFence ? null : /^## (.+?)\s*$/.exec(line);
    if (match) {
      close();
      heading = match[1];
    } else {
      lines.push(line);
    }
  }
  close();

  return sections;
};
