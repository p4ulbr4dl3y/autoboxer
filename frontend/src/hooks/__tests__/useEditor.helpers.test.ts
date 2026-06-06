import { describe, test, expect } from 'vitest';
import { cursorForResizeMode, type ResizeMode } from '../useEditor';

describe('cursorForResizeMode', () => {
  const cases: [ResizeMode, string][] = [
    ['nw', 'nw-resize'],
    ['n', 'n-resize'],
    ['ne', 'ne-resize'],
    ['e', 'e-resize'],
    ['se', 'se-resize'],
    ['s', 's-resize'],
    ['sw', 'sw-resize'],
    ['w', 'w-resize'],
    ['move', 'move'],
  ];

  test.each(cases)('maps %s → %s', (mode, expected) => {
    expect(cursorForResizeMode(mode)).toBe(expected);
  });
});
