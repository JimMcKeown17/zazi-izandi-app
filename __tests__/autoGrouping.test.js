import {
  assignGroups,
  groupSizeStatus,
  BLENDING_THRESHOLD,
} from '../src/utils/autoGrouping';

const makeChild = (id, letters, overrides = {}) => ({
  id,
  first_name: overrides.first_name ?? `First${id}`,
  last_name: overrides.last_name ?? `Last${id}`,
  letters_total_correct: letters,
  ...overrides,
});

describe('groupSizeStatus', () => {
  test('ideal range 6-8', () => {
    expect(groupSizeStatus(6)).toBe('Ideal (6-8)');
    expect(groupSizeStatus(7)).toBe('Ideal (6-8)');
    expect(groupSizeStatus(8)).toBe('Ideal (6-8)');
  });
  test('allowed range 5 and 9', () => {
    expect(groupSizeStatus(5)).toBe('Allowed (5 or 9)');
    expect(groupSizeStatus(9)).toBe('Allowed (5 or 9)');
  });
  test('outside range', () => {
    expect(groupSizeStatus(4)).toBe('Outside range (not 5-9)');
    expect(groupSizeStatus(10)).toBe('Outside range (not 5-9)');
    expect(groupSizeStatus(0)).toBe('Outside range (not 5-9)');
  });
});

describe('assignGroups — edge cases', () => {
  test('empty input returns empty array', () => {
    expect(assignGroups([])).toEqual([]);
    expect(assignGroups(null)).toEqual([]);
    expect(assignGroups(undefined)).toEqual([]);
  });

  test('single child yields single Letters group of size 1', () => {
    const groups = assignGroups([makeChild('a', 5)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('L1');
    expect(groups[0].type).toBe('Letters');
    expect(groups[0].size).toBe(1);
    expect(groups[0].children).toHaveLength(1);
  });

  test('N ≤ 9 stays as a single group', () => {
    const children = Array.from({ length: 9 }, (_, i) => makeChild(`c${i}`, i));
    const groups = assignGroups(children);
    expect(groups).toHaveLength(1);
    expect(groups[0].size).toBe(9);
    expect(groups[0].sizeStatus).toBe('Allowed (5 or 9)');
  });
});

describe('assignGroups — size optimization', () => {
  test('N = 10 splits into two groups of 5', () => {
    const children = Array.from({ length: 10 }, (_, i) => makeChild(`c${i}`, i));
    const groups = assignGroups(children);
    expect(groups.map(g => g.size)).toEqual([5, 5]);
    expect(groups.map(g => g.name)).toEqual(['L1', 'L2']);
  });

  test('N = 15 splits into [8, 7]', () => {
    const children = Array.from({ length: 15 }, (_, i) => makeChild(`c${i}`, i));
    const groups = assignGroups(children);
    expect(groups.map(g => g.size)).toEqual([8, 7]);
  });

  test('N = 18 splits into [6, 6, 6] — three ideal groups beat two groups of 9', () => {
    const children = Array.from({ length: 18 }, (_, i) => makeChild(`c${i}`, i));
    const groups = assignGroups(children);
    expect(groups.map(g => g.size)).toEqual([6, 6, 6]);
    expect(groups.every(g => g.sizeStatus === 'Ideal (6-8)')).toBe(true);
  });

  test('N = 21 splits into [7, 7, 7]', () => {
    const children = Array.from({ length: 21 }, (_, i) => makeChild(`c${i}`, i));
    const groups = assignGroups(children);
    expect(groups.map(g => g.size)).toEqual([7, 7, 7]);
  });
});

describe('assignGroups — Blending track activation', () => {
  test('activates when ≥5 above threshold AND ≥5 below (or 0 below)', () => {
    const below = Array.from({ length: 6 }, (_, i) => makeChild(`low${i}`, 10));
    const above = Array.from({ length: 6 }, (_, i) => makeChild(`hi${i}`, BLENDING_THRESHOLD + 10, { words_total_correct: i }));
    const groups = assignGroups([...below, ...above]);
    const types = groups.map(g => g.type);
    expect(types).toContain('Letters');
    expect(types).toContain('Blending');
  });

  test('does NOT activate when fewer than 5 above threshold', () => {
    const below = Array.from({ length: 10 }, (_, i) => makeChild(`low${i}`, 10));
    const above = Array.from({ length: 4 }, (_, i) => makeChild(`hi${i}`, BLENDING_THRESHOLD + 10));
    const groups = assignGroups([...below, ...above]);
    expect(groups.every(g => g.type === 'Letters')).toBe(true);
  });

  test('does NOT activate when <5 below threshold but >0 below (would orphan them)', () => {
    const below = Array.from({ length: 3 }, (_, i) => makeChild(`low${i}`, 10));
    const above = Array.from({ length: 7 }, (_, i) => makeChild(`hi${i}`, BLENDING_THRESHOLD + 10));
    const groups = assignGroups([...below, ...above]);
    expect(groups.every(g => g.type === 'Letters')).toBe(true);
  });

  test('DOES activate when all above threshold (letters_count = 0 branch)', () => {
    const above = Array.from({ length: 6 }, (_, i) => makeChild(`hi${i}`, BLENDING_THRESHOLD + 10, { words_total_correct: i }));
    const groups = assignGroups(above);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('Blending');
    expect(groups[0].name).toBe('B1');
  });
});

describe('assignGroups — sort order within group', () => {
  test('weakest performers land in earlier groups', () => {
    const children = [
      makeChild('top', 28),
      makeChild('mid', 14),
      makeChild('low', 2),
      ...Array.from({ length: 7 }, (_, i) => makeChild(`filler${i}`, 10 + i)),
    ];
    const groups = assignGroups(children);
    expect(groups).toHaveLength(2);
    // Group 1 (lowest scores) should contain the weakest; Group 2 the strongest.
    const group1Ids = groups[0].children.map(c => c.id);
    const group2Ids = groups[1].children.map(c => c.id);
    expect(group1Ids).toContain('low');
    expect(group2Ids).toContain('top');
  });

  test('ties broken by last_name then first_name then id (stable ordering)', () => {
    const children = [
      makeChild('3', 10, { last_name: 'Zulu', first_name: 'Alpha' }),
      makeChild('1', 10, { last_name: 'Adams', first_name: 'Charlie' }),
      makeChild('2', 10, { last_name: 'Adams', first_name: 'Beth' }),
    ];
    const groups = assignGroups(children);
    const order = groups[0].children.map(c => c.id);
    expect(order).toEqual(['2', '1', '3']);
  });
});

describe('assignGroups — determinism', () => {
  test('same input twice yields identical output', () => {
    const children = Array.from({ length: 12 }, (_, i) =>
      makeChild(`c${i}`, (i * 7) % BLENDING_THRESHOLD),
    );
    const first = assignGroups(children);
    const second = assignGroups(children);
    expect(first).toEqual(second);
  });
});
