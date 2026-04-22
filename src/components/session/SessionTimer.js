import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

const ACTIVE_SESSION_KEY = '@active_session_started_at';

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function SessionTimer({ onEnd }) {
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Hydrate from AsyncStorage on mount so the timer survives app backgrounding
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
      if (!cancelled && saved) {
        setStartedAt(saved);
        setNow(Date.now());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tick once per second while active
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const handleStart = async () => {
    const iso = new Date().toISOString();
    await AsyncStorage.setItem(ACTIVE_SESSION_KEY, iso);
    setStartedAt(iso);
    setNow(Date.now());
  };

  const handleEnd = async () => {
    const start = new Date(startedAt);
    const end = new Date();
    const durationSeconds = Math.max(0, Math.floor((end - start) / 1000));
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    setStartedAt(null);
    onEnd?.({
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      duration_seconds: durationSeconds,
    });
  };

  const isActive = !!startedAt;
  const elapsedMs = isActive ? now - new Date(startedAt).getTime() : 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name={isActive ? 'timer' : 'timer-outline'}
          size={22}
          color={isActive ? colors.emphasis : colors.primary}
        />
        <Text variant="titleMedium" style={styles.title}>Session Timer</Text>
      </View>

      {isActive ? (
        <>
          <Text style={styles.elapsed}>{formatElapsed(elapsedMs)}</Text>
          <Text variant="bodySmall" style={styles.activeHint}>
            Timer running — tap End when the session is over to log details.
          </Text>
          <Pressable onPress={handleEnd} style={[styles.button, styles.endButton]}>
            <Ionicons name="stop" size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>End Session</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text variant="bodyMedium" style={styles.helpText}>
            Start the timer when you begin. When you end, the session duration will be
            attached to the session you log.
          </Text>
          <Pressable onPress={handleStart} style={[styles.button, styles.startButton]}>
            <Ionicons name="play" size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>Start Session</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontWeight: '600',
  },
  helpText: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  elapsed: {
    fontSize: 48,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  activeHint: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  startButton: {
    backgroundColor: colors.primary,
  },
  endButton: {
    backgroundColor: colors.emphasis,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
