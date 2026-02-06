import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAiPlanner, AiPhase } from '../../hooks/useAiPlanner';
import { AiPlanningAnimation } from './AiPlanningAnimation';
import { AiPlanPreview } from './AiPlanPreview';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { ProgressStep } from '../../services/ai/planExecutor';

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: 'create' | 'enhance';
  tripId?: string;
  userId: string;
  initialContext: {
    destination?: string;
    destinationLat?: number | null;
    destinationLng?: number | null;
    startDate?: string;
    endDate?: string;
    currency?: string;
    tripName?: string;
    notes?: string | null;
  };
  onComplete?: (tripId: string) => void;
}

const PROGRESS_LABELS: Record<ProgressStep, string> = {
  trip: 'Erstelle Trip...',
  days: 'Erstelle Tage...',
  activities: 'Erstelle Aktivitaeten...',
  stops: 'Erstelle Stops...',
  budget: 'Erstelle Budget...',
  done: 'Fertig!',
};

export const AiTripModal: React.FC<Props> = ({
  visible, onClose, mode, tripId, userId, initialContext, onComplete,
}) => {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const {
    phase, messages, metadata, plan, error, sending,
    progressStep, executionResult, tokenWarning,
    startConversation, sendMessage, generatePlan,
    confirmPlan, rejectPlan, reset,
  } = useAiPlanner({ mode, tripId, userId, initialContext });

  // Auto-start conversation when modal opens
  useEffect(() => {
    if (visible && phase === 'idle') {
      startConversation();
    }
  }, [visible, phase]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, sending]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText('');
  };

  const handleChipPress = (text: string) => {
    sendMessage(text);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleComplete = () => {
    if (executionResult) {
      onComplete?.(executionResult.tripId);
    }
    handleClose();
  };

  // Render different phases
  const renderContent = () => {
    if (phase === 'generating_plan') {
      return <AiPlanningAnimation />;
    }

    if (phase === 'previewing_plan' && plan) {
      return (
        <AiPlanPreview
          plan={plan}
          currency={initialContext.currency || 'CHF'}
          onConfirm={confirmPlan}
          onReject={rejectPlan}
        />
      );
    }

    if (phase === 'executing_plan') {
      return (
        <View style={styles.executingContainer}>
          <LinearGradient colors={[...gradients.ocean]} style={styles.executingGradient}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.executingTitle}>Plan wird umgesetzt</Text>
            {progressStep && (
              <Text style={styles.executingStep}>{PROGRESS_LABELS[progressStep]}</Text>
            )}
          </LinearGradient>
        </View>
      );
    }

    if (phase === 'completed') {
      return (
        <View style={styles.completedContainer}>
          <LinearGradient colors={[...gradients.ocean]} style={styles.completedGradient}>
            <Text style={styles.completedIcon}>{'🎉'}</Text>
            <Text style={styles.completedTitle}>Reiseplan erstellt!</Text>
            {executionResult && (
              <View style={styles.completedStats}>
                {executionResult.daysCreated > 0 && (
                  <Text style={styles.completedStat}>{executionResult.daysCreated} Tage</Text>
                )}
                {executionResult.activitiesCreated > 0 && (
                  <Text style={styles.completedStat}>{executionResult.activitiesCreated} Aktivitaeten</Text>
                )}
                {executionResult.stopsCreated > 0 && (
                  <Text style={styles.completedStat}>{executionResult.stopsCreated} Stops</Text>
                )}
                {executionResult.budgetCategoriesCreated > 0 && (
                  <Text style={styles.completedStat}>{executionResult.budgetCategoriesCreated} Budget-Kategorien</Text>
                )}
              </View>
            )}
            <TouchableOpacity style={styles.completedButton} onPress={handleComplete}>
              <Text style={styles.completedButtonText}>Zur Reise</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      );
    }

    // Default: chat view (conversing)
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text style={[
                styles.messageText,
                msg.role === 'user' ? styles.userText : styles.aiText,
              ]}>
                {msg.content}
              </Text>
            </View>
          ))}

          {sending && (
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => sendMessage('Weiter')}>
                <Text style={styles.errorRetry}>Erneut versuchen</Text>
              </TouchableOpacity>
            </View>
          )}

          {tokenWarning && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>Die Konversation wird lang. Du kannst jetzt den Plan erstellen lassen.</Text>
            </View>
          )}
        </ScrollView>

        {/* Suggestion chips */}
        {metadata?.suggested_questions && metadata.suggested_questions.length > 0 && !sending && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsContainer}
            contentContainerStyle={styles.chipsContent}
          >
            {metadata.suggested_questions.map((q, i) => (
              <TouchableOpacity
                key={i}
                style={styles.chip}
                onPress={() => handleChipPress(q)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText} numberOfLines={1}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Generate plan button */}
        {metadata?.ready_to_plan && !sending && (
          <TouchableOpacity style={styles.generateButton} onPress={generatePlan} activeOpacity={0.8}>
            <LinearGradient
              colors={[...gradients.ocean]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.generateButtonGradient}
            >
              <Text style={styles.generateButtonText}>{'✨ Plan erstellen'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Nachricht eingeben..."
            placeholderTextColor={colors.textLight}
            multiline
            maxLength={1000}
            editable={!sending}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>{'➤'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        {phase !== 'completed' && (
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeText}>{'✕'}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {'✨ Fable'}
            </Text>
            <View style={styles.closeButton} />
          </View>
        )}

        {renderContent()}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: colors.textSecondary },
  headerTitle: { ...typography.h3, textAlign: 'center', flex: 1 },

  // Chat
  chatContainer: { flex: 1 },
  messageList: { flex: 1 },
  messageListContent: { padding: spacing.md, paddingBottom: spacing.xl },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.xs,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderBottomLeftRadius: spacing.xs,
    ...shadows.sm,
  },
  messageText: { ...typography.body, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  aiText: { color: colors.text },

  // Error
  errorBanner: {
    backgroundColor: '#FFF5F5',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorText: { ...typography.bodySmall, color: colors.error },
  errorRetry: { ...typography.bodySmall, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },

  // Warning
  warningBanner: {
    backgroundColor: '#FFFBF0',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  warningText: { ...typography.bodySmall, color: colors.textSecondary },

  // Chips
  chipsContainer: { maxHeight: 48, borderTopWidth: 1, borderTopColor: colors.border },
  chipsContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.secondary,
    backgroundColor: colors.card,
    marginRight: spacing.sm,
  },
  chipText: { ...typography.bodySmall, color: colors.secondary },

  // Generate button
  generateButton: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  generateButtonGradient: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  generateButtonText: { ...typography.button, color: '#FFFFFF' },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    ...typography.body,
    maxHeight: 100,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.border },
  sendButtonText: { fontSize: 18, color: '#FFFFFF' },

  // Executing
  executingContainer: { flex: 1 },
  executingGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  executingTitle: { ...typography.h2, color: '#FFFFFF', marginTop: spacing.lg },
  executingStep: { ...typography.body, color: 'rgba(255,255,255,0.8)', marginTop: spacing.sm },

  // Completed
  completedContainer: { flex: 1 },
  completedGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  completedIcon: { fontSize: 64, marginBottom: spacing.lg },
  completedTitle: { ...typography.h1, color: '#FFFFFF', marginBottom: spacing.lg },
  completedStats: { alignItems: 'center', marginBottom: spacing.xl },
  completedStat: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginBottom: spacing.xs },
  completedButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    ...shadows.md,
  },
  completedButtonText: { ...typography.button, color: colors.secondary },
});
