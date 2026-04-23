import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, Card, Button, Banner, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { storage } from '../../utils/storage';
import {
  assignGroups,
  insertIntoExistingGroups,
  projectAssessedChildrenForGrouping,
  groupSizeStatus,
  IDEAL_MAX_GROUP_SIZE,
} from '../../utils/autoGrouping';
import PreviewGroupPickerSheet from '../../components/groups/PreviewGroupPickerSheet';
import { getGroupColor } from '../../components/children/GroupPickerBottomSheet';

function inferTypeFromName(name) {
  if (/\bB\d|blending/i.test(name)) return 'Blending';
  return 'Letters';
}

function flagLabel(flag) {
  switch (flag) {
    case 'track-mismatch': return 'Placed across tracks — review';
    case 'oversize': return 'Group now above ideal size (8)';
    case 'no-capacity': return 'All groups at max — EA intervention needed';
    default: return flag;
  }
}

function flagSeverity(flag) {
  if (flag === 'no-capacity') return colors.error;
  if (flag === 'oversize') return colors.warning;
  return colors.accent;
}

export default function AutoGroupingPreviewScreen({ route, navigation }) {
  const { classId, mode } = route.params;
  const { user } = useAuth();
  const { classes, getChildrenInClass } = useClasses();
  const {
    groups: allGroups,
    childrenGroups,
    getChildrenInGroup,
  } = useChildren();

  const classItem = useMemo(() => classes.find(c => c.id === classId), [classes, classId]);
  const childrenInClass = useMemo(() => getChildrenInClass(classId), [getChildrenInClass, classId]);

  const [assessments, setAssessments] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pickerState, setPickerState] = useState({ visible: false, childId: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = await storage.getAssessments();
      if (!cancelled) setAssessments(a);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!classItem || assessments === null) return;

    const projected = projectAssessedChildrenForGrouping(childrenInClass, assessments, { classId });
    const projectedIds = new Set(projected.map(p => p.id));
    const orphans = childrenInClass.filter(c => !projectedIds.has(c.id));

    if (mode === 'full' || mode === 'redo') {
      const buckets = assignGroups(projected);
      setPreview({
        mode,
        orphans,
        groups: buckets.map(g => ({
          name: g.name,
          type: g.type,
          number: g.number,
          children: g.children,
          size: g.size,
          sizeStatus: g.sizeStatus,
          isNew: true,
          flags: [],
        })),
      });
      return;
    }

    if (mode === 'insert') {
      const classChildIds = new Set(childrenInClass.map(c => c.id));
      const classGroupIds = new Set(
        childrenGroups.filter(cg => classChildIds.has(cg.child_id)).map(cg => cg.group_id),
      );
      const existingClassGroups = allGroups
        .filter(g => classGroupIds.has(g.id))
        .map(g => {
          const members = getChildrenInGroup(g.id);
          const projectedMembers = members.map(child => {
            const p = projected.find(x => x.id === child.id);
            return p || {
              id: child.id,
              first_name: child.first_name,
              last_name: child.last_name,
              letters_total_correct: 0,
            };
          });
          return {
            id: g.id,
            name: g.name,
            type: inferTypeFromName(g.name),
            children: projectedMembers,
            isExisting: true,
          };
        });

      const groupedChildIds = new Set(existingClassGroups.flatMap(g => g.children.map(c => c.id)));
      const ungrouped = projected.filter(p => !groupedChildIds.has(p.id));

      const { placements, updatedGroups } = insertIntoExistingGroups(ungrouped, existingClassGroups);

      const groupFlags = new Map();
      for (const p of placements) {
        if (p.flags && p.flags.length) {
          const existing = groupFlags.get(p.groupId) || new Set();
          p.flags.forEach(f => existing.add(f));
          groupFlags.set(p.groupId, existing);
        }
      }

      setPreview({
        mode,
        orphans,
        groups: updatedGroups.map(g => ({
          id: g.id,
          name: g.name,
          type: g.type,
          children: g.children,
          size: g.children.length,
          sizeStatus: groupSizeStatus(g.children.length),
          isExisting: true,
          flags: Array.from(groupFlags.get(g.id) || []),
          insertedChildIds: new Set(
            placements.filter(p => p.groupId === g.id).map(p => p.child.id),
          ),
        })),
      });
    }
  }, [mode, classId, classItem, assessments, childrenInClass, allGroups, childrenGroups, getChildrenInGroup]);

  const assessedCount = preview?.groups.reduce((sum, g) => sum + g.children.length, 0) ?? 0;
  const totalInClass = childrenInClass.length;
  const coverage = totalInClass > 0 ? assessedCount / totalInClass : 0;
  const showCoverageWarning =
    (mode === 'full' || mode === 'redo') && totalInClass > 0 && coverage < 0.8;

  const handleMoveChild = (childId, newGroupName) => {
    setPreview(prev => {
      if (!prev) return prev;

      let currentGroupIdx = -1;
      let childObj = null;
      for (let i = 0; i < prev.groups.length; i++) {
        const idx = prev.groups[i].children.findIndex(c => c.id === childId);
        if (idx !== -1) {
          currentGroupIdx = i;
          childObj = prev.groups[i].children[idx];
          break;
        }
      }
      if (!childObj) return prev;

      const targetIdx = prev.groups.findIndex(g => g.name === newGroupName);
      if (targetIdx === -1 || targetIdx === currentGroupIdx) return prev;

      const newGroups = [...prev.groups];
      newGroups[currentGroupIdx] = {
        ...newGroups[currentGroupIdx],
        children: newGroups[currentGroupIdx].children.filter(c => c.id !== childId),
        size: newGroups[currentGroupIdx].children.length - 1,
      };
      newGroups[currentGroupIdx].sizeStatus = groupSizeStatus(newGroups[currentGroupIdx].size);

      newGroups[targetIdx] = {
        ...newGroups[targetIdx],
        children: [...newGroups[targetIdx].children, childObj],
        size: newGroups[targetIdx].children.length + 1,
      };
      newGroups[targetIdx].sizeStatus = groupSizeStatus(newGroups[targetIdx].size);

      return { ...prev, groups: newGroups };
    });
  };

  const handleAccept = () => {
    Alert.alert(
      'Coming Soon',
      'Persistence is landing in the next commit. The preview state is ready.',
    );
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard preview?',
      'Any reassignments you made will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ],
    );
  };

  if (!classItem) {
    return (
      <View style={styles.center}>
        <Text variant="bodyMedium">Class not found.</Text>
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text variant="bodySmall" style={styles.loadingText}>Computing suggested groups…</Text>
      </View>
    );
  }

  const headerLabel =
    mode === 'insert' ? `Adding to existing groups`
    : mode === 'redo' ? `Redoing all groups`
    : `Suggested groups`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text variant="titleLarge">{headerLabel}</Text>
          <Text variant="bodyMedium" style={styles.headerSubtitle}>
            {classItem.name} · {assessedCount} of {totalInClass} assessed
          </Text>
          <Text variant="bodySmall" style={styles.headerHint}>
            Tap a child to move them between groups.
          </Text>
        </View>

        {showCoverageWarning && (
          <Banner
            visible
            icon="alert-outline"
            style={styles.warningBanner}
          >
            Only {assessedCount} of {totalInClass} children assessed ({Math.round(coverage * 100)}%). You can proceed, but group sizes may shift as more kids are assessed.
          </Banner>
        )}

        {preview.orphans.length > 0 && (mode === 'full' || mode === 'redo') && (
          <Card style={styles.orphansCard}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.orphansTitle}>
                Not in any group ({preview.orphans.length})
              </Text>
              <Text variant="bodySmall" style={styles.orphansHint}>
                These children aren't assessed yet, so they can't be auto-grouped. Assess them, then "Add N children to groups" from Class Details.
              </Text>
              {preview.orphans.map(c => (
                <Text key={c.id} variant="bodySmall" style={styles.orphanRow}>
                  · {c.first_name} {c.last_name}
                </Text>
              ))}
            </Card.Content>
          </Card>
        )}

        {preview.groups.map((group, idx) => {
          const color = getGroupColor(idx);
          return (
            <Card key={group.name} style={styles.groupCard}>
              <Card.Content>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: color.text }]} />
                  <Text variant="titleMedium" style={[styles.groupName, { color: color.text }]}>
                    {group.name}
                  </Text>
                  <Text variant="bodySmall" style={styles.groupMeta}>
                    {group.type} · {group.size} {group.size === 1 ? 'child' : 'children'}
                  </Text>
                  <View style={styles.spacer} />
                  <Text variant="labelSmall" style={[styles.sizeStatus, statusColor(group.size)]}>
                    {group.sizeStatus}
                  </Text>
                </View>

                {group.flags && group.flags.length > 0 && (
                  <View style={styles.flagsContainer}>
                    {group.flags.map(flag => (
                      <View
                        key={flag}
                        style={[styles.flagChip, { borderColor: flagSeverity(flag) }]}
                      >
                        <Ionicons
                          name="warning-outline"
                          size={13}
                          color={flagSeverity(flag)}
                          style={styles.flagIcon}
                        />
                        <Text style={[styles.flagText, { color: flagSeverity(flag) }]}>
                          {flagLabel(flag)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {group.children.map(child => {
                  const justInserted = group.insertedChildIds?.has(child.id);
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childRow,
                        justInserted && styles.childRowNew,
                      ]}
                      onPress={() => setPickerState({ visible: true, childId: child.id })}
                    >
                      <View style={styles.childInfo}>
                        <Text variant="bodyLarge" style={styles.childName}>
                          {child.first_name} {child.last_name}
                        </Text>
                        <Text variant="bodySmall" style={styles.childScore}>
                          {child.letters_total_correct ?? 0} letters correct
                          {child.words_total_correct != null && ` · ${child.words_total_correct} words`}
                        </Text>
                      </View>
                      {justInserted && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      )}
                      <Ionicons name="swap-horizontal" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  );
                })}

                {group.children.length === 0 && (
                  <Text variant="bodySmall" style={styles.emptyGroupText}>
                    (empty — move children here or delete this group after Accept)
                  </Text>
                )}
              </Card.Content>
            </Card>
          );
        })}

        {preview.groups.length === 0 && (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Text variant="bodyMedium">
                No assessed children to group yet. Assess at least 5 children in this class to auto-group.
              </Text>
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button mode="outlined" onPress={handleCancel} style={styles.footerBtn}>
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleAccept}
          style={styles.footerBtn}
          disabled={preview.groups.length === 0}
        >
          Accept
        </Button>
      </View>

      {pickerState.visible && (
        <PreviewGroupPickerSheet
          visible
          onDismiss={() => setPickerState({ visible: false, childId: null })}
          childName={(() => {
            for (const g of preview.groups) {
              const match = g.children.find(c => c.id === pickerState.childId);
              if (match) return `${match.first_name} ${match.last_name}`;
            }
            return '';
          })()}
          currentGroupName={(() => {
            for (const g of preview.groups) {
              if (g.children.some(c => c.id === pickerState.childId)) return g.name;
            }
            return null;
          })()}
          groups={preview.groups}
          onSelect={newName => handleMoveChild(pickerState.childId, newName)}
        />
      )}
    </View>
  );
}

