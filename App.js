import 'react-native-get-random-values';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { OfflineProvider } from './src/context/OfflineContext';
import { ChildrenProvider } from './src/context/ChildrenContext';
import { ClassesProvider } from './src/context/ClassesContext';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/constants/colors';
import { logger } from './src/utils/logger';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.emoji}>!</Text>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            The app ran into an unexpected error. Please try again.
          </Text>
          <TouchableOpacity
            style={errorStyles.button}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={errorStyles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = RNStyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.emphasis,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

// Initialize logger to capture console output
logger.init();

// Custom theme using Zazi iZandi brand colors
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: '#E0EAF8',       // ZZ primary-100 tone for containers
    secondary: colors.accent,
    secondaryContainer: '#FFF5CC',     // Light yellow container
    tertiary: colors.emphasis,
    tertiaryContainer: '#FCEAED',      // Light red container
    error: colors.error,
    errorContainer: '#FCEAED',
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.cardBackground,
    onPrimary: '#FFFFFF',
    onSecondary: '#111111',
    onTertiary: '#FFFFFF',
    onBackground: colors.text,
    onSurface: colors.text,
    outline: colors.border,
    outlineVariant: colors.border,
    success: colors.success,
  },
};

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <OfflineProvider>
            <AuthProvider>
              <ChildrenProvider>
                <ClassesProvider>
                  <AppNavigator />
                  <StatusBar style="auto" />
                </ClassesProvider>
              </ChildrenProvider>
            </AuthProvider>
          </OfflineProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
