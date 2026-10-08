import { test, expect } from 'claude-code/testing'

import { todayName } from './register'

test('todayName pads month and day', () => {
  expect(todayName(new Date(2026, 0, 5))).toBe('2026-01-05')
  expect(todayName(new Date(2026, 9, 8))).toBe('2026-10-08')
})
