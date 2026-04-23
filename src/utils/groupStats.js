import { LETTER_ORDER } from '../constants/literacyConstants';

function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateString(dateOrString) {
  if (!dateOrString) return null;
  if (typeof dateOrString === 'string') return dateOrString.slice(0, 10);
  return toLocalDateString(dateOrString);
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // ISO week starts Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function getSunday(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

/**
 * Per-group stats for the Groups view. Pure function — no I/O, no side effects.
 *
 * @param {Object} args
 * @param {Object} args.group - { id, name, ... }
 * @param {Array} args.childrenInGroup - children currently in this group
 * @param {Array} args.sessions - all sessions for the EA (filtered internally by group_ids)
 * @param {Array} args.letterMastery - all letter_mastery records for the EA
 * @param {Date} [args.now] - injectable clock for tests; defaults to new Date()
 * @returns {{ sessionsThisWeek: number, currentLetter: string|null,
 *             progressPercent: number, childrenCount: number }}
 */
export function computeGroupStats({
  group,
  childrenInGroup,
  sessions,
  letterMastery,
  now = new Date(),
}) {
  const childIds = new Set((childrenInGroup || []).map(c => c.id));

  const monday = getMonday(now);
  const sunday = getSunday(monday);
  const mondayStr = toDateString(monday);
  const sundayStr = toDateString(sunday);

  let sessionsThisWeek = 0;
  for (const s of sessions || []) {
    const ds = toDateString(s.session_date);
    if (!ds) continue;
    if (ds < mondayStr || ds > sundayStr) continue;
    const groupIds = s.group_ids || [];
    if (groupIds.includes(group.id)) sessionsThisWeek++;
  }

  let currentLetter = null;
  let currentLetterMarker = '';
  for (const r of letterMastery || []) {
    if (!childIds.has(r.child_id)) continue;
    if ((r.source || 'taught') !== 'taught') continue;
    if (r._deleted) continue;
    const marker = r.created_at || r.updated_at || '';
    if (marker > currentLetterMarker) {
      currentLetterMarker = marker;
      currentLetter = r.letter;
    }
  }

  let progressPercent = 0;
  if (childrenInGroup.length > 0 && LETTER_ORDER.length > 0) {
    let totalPercent = 0;
    for (const child of childrenInGroup) {
      const taught = new Set();
      for (const r of letterMastery || []) {
        if (r.child_id !== child.id) continue;
        if ((r.source || 'taught') !== 'taught') continue;
        if (r._deleted) continue;
        taught.add(r.letter);
      }
      totalPercent += (taught.size / LETTER_ORDER.length) * 100;
    }
    progressPercent = Math.round(totalPercent / childrenInGroup.length);
  }

  return {
    sessionsThisWeek,
    currentLetter,
    progressPercent,
    childrenCount: childrenInGroup.length,
  };
}
