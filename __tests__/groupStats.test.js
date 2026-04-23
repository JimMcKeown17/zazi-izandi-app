import { computeGroupStats } from '../src/utils/groupStats';
import { LETTER_ORDER } from '../src/constants/literacyConstants';

const FIXED_NOW = new Date('2026-04-23T10:00:00'); // Thursday
const MONDAY_STR = '2026-04-20';
const TUESDAY_STR = '2026-04-21';
const SUNDAY_STR = '2026-04-26';
const PREV_FRIDAY = '2026-04-17';

const group = { id: 'g1', name: 'L1' };
const child1 = { id: 'c1', first_name: 'Alice', last_name: 'A' };
const child2 = { id: 'c2', first_name: 'Bob', last_name: 'B' };

describe('computeGroupStats — basics', () => {
  test('zero state — no children, no sessions, no mastery', () => {
    const stats = computeGroupStats({
      group,
      childrenInGroup: [],
      sessions: [],
      letterMastery: [],
      now: FIXED_NOW,
    });
    expect(stats).toEqual({
      sessionsThisWeek: 0,
      currentLetter: null,
      progressPercent: 0,
      childrenCount: 0,
    });
  });

  test('children count reflects childrenInGroup length', () => {
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1, child2],
      sessions: [],
      letterMastery: [],
      now: FIXED_NOW,
    });
    expect(stats.childrenCount).toBe(2);
  });
});

describe('computeGroupStats — sessions this week', () => {
  test('counts sessions in Mon-Sun whose group_ids include this group', () => {
    const sessions = [
      { session_date: TUESDAY_STR, group_ids: ['g1'] },          // ✓ in week, in group
      { session_date: TUESDAY_STR, group_ids: ['g2'] },          // ✗ in week, different group
      { session_date: PREV_FRIDAY, group_ids: ['g1'] },          // ✗ before week
      { session_date: '2026-04-27', group_ids: ['g1'] },         // ✗ next week (Mon after Sun)
      { session_date: SUNDAY_STR, group_ids: ['g1', 'g2'] },     // ✓ Sunday is in week
    ];
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1],
      sessions,
      letterMastery: [],
      now: FIXED_NOW,
    });
    expect(stats.sessionsThisWeek).toBe(2);
  });

  test('handles missing group_ids gracefully', () => {
    const sessions = [
      { session_date: TUESDAY_STR }, // no group_ids field at all
      { session_date: TUESDAY_STR, group_ids: null },
      { session_date: TUESDAY_STR, group_ids: ['g1'] },
    ];
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1],
      sessions,
      letterMastery: [],
      now: FIXED_NOW,
    });
    expect(stats.sessionsThisWeek).toBe(1);
  });
});

describe('computeGroupStats — current letter', () => {
  test('picks letter with most recent created_at among taught records for group children', () => {
    const letterMastery = [
      { child_id: 'c1', letter: 'a', source: 'taught', created_at: '2026-04-15T10:00:00Z' },
      { child_id: 'c2', letter: 'm', source: 'taught', created_at: '2026-04-22T10:00:00Z' },
      { child_id: 'c1', letter: 'e', source: 'taught', created_at: '2026-04-18T10:00:00Z' },
    ];
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1, child2],
      sessions: [],
      letterMastery,
      now: FIXED_NOW,
    });
    expect(stats.currentLetter).toBe('m');
  });

  test('ignores letters from children not in the group', () => {
    const letterMastery = [
      { child_id: 'c1', letter: 'a', source: 'taught', created_at: '2026-04-15T10:00:00Z' },
      { child_id: 'OTHER', letter: 'z', source: 'taught', created_at: '2026-04-22T10:00:00Z' },
    ];
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1],
      sessions: [],
      letterMastery,
      now: FIXED_NOW,
    });
    expect(stats.currentLetter).toBe('a');
  });

  test('skips deleted letter mastery records', () => {
    const letterMastery = [
      { child_id: 'c1', letter: 'a', source: 'taught', created_at: '2026-04-15T10:00:00Z' },
      { child_id: 'c1', letter: 'z', source: 'taught', created_at: '2026-04-22T10:00:00Z', _deleted: true },
    ];
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1],
      sessions: [],
      letterMastery,
      now: FIXED_NOW,
    });
    expect(stats.currentLetter).toBe('a');
  });

  test('returns null when no taught letters exist', () => {
    const letterMastery = [
      { child_id: 'c1', letter: 'a', source: 'assessed', created_at: '2026-04-15T10:00:00Z' },
    ];
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1],
      sessions: [],
      letterMastery,
      now: FIXED_NOW,
    });
    expect(stats.currentLetter).toBeNull();
  });
});

describe('computeGroupStats — progress %', () => {
  test('average per-child mastery against the LETTER_ORDER curriculum', () => {
    const total = LETTER_ORDER.length; // 26 letters
    // child1 has 13 letters mastered → 50%; child2 has 0 → 0%; average = 25%
    const letterMastery = LETTER_ORDER.slice(0, 13).map(letter => ({
      child_id: 'c1',
      letter,
      source: 'taught',
      created_at: '2026-04-15T10:00:00Z',
    }));
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1, child2],
      sessions: [],
      letterMastery,
      now: FIXED_NOW,
    });
    expect(stats.progressPercent).toBe(25);
  });

  test('100% when all children have all letters', () => {
    const letterMastery = [];
    for (const child of [child1, child2]) {
      for (const letter of LETTER_ORDER) {
        letterMastery.push({
          child_id: child.id,
          letter,
          source: 'taught',
          created_at: '2026-04-15T10:00:00Z',
        });
      }
    }
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1, child2],
      sessions: [],
      letterMastery,
      now: FIXED_NOW,
    });
    expect(stats.progressPercent).toBe(100);
  });

  test('only taught (not assessed) letters count toward progress', () => {
    const letterMastery = [
      { child_id: 'c1', letter: 'a', source: 'assessed' }, // ignored
      { child_id: 'c1', letter: 'e', source: 'taught', created_at: '2026-04-15T10:00:00Z' },
    ];
    const stats = computeGroupStats({
      group,
      childrenInGroup: [child1],
      sessions: [],
      letterMastery,
      now: FIXED_NOW,
    });
    // 1 of 26 = ~4%
    expect(stats.progressPercent).toBe(Math.round((1 / LETTER_ORDER.length) * 100));
  });
});
