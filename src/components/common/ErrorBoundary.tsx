import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { logCritical } from '../../services/errorLogger';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logCritical(error, {
      component: 'ErrorBoundary',
      context: { componentStack: info.componentStack?.slice(0, 500) },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>!</Text>
          <Text style={styles.title}>Etwas ist schiefgelaufen</Text>
          <Text style={styles.message}>
            Der Fehler wurde automatisch gemeldet.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  icon: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.error,
    width: 72,
    height: 72,
    lineHeight: 72,
    textAlign: 'center',
    backgroundColor: '#FFF0ED',
    borderRadius: 36,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 4,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  buttonText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
