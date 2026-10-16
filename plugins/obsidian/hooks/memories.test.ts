import { test, expect } from 'claude-code/testing';

import { formatAge, groupByType, memoryBody, readableName, shortName, staleCount, memoryDirFor, parseMemory, removeIndexLine } from './memories';

const FILE = `---
name: refactor-step-by-step
description: "Work in small steps"
metadata:
  type: feedback
---

Body.`;

test('parseMemory reads the frontmatter', () => {
  expect(parseMemory('a.md', FILE, 5)).toEqual({
    file: 'a.md',
    name: 'refactor-step-by-step',
    description: 'Work in small steps',
    type: 'feedback',
    mtimeMs: 5,
  });
});

test('parseMemory skips files that are not memories', () => {
  expect(parseMemory('MEMORY.md', '- [A](a.md) — hook', 1)).toBeUndefined();
  expect(parseMemory('b.md', FILE.replace('feedback', 'other'), 1)).toBeUndefined();
});

test('groupByType orders types, newest first, and drops empty ones', () => {
  const m = (file: string, type: 'user' | 'project', mtimeMs: number) => ({
    file, name: file, description: '', type, mtimeMs,
  });
  const groups = groupByType([m('a', 'project', 1), m('b', 'user', 1), m('c', 'project', 2)]);
  expect(groups.map((g) => g.type)).toEqual(['user', 'project']);
  expect(groups[1]?.memories.map((x) => x.file)).toEqual(['c', 'a']);
});

test('removeIndexLine drops only the matching line', () => {
  const index = '- [A](a.md) — one\n- [B](b.md) — two';
  expect(removeIndexLine(index, 'a.md')).toBe('- [B](b.md) — two');
});

test('memoryDirFor turns the project root into its folder name', () => {
  expect(memoryDirFor('/Users/g', '/Users/g/Obsidian/Personal')).toBe(
    '/Users/g/.claude/projects/-Users-g-Obsidian-Personal/memory',
  );
});

test('formatAge uses the largest whole unit', () => {
  const day = 24 * 60 * 60 * 1000;
  const age = (days: number) => formatAge(1000 * day, 1000 * day - days * day);
  expect([0, 3, 14, 40, 90, 400].map(age)).toEqual(['today', '3d', '2w', '5w', '3mo', '1y']);
});

test('staleCount counts memories at least that many days old', () => {
  const day = 24 * 60 * 60 * 1000;
  const m = (days: number) => ({
    file: 'a.md', name: 'a', description: '', type: 'user' as const,
    mtimeMs: 1000 * day - days * day,
  });
  expect(staleCount(1000 * day, [m(0), m(89), m(90), m(200)], 90)).toBe(2);
});

test('shortName drops the type the name starts with', () => {
  const m = (name: string, type: 'feedback' | 'user') => ({
    file: 'a.md', name, description: '', type, mtimeMs: 0,
  });
  expect(shortName(m('feedback-vault-skills', 'feedback'))).toBe('vault-skills');
  expect(shortName(m('centralstock-code', 'feedback'))).toBe('centralstock-code');
  expect(shortName(m('feedback-', 'feedback'))).toBe('feedback-');
  expect(shortName(m('feedback-x', 'user'))).toBe('feedback-x');
});

test('readableName spaces the dashes and capitalises the first letter', () => {
  const m = (name: string) => ({
    file: 'a.md', name, description: '', type: 'feedback' as const, mtimeMs: 0,
  });
  expect(readableName(m('feedback-refactor-step-by-step'))).toBe('Refactor step by step');
  expect(readableName(m('centralstock-code-separate-session'))).toBe('Centralstock code separate session');
});

test('memoryBody drops the frontmatter', () => {
  expect(memoryBody(FILE)).toBe('Body.');
  expect(memoryBody('No frontmatter.')).toBe('No frontmatter.');
});
