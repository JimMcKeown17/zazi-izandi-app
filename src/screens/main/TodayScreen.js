import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import SessionTimer from '../../components/session/SessionTimer';

function PlaceholderCard({ icon, title, body }) {
  return (
    <View style={[styles.card, styles.placeholderCard]}>
      <View style={styles.placeholderHeader}>
        <Ionicons name={icon} size={20} color={colors.primaryLight} />
        <Text variant="titleMedium" style={styles.placeholderTitle}>{title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Coming soon</Text>
        </View>
      </View>
      <Text variant="bodyMedium" style={styles.placeholderBody}>{body}</Text>
    </View>
  );
}

export default function TodayScreen({ navigation }) {
  const handleTimerEnd = (timing) => {
    navigation.navigate('SessionForm', timing);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PlaceholderCard
        icon="sparkles-outline"
        title="Daily Plan"
        body="An AI-generated plan for today's sessions will appear here — which groups to prioritize, which letters to focus on, and one coaching note on any flagged groups."
      />

      <SessionTimer onEnd={handleTimerEnd} />

      <Button
        mode="outlined"
        onPress={() => navigation.navigate('SessionForm')}
        style={styles.logWithoutTimer}
        icon="pencil-outline"
      >
        Log session without timer
      </Button>

      <PlaceholderCard
        icon="chatbubbles-outline"
        title="AI Coach"
        body={'Ask questions about your groups — "Which letters should Group 3 focus on today?" — and get answers from the Zazi iZandi coaching assistant.'}
      />

      <Button
        mode="text"
        onPress={() => navigation.navigate('SessionHistory')}
        icon="history"
        style={styles.historyLink}
      >
        View Session History
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  placeholderCard: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  placeholderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  placeholderTitle: {
    color: colors.text,
    fontWeight: '600',
    flex: 1,
  },
  placeholderBody: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  badge: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  logWithoutTimer: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  historyLink: {
    marginTop: spacing.sm,
  },
});
