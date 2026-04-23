// Ported from the ZZ programme's canonical Python grouping rules at
// /Users/jimmckeown/Development/ZZ Data Site/grouping_logic_2026.py.
// Keep behavior in sync with that reference — the website's PM dashboard
// applies the same algorithm to historical TeamPact data, and divergence
// between the mobile and dashboard groupings would confuse EAs.

export const BLENDING_THRESHOLD = 30;
export const MIN_BLENDING_COUNT = 5;
export const TARGET_GROUP_SIZE = 7;
export const MIN_GROUP_SIZE = 5;
export const MAX_GROUP_SIZE = 9;
export const IDEAL_MIN_GROUP_SIZE = 6;
export const IDEAL_MAX_GROUP_SIZE = 8;

export function groupSizeStatus(size) {
  if (size >= IDEAL_MIN_GROUP_SIZE && size <= IDEAL_MAX_GROUP_SIZE) return 'Ideal (6-8)';
  if (size >= MIN_GROUP_SIZE && size <= MAX_GROUP_SIZE) return 'Allowed (5 or 9)';
  return 'Outside range (not 5-9)';
}

function lexicoLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

function chooseGroupSizes(
  learnerCount,
  {
    targetGroupSize = TARGET_GROUP_SIZE,
    minGroupSize = MIN_GROUP_SIZE,
    maxGroupSize = MAX_GROUP_SIZE,
  } = {},
) {
  if (learnerCount <= 0) return [];
  if (learnerCount <= maxGroupSize) return [learnerCount];

  const targetGroupCount = learnerCount / targetGroupSize;
  const minCandidate = Math.max(1, Math.floor(targetGroupCount) - 3);
  const maxCandidate = Math.floor(targetGroupCount) + 3;

  let bestSizes = [];
  let bestScore = null;

  for (let groupCount = minCandidate; groupCount <= maxCandidate; groupCount++) {
    if (groupCount <= 0) continue;

    const baseSize = Math.floor(learnerCount / groupCount);
    const remainder = learnerCount % groupCount;
    const candidateSizes = [
      ...new Array(remainder).fill(baseSize + 1),
      ...new Array(groupCount - remainder).fill(baseSize),
    ];

    const outOfBoundsCount = candidateSizes.reduce(
      (acc, size) => acc + (size < minGroupSize || size > maxGroupSize ? 1 : 0),
      0,
    );
    const distanceFromTarget = candidateSizes.reduce(
      (acc, size) => acc + Math.abs(size - targetGroupSize),
      0,
    );
    const spread = Math.max(...candidateSizes) - Math.min(...candidateSizes);
    const groupCountDistance = Math.abs(groupCount - targetGroupCount);

    const score = [outOfBoundsCount, distanceFromTarget, spread, groupCountDistance];
    if (bestScore === null || lexicoLess(score, bestScore)) {
      bestScore = score;
      bestSizes = candidateSizes;
    }
  }

  return bestSizes.length > 0 ? bestSizes : [learnerCount];
}

function assignTrackGroups(children, groupType, sortMetricKey, options) {
  if (children.length === 0) return [];

  // Weakest first. Fallback to letters_total_correct when the track metric
  // (e.g. words_total_correct for the Blending track) is missing — matches
  // the Python reference's fillna behavior.
  const sorted = [...children].sort((a, b) => {
    const aMetric = a[sortMetricKey] ?? a.letters_total_correct ?? 0;
    const bMetric = b[sortMetricKey] ?? b.letters_total_correct ?? 0;
    if (aMetric !== bMetric) return aMetric - bMetric;

    const aLetters = a.letters_total_correct ?? 0;
    const bLetters = b.letters_total_correct ?? 0;
    if (aLetters !== bLetters) return aLetters - bLetters;

    const lastCmp = (a.last_name || '').localeCompare(b.last_name || '');
    if (lastCmp !== 0) return lastCmp;
    const firstCmp = (a.first_name || '').localeCompare(b.first_name || '');
    if (firstCmp !== 0) return firstCmp;
    return (a.id || '').localeCompare(b.id || '');
  });

  const sizes = chooseGroupSizes(sorted.length, options);
  const groups = [];
  let position = 0;

  sizes.forEach((size, idx) => {
    const groupNumber = idx + 1;
    const members = sorted.slice(position, position + size);
    position += size;
    groups.push({
      name: `${groupType[0]}${groupNumber}`,
      type: groupType,
      number: groupNumber,
      children: members,
      size: members.length,
      sizeStatus: groupSizeStatus(members.length),
    });
  });

  return groups;
}

/**
 * Group a single EA + class's assessed children into Letters/Blending tracks.
 *
 * @param {Array} children - each entry requires: id, first_name, last_name,
 *   letters_total_correct. Optional: words_total_correct.
 * @param {Object} [options] - override thresholds/sizes (mostly for tests).
 * @returns {Array} groups - e.g. [{ name: 'L1', type: 'Letters', number: 1,
 *   children: [...], size, sizeStatus }, ...]. Empty array if no children.
 */
export function assignGroups(children, options = {}) {
  if (!children || children.length === 0) return [];

  const {
    blendingThreshold = BLENDING_THRESHOLD,
    minBlendingCount = MIN_BLENDING_COUNT,
    minGroupSize = MIN_GROUP_SIZE,
    ...sizeOptions
  } = options;

  const blendingEligible = [];
  const lettersOnly = [];
  for (const child of children) {
    if ((child.letters_total_correct ?? 0) > blendingThreshold) {
      blendingEligible.push(child);
    } else {
      lettersOnly.push(child);
    }
  }

  const canSplit =
    blendingEligible.length >= minBlendingCount &&
    (lettersOnly.length === 0 || lettersOnly.length >= minGroupSize);

  const trackOptions = { minGroupSize, ...sizeOptions };

  if (canSplit) {
    return [
      ...assignTrackGroups(lettersOnly, 'Letters', 'letters_total_correct', trackOptions),
      ...assignTrackGroups(blendingEligible, 'Blending', 'words_total_correct', trackOptions),
    ];
  }

  return assignTrackGroups(children, 'Letters', 'letters_total_correct', trackOptions);
}