function statusColor(size) {
  if (size >= 6 && size <= 8) return { color: colors.success };
  if (size >= 5 && size <= 9) return { color: colors.accentDeep };
  return { color: colors.error };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  header: {
    marginBottom: spacing.md,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerHint: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  warningBanner: {
    backgroundColor: '#FFF8E1',
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  orphansCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.cardBackground,
    borderLeftWidth: 3,
    borderLeftColor: colors.textSecondary,
  },
  orphansTitle: {
    color: colors.textSecondary,
    marginBottom: 2,
  },
  orphansHint: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  orphanRow: {
    color: colors.textSecondary,
    marginVertical: 1,
  },
  groupCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  groupName: {
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  groupMeta: {
    color: colors.textSecondary,
  },
  spacer: {
    flex: 1,
  },
  sizeStatus: {
    fontWeight: '600',
  },
  flagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  flagIcon: {
    marginRight: 4,
  },
  flagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    marginVertical: 2,
    backgroundColor: colors.cardBackground,
  },
  childRowNew: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#F0F6FF',
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontWeight: '500',
  },
  childScore: {
    color: colors.textSecondary,
  },
  newBadge: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: spacing.sm,
  },
  newBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emptyGroupText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  emptyCard: {
    backgroundColor: colors.surface,
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  footerBtn: {
    flex: 1,
  },
});
