import {
  assignGroups,
  groupSizeStatus,
  projectAssessedChildrenForGrouping,
  insertIntoExistingGroups,
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

describe('projectAssessedChildrenForGrouping', () => {
  const childA = { id: 'a', first_name: 'Alice', last_name: 'Adams', class_id: 'k1' };
  const childB = { id: 'b', first_name: 'Bob', last_name: 'Brown', class_id: 'k1' };
  const childC = { id: 'c', first_name: 'Cara', last_name: 'Chen', class_id: 'k2' };

  test('returns empty when no children', () => {
    expect(projectAssessedChildrenForGrouping([], [])).toEqual([]);
    expect(projectAssessedChildrenForGrouping(null, [])).toEqual([]);
  });

  test('drops children with no assessment', () => {
    const result = projectAssessedChildrenForGrouping(
      [childA, childB],
      [{ child_id: 'a', assessment_type: 'letter_egra', correct_responses: 10, created_at: '2026-04-20T10:00:00Z' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(result[0].letters_total_correct).toBe(10);
  });

  test('picks latest assessment per child by created_at', () => {
    const result = projectAssessedChildrenForGrouping(
      [childA],
      [
        { child_id: 'a', assessment_type: 'letter_egra', correct_responses: 5, created_at: '2026-04-20T10:00:00Z' },
        { child_id: 'a', assessment_type: 'letter_egra', correct_responses: 12, created_at: '2026-04-22T10:00:00Z' },
        { child_id: 'a', assessment_type: 'letter_egra', correct_responses: 8, created_at: '2026-04-21T10:00:00Z' },
      ],
    );
    expect(result[0].letters_total_correct).toBe(12);
  });

  test('filters by classId when provided', () => {
    const result = projectAssessedChildrenForGrouping(
      [childA, childC],
      [
        { child_id: 'a', assessment_type: 'letter_egra', correct_responses: 10, created_at: '2026-04-20T10:00:00Z' },
        { child_id: 'c', assessment_type: 'letter_egra', correct_responses: 20, created_at: '2026-04-20T10:00:00Z' },
      ],
      { classId: 'k1' },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  test('picks latest letter + latest words independently', () => {
    const result = projectAssessedChildrenForGrouping(
      [childA],
      [
        { child_id: 'a', assessment_type: 'letter_egra', correct_responses: 35, created_at: '2026-04-22T10:00:00Z' },
        { child_id: 'a', assessment_type: 'words_egra', correct_responses: 6, created_at: '2026-04-22T11:00:00Z' },
      ],
    );
    expect(result[0].letters_total_correct).toBe(35);
    expect(result[0].words_total_correct).toBe(6);
  });

  test('words_total_correct undefined when no words assessment exists', () => {
    const result = projectAssessedChildrenForGrouping(
      [childA],
      [{ child_id: 'a', assessment_type: 'letter_egra', correct_responses: 20, created_at: '2026-04-22T10:00:00Z' }],
    );
    expect(result[0].words_total_correct).toBeUndefined();
  });
});

describe('insertIntoExistingGroups — edge cases', () => {
  test('no new children → empty placements', () => {
    const groups = [{ id: 'g1', name: 'L1', type: 'Letters', children: [{ letters_total_correct: 5 }] }];
    const result = insertIntoExistingGroups([], groups);
    expect(result.placements).toEqual([]);
    expect(result.unplaced).toEqual([]);
  });

  test('no existing groups → all children unplaced (caller should use assignGroups)', () => {
    const result = insertIntoExistingGroups([makeChild('a', 10)], []);
    expect(result.placements).toEqual([]);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0].id).toBe('a');
  });

  test('null/undefined inputs handled safely', () => {
    expect(insertIntoExistingGroups(null, null).placements).toEqual([]);
    expect(insertIntoExistingGroups(null, null).unplaced).toEqual([]);
  });
});

describe('insertIntoExistingGroups — closest-median placement', () => {
  const makeGroup = (id, name, type, memberScores) => ({
    id,
    name,
    type,
    children: memberScores.map((s, i) => ({ id: `${name}-m${i}`, letters_total_correct: s })),
  });

  test('places new child in the group whose median is closest to their score', () => {
    const groups = [
      makeGroup('g1', 'L1', 'Letters', [2, 4, 6, 8, 10]),   // median 6
      makeGroup('g2', 'L2', 'Letters', [12, 14, 16, 18, 20]), // median 16
      makeGroup('g3', 'L3', 'Letters', [22, 24, 26, 28, 29]), // median 26
    ];
    const { placements } = insertIntoExistingGroups([makeChild('new', 15)], groups);
    expect(placements).toHaveLength(1);
    expect(placements[0].groupName).toBe('L2');
    expect(placements[0].flags).toEqual([]);
  });

  test('prefers a track-matching group even when a cross-track group has closer median', () => {
    // Letters group median=28 (very close to score 30 threshold), Blending median=15
    // Child with score 35 is Blending-eligible — should go to Blending despite further median
    const groups = [
      makeGroup('g1', 'L1', 'Letters', [26, 28, 30]), // median 28
      makeGroup('g2', 'B1', 'Blending', [35, 40, 45]), // median 40
    ];
    const { placements } = insertIntoExistingGroups([makeChild('new', 35)], groups);
    expect(placements[0].groupName).toBe('B1');
    expect(placements[0].flags).not.toContain('track-mismatch');
  });

  test('falls back across tracks when preferred track full, flags track-mismatch', () => {
    // Blending group at MAX (9 members), Letters group has space
    const full = Array.from({ length: 9 }, (_, i) => ({ id: `b${i}`, letters_total_correct: 40 }));
    const groups = [
      { id: 'g1', name: 'L1', type: 'Letters', children: [{ letters_total_correct: 10 }] },
      { id: 'g2', name: 'B1', type: 'Blending', children: full },
    ];
    const { placements } = insertIntoExistingGroups([makeChild('new', 35)], groups); // Blending-eligible
    expect(placements[0].groupName).toBe('L1');
    expect(placements[0].flags).toContain('track-mismatch');
  });

  test('falls back when only cross-track groups exist', () => {
    const groups = [{ id: 'g1', name: 'L1', type: 'Letters', children: [{ letters_total_correct: 10 }] }];
    const { placements } = insertIntoExistingGroups([makeChild('new', 35)], groups);
    expect(placements[0].groupName).toBe('L1');
    expect(placements[0].flags).toContain('track-mismatch');
  });
});

describe('insertIntoExistingGroups — size flags', () => {
  const makeGroup = (id, name, type, count, score = 10) => ({
    id,
    name,
    type,
    children: Array.from({ length: count }, (_, i) => ({ id: `${name}-m${i}`, letters_total_correct: score })),
  });

  test('flags oversize when placement pushes group size above IDEAL_MAX (8)', () => {
    const groups = [makeGroup('g1', 'L1', 'Letters', 8)]; // adding 1 → size 9
    const { placements } = insertIntoExistingGroups([makeChild('new', 10)], groups);
    expect(placements[0].flags).toContain('oversize');
  });

  test('does not flag oversize when placement stays within ideal', () => {
    const groups = [makeGroup('g1', 'L1', 'Letters', 7)]; // adding 1 → size 8 (ideal)
    const { placements } = insertIntoExistingGroups([makeChild('new', 10)], groups);
    expect(placements[0].flags).not.toContain('oversize');
  });

  test('flags no-capacity when every group is at MAX and still places in closest', () => {
    const groups = [
      makeGroup('g1', 'L1', 'Letters', 9, 5),   // all at MAX; L1 closer to score
      makeGroup('g2', 'L2', 'Letters', 9, 20),
    ];
    const { placements } = insertIntoExistingGroups([makeChild('new', 6)], groups);
    expect(placements[0].groupName).toBe('L1');
    expect(placements[0].flags).toContain('no-capacity');
    expect(placements[0].flags).toContain('oversize');
  });
});

describe('insertIntoExistingGroups — multiple insertions', () => {
  test('running updated state between placements (second child sees first placed)', () => {
    // L1 at 8 members; adding two children. First lands in L1 (closer median).
    // Second should then prefer L1 less (size grew to 9 = MAX) and go elsewhere if closer group exists.
    const groups = [
      {
        id: 'g1',
        name: 'L1',
        type: 'Letters',
        children: Array.from({ length: 8 }, () => ({ letters_total_correct: 10 })),
      },
      {
        id: 'g2',
        name: 'L2',
        type: 'Letters',
        children: Array.from({ length: 5 }, () => ({ letters_total_correct: 20 })),
      },
    ];
    const { placements, updatedGroups } = insertIntoExistingGroups(
      [makeChild('a', 11), makeChild('b', 12)],
      groups,
    );
    expect(placements[0].groupName).toBe('L1'); // L1 size becomes 9
    expect(placements[1].groupName).toBe('L2'); // L1 now at MAX, so L2 chosen
    expect(updatedGroups.find(g => g.id === 'g1').children).toHaveLength(9);
    expect(updatedGroups.find(g => g.id === 'g2').children).toHaveLength(6);
  });

  test('does not mutate input groups', () => {
    const groups = [
      { id: 'g1', name: 'L1', type: 'Letters', children: [{ letters_total_correct: 5 }] },
    ];
    const originalMemberCount = groups[0].children.length;
    insertIntoExistingGroups([makeChild('a', 5)], groups);
    expect(groups[0].children).toHaveLength(originalMemberCount);
  });
});
