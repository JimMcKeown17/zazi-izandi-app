import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { getGroupColor } from '../children/GroupPickerBottomSheet';

/**
 * Bottom sheet for moving a child between in-memory preview groups.
 * Does NOT persist — caller handles state update via onSelect.
 */
export default function PreviewGroupPickerSheet({
  visible,
  onDismiss,
  childName,
  currentGroupName,
  groups,
  onSelect,
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>
        <Text variant="titleMedium" style={styles.title}>Move to group</Text>
        <Text variant="bodySmall" style={styles.subtitle}>{childName}</Text>

        <ScrollView style={styles.scrollArea} bounces={false}>
          {groups.map((group, idx) => {
            const isCurrent = group.name === currentGroupName;
            const colorScheme = getGroupColor(idx);
            return (
              <TouchableOpacity
                key={group.name}
                style={[
                  styles.groupRow,
                  isCurrent && { borderColor: colorScheme.text, borderWidth: 2 },
                ]}
                onPress={() => {
                  if (!isCurrent) onSelect(group.name);
                  onDismiss();
                }}
              >
                <View style={styles.groupInfo}>
                  <View style={[styles.groupColorDot, { backgroundColor: colorScheme.text }]} />
                  <View>
                    <Text variant="bodyLarge" style={[
                      styles.groupName,
                      isCurrent && { color: colorScheme.text, fontWeight: '700' },
                    ]}>
                      {group.name}
                    </Text>
                    <Text variant="bodySmall" style={styles.groupMeta}>
                      {group.type} · {group.children.length} {group.children.length === 1 ? 'child' : 'children'}
                    </Text>
                  </View>
                </View>
                {isCurrent && (
                  <Text style={[styles.checkmark, { color: colorScheme.text }]}>✓</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '80%',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  title: {
    fontWeight: '700',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  scrollArea: {
    paddingHorizontal: spacing.lg,
  },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  groupName: {
    fontWeight: '500',
  },
  groupMeta: {
    color: colors.textSecondary,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '700',
  },
});
