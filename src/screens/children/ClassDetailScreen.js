import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import {
  Text,
  Card,
  FAB,
  List,
  IconButton,
  Button,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useClasses } from '../../context/ClassesContext';
import { useChildren } from '../../context/ChildrenContext';
import { storage } from '../../utils/storage';
import { MIN_GROUP_SIZE } from '../../utils/autoGrouping';
import GroupPickerBottomSheet, { getGroupColor } from '../../components/children/GroupPickerBottomSheet';

export default function ClassDetailScreen({ route, navigation }) {
  const { classId } = route.params;
  const { classes, schools, getChildrenInClass } = useClasses();
  const { groups, childrenGroups } = useChildren();

  const classItem = classes.find(c => c.id === classId);
  const childrenInClass = getChildrenInClass(classId);
  const school = schools.find(s => s.id === classItem?.school_id);

  // Bottom sheet state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedChild, setSelectedChild] = useState(null);

  // Force re-render when groups change (after assignment)
  const [, setRefreshKey] = useState(0);
  const handleGroupChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Assessed child IDs in this class — refreshed each time the screen gains focus
  // so returning from an assessment surfaces the updated auto-grouping CTA.
  const [assessedIdsInClass, setAssessedIdsInClass] = useState(new Set());
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const assessments = await storage.getAssessments();
        const classChildIds = new Set(childrenInClass.map(c => c.id));
        const ids = new Set(
          assessments
            .filter(a => a.assessment_type === 'letter_egra' || !a.assessment_type)
            .filter(a => classChildIds.has(a.child_id))
            .map(a => a.child_id),
        );
        if (!cancelled) setAssessedIdsInClass(ids);
      })();
      return () => { cancelled = true; };
    }, [childrenInClass]),
  );

  const autoGroupingCTA = useMemo(() => {
    if (!classItem || childrenInClass.length === 0) return null;

    const classChildIds = new Set(childrenInClass.map(c => c.id));
    const classGroupIds = new Set(
      childrenGroups.filter(cg => classChildIds.has(cg.child_id)).map(cg => cg.group_id),
    );
    const existingClassGroupCount = groups.filter(g => classGroupIds.has(g.id)).length;

    const groupedChildIds = new Set(
      childrenGroups.filter(cg => classGroupIds.has(cg.group_id)).map(cg => cg.child_id),
    );
    const ungroupedAssessed = [...assessedIdsInClass].filter(id => !groupedChildIds.has(id)).length;
    const assessedCount = assessedIdsInClass.size;

    if (existingClassGroupCount === 0) {
      if (assessedCount < MIN_GROUP_SIZE) return null;
      return {
        label: 'Suggest groups',
        mode: 'full',
        showRedo: false,
      };
    }

    if (ungroupedAssessed > 0) {
      return {
        label: `Add ${ungroupedAssessed} ${ungroupedAssessed === 1 ? 'child' : 'children'} to groups`,
        mode: 'insert',
        showRedo: true,
      };
    }

    // Groups exist, no ungrouped assessed kids — only offer destructive redo
    return {
      label: null,
      mode: null,
      showRedo: true,
    };
  }, [classItem, childrenInClass, childrenGroups, groups, assessedIdsInClass]);

  const handleAutoGroupPress = (mode) => {
    navigation.navigate('AutoGroupingPreview', { classId, mode });
  };

  const handleRedoPress = () => {
    Alert.alert(
      'Redo all groups?',
      'This discards current groups for this class and re-buckets every assessed child from scratch. Typical for start-of-term regroupings; not common mid-term.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redo groups', style: 'destructive', onPress: () => handleAutoGroupPress('redo') },
      ],
    );
  };

  /**
   * Get the current group for a child (for this user's groups only).
   * Returns { group, groupIndex } or { group: null, groupIndex: -1 }
   */
  const getChildGroup = (childId) => {
    const groupIds = new Set(groups.map(g => g.id));
    const membership = childrenGroups.find(
      cg => cg.child_id === childId && groupIds.has(cg.group_id)
    );
    if (!membership) return { group: null, groupIndex: -1 };

    const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    const groupIndex = sortedGroups.findIndex(g => g.id === membership.group_id);
    return { group: sortedGroups[groupIndex], groupIndex };
  };

  const openGroupPicker = (child) => {
    setSelectedChild(child);
    setPickerVisible(true);
  };

  if (!classItem) {
    return (
      <View style={styles.container}>
        <Text variant="bodyMedium" style={styles.emptyText}>Class not found.</Text>
      </View>
    );
  }

  const renderChildItem = ({ item }) => {
    const { group, groupIndex } = getChildGroup(item.id);
    const colorScheme = group ? getGroupColor(groupIndex) : null;

    return (
      <TouchableOpacity
        style={styles.childCard}
        onPress={() => navigation.navigate('EditChild', { childId: item.id })}
        activeOpacity={0.7}
      >
        {/* Left: name + details */}
        <View style={styles.childInfo}>
          <Text variant="bodyLarge" style={styles.childName}>
            {item.first_name} {item.last_name}
          </Text>
          <View style={styles.detailRow}>
            {item.age ? (
              <Text variant="bodySmall" style={styles.childDetail}>
                Age {item.age}
              </Text>
            ) : null}
            {group ? (
              <View style={styles.groupRow}>
                {item.age ? <Text variant="bodySmall" style={styles.childDetail}>  ·  </Text> : null}
                <Text variant="bodySmall" style={styles.groupLabel}>Group:</Text>
                <TouchableOpacity
                  style={[styles.groupChip, { backgroundColor: colorScheme.bg }]}
                  onPress={() => openGroupPicker(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.groupChipText, { color: colorScheme.text }]}>
                    {group.name} ▾
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.groupRow}>
                {item.age ? <Text variant="bodySmall" style={styles.childDetail}>  ·  </Text> : null}
                <TouchableOpacity
                  style={styles.assignChip}
                  onPress={() => openGroupPicker(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.assignChipText}>+ Group</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {/* Unsynced indicator inline */}
          {!item.synced && (
            <View style={styles.syncRow}>
              <List.Icon
                icon="cloud-upload-outline"
                color={colors.accent}
                style={styles.syncIcon}
              />
              <Text variant="labelSmall" style={styles.syncText}>Syncing…</Text>
            </View>
          )}
        </View>

        {/* Right: action icons — large and tappable */}
        <View style={styles.actionIcons}>
          <IconButton
            icon="alpha-a-box-outline"
            size={30}
            iconColor={colors.primary}
            style={styles.actionIcon}
            onPress={() => navigation.navigate('LetterTracker', { child: item, classItem })}
          />
          <IconButton
            icon="chart-box-outline"
            size={30}
            iconColor={colors.primary}
            style={styles.actionIcon}
            onPress={() => navigation.navigate('ChildAssessmentSummary', {
              child: item,
              classItem,
            })}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Class info header */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <Text variant="titleLarge">{classItem.name}</Text>
              <Text variant="bodyMedium" style={styles.detailText}>
                {school?.name || 'Unknown school'}
              </Text>
              <Text variant="bodyMedium" style={styles.detailText}>
                {classItem.grade} • {classItem.teacher}
              </Text>
              <Text variant="bodySmall" style={styles.detailText}>
                Language: {classItem.home_language}
              </Text>
            </View>
            <IconButton
              icon="pencil"
              mode="contained-tonal"
              onPress={() => navigation.navigate('EditClass', { classId })}
            />
          </View>
        </Card.Content>
      </Card>

      {/* Auto-grouping CTA */}
      {autoGroupingCTA && (autoGroupingCTA.label || autoGroupingCTA.showRedo) && (
        <View style={styles.autoGroupContainer}>
          {autoGroupingCTA.label && (
            <Button
              mode="contained"
              icon="account-group"
              onPress={() => handleAutoGroupPress(autoGroupingCTA.mode)}
              style={styles.autoGroupBtn}
            >
              {autoGroupingCTA.label}
            </Button>
          )}
          {autoGroupingCTA.showRedo && (
            <View style={styles.autoGroupSecondaryRow}>
              <TouchableOpacity
                onPress={() => navigation.navigate('Groups', { classId })}
                style={styles.secondaryLink}
              >
                <Text style={styles.secondaryLinkText}>View groups</Text>
              </TouchableOpacity>
              <Text style={styles.secondarySeparator}>·</Text>
              <TouchableOpacity onPress={handleRedoPress} style={styles.secondaryLink}>
                <Text style={styles.secondaryLinkText}>Redo all groups</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Children list */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Children ({childrenInClass.length})
      </Text>

      <FlatList
        data={childrenInClass}
        keyExtractor={(item) => item.id}
        renderItem={renderChildItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              No children in this class yet.
            </Text>
            <Text variant="bodySmall" style={styles.emptyText}>
              Tap the + button to add a child.
            </Text>
          </View>
        }
        contentContainerStyle={
          childrenInClass.length === 0 ? styles.emptyContainer : null
        }
      />

      {/* FAB to add child */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddChild', { classId })}
      />

      {/* Group Picker Bottom Sheet */}
      {selectedChild && (
        <GroupPickerBottomSheet
          visible={pickerVisible}
          onDismiss={() => {
            setPickerVisible(false);
            setSelectedChild(null);
          }}
          childId={selectedChild.id}
          childName={`${selectedChild.first_name} ${selectedChild.last_name}`}
          currentGroupId={getChildGroup(selectedChild.id).group?.id || null}
          onGroupChanged={handleGroupChanged}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerCard: {
    margin: spacing.md,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
  },
  detailText: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  autoGroupContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  autoGroupBtn: {
    alignSelf: 'stretch',
  },
  redoLink: {
    paddingVertical: spacing.sm,
  },
  redoLinkText: {
    color: colors.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  autoGroupSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryLink: {
    paddingHorizontal: spacing.xs,
  },
  secondaryLinkText: {
    color: colors.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  secondarySeparator: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.xs,
  },
  childCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  childInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  childName: {
    fontWeight: '700',
    fontSize: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  childDetail: {
    color: colors.textSecondary,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginRight: 4,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  syncIcon: {
    margin: 0,
    width: 18,
    height: 18,
  },
  syncText: {
    color: colors.accent,
    fontSize: 11,
  },
  actionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionIcon: {
    margin: 0,
  },
  groupChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  groupChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  assignChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#F9A825',
    backgroundColor: '#FFF8E1',
  },
  assignChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F57F17',
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: spacing.lg,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
  },
});
