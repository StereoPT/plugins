import { test, expect } from 'claude-code/testing';

import { briefingRequest, describeActivity, relativeTo, spinnerFrame, todayName } from './register';

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
