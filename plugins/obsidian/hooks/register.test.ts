import { test, expect } from 'claude-code/testing';

import {
  briefingRequest,
  changedFiles,
  clockTime,
  dateLine,
  describeActivity,
  greeting,
  isoWeek,
  relativeTo,
  savedFor,
  spinnerFrame,
  summarizeTools,
  todayName,
} from './register';

test('todayName pads month and day', () => {
  expect(todayName(new Date(2026, 0, 5))).toBe('2026-01-05');
  expect(todayName(new Date(2026, 9, 8))).toBe('2026-10-08');
});

test('briefingRequest tells the agent which day it is', () => {
  expect(briefingRequest('2026-10-08')).toContain('2026-10-08');
});

test('relativeTo shortens vault paths and leaves others alone', () => {
  expect(relativeTo('/vault', '/vault/INBOX/2026-10-07.md')).toBe('INBOX/2026-10-07.md');
  expect(relativeTo('/vault', '/elsewhere/a.md')).toBe('/elsewhere/a.md');
  expect(relativeTo('/vault', '/vault-two/a.md')).toBe('/vault-two/a.md');
});

test('spinnerFrame goes forwards then back, and wraps around', () => {
  const frames = Array.from({ length: 10 }, (_, tick) => spinnerFrame(tick * 120));
  expect(frames).toEqual(['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']);
  expect(spinnerFrame(10 * 120)).toBe('·');
});

test('describeActivity names what each tool call is doing', () => {
  const root = '/vault';
  expect(describeActivity(root, 'Read', { file_path: '/vault/Tasks.md' })).toBe(
    'Reading Tasks.md…',
  );
  expect(describeActivity(root, 'Glob', { pattern: 'INBOX/*.md' })).toBe(
    'Looking for INBOX/*.md…',
  );
  expect(
    describeActivity(root, 'Grep', { pattern: '^state:', path: '/vault/Projects' }),
  ).toBe('Searching Projects for ^state:…');
  expect(describeActivity(root, 'Grep', { pattern: 'x', path: '/vault' })).toBe(
    'Searching the vault for x…',
  );
  expect(describeActivity(root, 'Grep', { pattern: 'x' })).toBe(
    'Searching the vault for x…',
  );
  expect(describeActivity(root, 'Bash', {})).toBeUndefined();
});

test('savedFor accepts only a complete briefing from today', () => {
  const saved = {
    date: '2026-10-08',
    text: '## Today',
    sources: ['/vault/Tasks.md'],
    writtenAt: 1,
  };
  expect(savedFor(saved, '2026-10-08')).toEqual(saved);
  expect(savedFor(saved, '2026-10-09')).toBeUndefined();
  expect(savedFor({ ...saved, text: 3 }, '2026-10-08')).toBeUndefined();
  expect(savedFor({ ...saved, sources: 'x' }, '2026-10-08')).toBeUndefined();
  expect(savedFor({ date: '2026-10-08' }, '2026-10-08')).toBeUndefined();
  expect(savedFor(undefined, '2026-10-08')).toBeUndefined();
  expect(savedFor('nope', '2026-10-08')).toBeUndefined();
});

test('clockTime is HH:MM in local time', () => {
  expect(clockTime(new Date(2026, 9, 8, 8, 5).getTime())).toBe('08:05');
  expect(clockTime(new Date(2026, 9, 8, 14, 30).getTime())).toBe('14:30');
});

test('changedFiles names the files edited after the briefing', () => {
  const files = [
    { path: '/vault/Tasks.md', mtimeMs: 200 },
    { path: '/vault/INBOX/2026-10-07.md', mtimeMs: 50 },
    { path: '/vault/Projects/A.md', mtimeMs: 100 },
  ];
  expect(changedFiles('/vault', files, 100)).toEqual(['Tasks.md']);
  expect(changedFiles('/vault', files, 300)).toEqual([]);
});

test('summarizeTools gives the latest activity and the files read, once each', () => {
  const root = '/vault';
  const uses = [
    { tool: 'Glob', input: { pattern: 'INBOX/*.md' } },
    { tool: 'Read', input: { file_path: '/vault/Tasks.md' } },
    { tool: 'Read', input: { file_path: '/vault/INBOX/2026-10-07.md' } },
    { tool: 'Read', input: { file_path: '/vault/Tasks.md' } },
    { tool: 'Grep', input: { pattern: '^state:', path: '/vault/Projects' } },
    { tool: 'Bash', input: { command: 'ls' } },
  ];
  expect(summarizeTools(root, uses)).toEqual({
    activity: 'Searching Projects for ^state:…',
    sources: ['/vault/Tasks.md', '/vault/INBOX/2026-10-07.md'],
  });
  expect(summarizeTools(root, [])).toEqual({ activity: undefined, sources: [] });
  expect(
    summarizeTools(root, [{ tool: 'Read', input: { file_path: 3 } }]),
  ).toEqual({ activity: undefined, sources: [] });
});

test('greeting follows the hour of the day', () => {
  expect(greeting(4)).toBe('Good evening');
  expect(greeting(5)).toBe('Good morning');
  expect(greeting(11)).toBe('Good morning');
  expect(greeting(12)).toBe('Good afternoon');
  expect(greeting(17)).toBe('Good afternoon');
  expect(greeting(18)).toBe('Good evening');
  expect(greeting(23)).toBe('Good evening');
});

test('dateLine reads weekday, day and month', () => {
  expect(dateLine(new Date(2026, 9, 8))).toBe('Thursday 8 October');
  expect(dateLine(new Date(2026, 0, 1))).toBe('Thursday 1 January');
});

test('isoWeek matches the ISO calendar, year edges included', () => {
  expect(isoWeek(new Date(2026, 9, 8))).toBe(41);
  expect(isoWeek(new Date(2026, 9, 5))).toBe(41);
  expect(isoWeek(new Date(2026, 9, 11))).toBe(41);
  expect(isoWeek(new Date(2026, 9, 12))).toBe(42);
  expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
  expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  expect(isoWeek(new Date(2024, 11, 30))).toBe(1);
});
