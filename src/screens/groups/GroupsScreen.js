import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Card, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { storage } from '../../utils/storage';
import { computeGroupStats } from '../../utils/groupStats';
import { getGroupColor } from '../../components/children/GroupPickerBottomSheet';

export default function GroupsScreen({ route, navigation }) {
  const { classId } = route.params || {};
  const { groups, childrenGroups, getChildrenInGroup } = useChildren();
  const { classes, getChildrenInClass } = useClasses();

  const [sessions, setSessions] = useState(null);
  const [letterMastery, setLetterMastery] = useState(null);

  // Pull sessions + letter_mastery from local cache; refreshed on each focus
  // so newly recorded sessions / taught letters surface immediately when the
  // EA returns from those screens.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [s, lm] = await Promise.all([
          storage.getSessions(),
          storage.getLetterMastery(),
        ]);
        if (!cancelled) {
          setSessions(s);
          setLetterMastery(lm);
        }
      })();
      return () => { cancelled = true; };
    }, []),
  );

  const classItem = useMemo(
    () => (classId ? classes.find(c => c.id === classId) : null),
    [classId, classes],
  );

  // Filter groups: when a classId is provided, show only groups whose members
  // include at least one child in that class. Otherwise show all of the EA's
  // groups.
  const visibleGroups = useMemo(() => {
    const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    if (!classId) return sortedGroups;

    const classChildIds = new Set(getChildrenInClass(classId).map(c => c.id));
    const groupIdsInClass = new Set();
    for (const cg of childrenGroups) {
      if (classChildIds.has(cg.child_id)) groupIdsInClass.add(cg.group_id);
    }
    return sortedGroups.filter(g => groupIdsInClass.has(g.id));
  }, [groups, classId, childrenGroups, getChildrenInClass]);

  const isLoading = sessions === null || letterMastery === null;

  const headerTitle = classId && classItem
    ? `Groups in ${classItem.name}`
    : 'My Groups';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text variant="titleLarge" style={styles.header}>{headerTitle}</Text>
        <Text variant="bodySmall" style={styles.subheader}>
          {visibleGroups.length} {visibleGroups.length === 1 ? 'group' : 'groups'}
        </Text>

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <Text variant="bodySmall" style={styles.loadingText}>Loading stats…</Text>
          </View>
        )}

        {!isLoading && visibleGroups.length === 0 && (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Text variant="bodyMedium" style={styles.emptyText}>
                {classId
                  ? "No groups for this class yet. Use \"Auto-group this class\" on Class Details to create them."
                  : "No groups yet. Auto-group a class from Class Details to get started."}
              </Text>
            </Card.Content>
          </Card>
        )}

        {!isLoading && visibleGroups.map((group, idx) => {
          const childrenInGroup = getChildrenInGroup(group.id);
          const stats = computeGroupStats({
            group,
            childrenInGroup,
            sessions,
            letterMastery,
          });
          const color = getGroupColor(idx);

          return (
            <Card key={group.id} style={styles.groupCard}>
              <Card.Content>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: color.text }]} />
                  <Text variant="titleMedium" style={[styles.groupName, { color: color.text }]}>
                    {group.name}
                  </Text>
                  <Text variant="bodySmall" style={styles.childCount}>
                    {stats.childrenCount} {stats.childrenCount === 1 ? 'child' : 'children'}
                  </Text>
                </View>

                <View style={styles.statsRow}>
                  <Stat label="Sessions this week" value={stats.sessionsThisWeek} />
                  <Stat
                    label="Current letter"
                    value={stats.currentLetter ? stats.currentLetter.toUpperCase() : '—'}
                  />
                  <Stat label="Progress" value={`${stats.progressPercent}%`} />
                </View>
              </Card.Content>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text variant="titleLarge" style={styles.statValue}>{value}</Text>
      <Text variant="labelSmall" style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { marginBottom: 2 },
  subheader: { color: colors.textSecondary, marginBottom: spacing.md },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  loadingText: {
    marginLeft: spacing.sm,
    color: colors.textSecondary,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  groupCard: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    borderRadius: borderRadius.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  groupName: {
    fontWeight: '700',
    flex: 1,
  },
  childCount: {
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  statValue: {
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  statLabel: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
