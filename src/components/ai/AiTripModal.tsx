import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
import { useAiPlanner, AiPhase } from '../../hooks/useAiPlanner';
import { AiPlanningAnimation } from './AiPlanningAnimation';
import { AiPlanPreview } from './AiPlanPreview';
import { BuyInspirationenModal } from '../common/BuyInspirationenModal';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { ProgressStep } from '../../services/ai/planExecutor';

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

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
    travelersCount?: number;
    groupType?: string;
  };
  onComplete?: (tripId: string) => void;
}

const PROGRESS_LABELS: Record<ProgressStep, string> = {
  structure: 'Erstelle Grundstruktur...',
  trip: 'Erstelle Trip...',
  days: 'Erstelle Tage...',
  activities: 'Erstelle Aktivitäten...',
  stops: 'Erstelle Stops...',
  budget: 'Erstelle Budget...',
  done: 'Fertig!',
};

export const AiTripModal: React.FC<Props> = ({
  visible, onClose, mode, tripId, userId, initialContext, onComplete,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user: authUser, profile } = useAuth();
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const {
    phase, messages, metadata, plan, error, sending,
    progressStep, executionResult, tokenWarning, conflicts,
    restored, creditsBalance,
    startConversation, sendMessage, generatePlan,
    confirmPlan, rejectPlan, showPreview, hidePreview, adjustPlan,
    dismissConflicts, confirmWithConflicts, reset,
  } = useAiPlanner({ mode, tripId, userId, initialContext });
  const [adjustMode, setAdjustMode] = useState(false);
  const [creditPurchased, setCreditPurchased] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);

  // Auto-start conversation when modal opens
  useEffect(() => {
    if (visible && phase === 'idle') {
      startConversation();
    }
    if (visible) { setCreditPurchased(false); setShowBuyModal(false); }
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
    // Don't reset — conversation is persisted and can be resumed
    onClose();
  };

  const handleRestart = () => {
    reset();
    // Will auto-start via the useEffect
  };

  const handleComplete = () => {
    if (executionResult) {
      onComplete?.(executionResult.tripId);
    }
    reset();
    onClose();
  };

  // Render different phases
  const renderContent = () => {
    if (phase === 'generating_plan') {
      return (
        <View style={styles.executingContainer}>
          <LinearGradient colors={[...gradients.ocean]} style={styles.executingGradient}>
            <AiPlanningAnimation />
            {progressStep && (
              <Text style={styles.executingStep}>{PROGRESS_LABELS[progressStep]}</Text>
            )}
          </LinearGradient>
        </View>
      );
    }

    if (phase === 'previewing_plan' && plan) {
      return (
        <AiPlanPreview
          plan={plan}
          currency={initialContext.currency || 'CHF'}
          onConfirm={confirmPlan}
          onReject={hidePreview}
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
                  <Text style={styles.completedStat}>{executionResult.activitiesCreated} Aktivitäten</Text>
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

    // Chat view (conversing or plan_review)
    const isPlanReview = phase === 'plan_review';

    const handleAdjustSend = () => {
      if (!inputText.trim()) return;
      adjustPlan(inputText);
      setInputText('');
      setAdjustMode(false);
    };

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
      >
        {/* Context-disabled warning */}
        {mode === 'enhance' && !profile?.ai_trip_context_enabled && (
          <View style={styles.contextWarningBanner}>
            <Text style={styles.contextWarningText}>
              Hinweis: Daten-Lesen ist deaktiviert. Fable kann bestehende Aktivitaeten nicht sehen und koennte Duplikate vorschlagen. Aktiviere es in den Profil-Einstellungen.
            </Text>
          </View>
        )}

        {/* Restored conversation hint */}
        {restored && (
          <View style={styles.restoredBanner}>
            <Text style={styles.restoredText}>Gespräch fortgesetzt</Text>
          </View>
        )}

        {/* Conflict dialog */}
        {conflicts.length > 0 && (
          <View style={styles.conflictBanner}>
            <Text style={styles.conflictTitle}>Folgende Aktivitaeten existieren bereits:</Text>
            {conflicts.slice(0, 5).map((c, i) => (
              <Text key={i} style={styles.conflictItem}>- {c}</Text>
            ))}
            {conflicts.length > 5 && (
              <Text style={styles.conflictItem}>... und {conflicts.length - 5} weitere</Text>
            )}
            <Text style={styles.conflictHint}>Duplikate werden automatisch uebersprungen.</Text>
            <View style={styles.conflictActions}>
              <TouchableOpacity style={styles.conflictBtn} onPress={dismissConflicts}>
                <Text style={styles.conflictBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.conflictBtn, styles.conflictBtnPrimary]} onPress={confirmWithConflicts}>
                <Text style={[styles.conflictBtnText, { color: '#FFFFFF' }]}>Trotzdem uebernehmen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
              </Text>
            </View>
          ))}

          {sending && (
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          {error && (
            error.includes('Inspirationen') ? (
              <View style={styles.creditBanner}>
                {creditPurchased ? (
                  <Text style={styles.creditSuccess}>Inspirationen erhalten! Du kannst jetzt weitermachen.</Text>
                ) : (
                  <>
                    <Text style={styles.creditText}>{error}</Text>
                    <TouchableOpacity onPress={() => {
                      if (Platform.OS === 'web') {
                        setShowBuyModal(true);
                      } else {
                        onClose();
                        navigation.navigate('Subscription');
                      }
                    }}>
                      <Text style={styles.creditAction}>Inspirationen kaufen</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => sendMessage('Weiter')}>
                  <Text style={styles.errorRetry}>Erneut versuchen</Text>
                </TouchableOpacity>
              </View>
            )
          )}

          {tokenWarning && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>Die Konversation wird lang. Du kannst jetzt den Plan erstellen lassen.</Text>
            </View>
          )}
        </ScrollView>

        {/* Plan review action buttons */}
        {isPlanReview && !adjustMode && (
          <View style={styles.planReviewActions}>
            <TouchableOpacity style={styles.planReviewBtn} onPress={showPreview} activeOpacity={0.7}>
              <Text style={styles.planReviewBtnText}>{'📋 Details anzeigen'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.planReviewBtnPrimary} onPress={() => confirmPlan()} activeOpacity={0.7}>
              <LinearGradient
                colors={[...gradients.ocean]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.planReviewBtnGradient}
              >
                <Text style={styles.planReviewBtnPrimaryText}>{'✅ Übernehmen'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.planReviewBtn} onPress={() => setAdjustMode(true)} activeOpacity={0.7}>
              <Text style={styles.planReviewBtnText}>{'✏️ Anpassen'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Suggestion chips (conversing only) */}
        {!isPlanReview && metadata?.suggested_questions && metadata.suggested_questions.length > 0 && !sending && (
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

        {/* Generate plan button (conversing only) */}
        {!isPlanReview && metadata?.ready_to_plan && !sending && (
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

        {/* Input (conversing or adjust mode) */}
        {(!isPlanReview || adjustMode) && (
          <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={adjustMode ? 'Was soll angepasst werden...' : 'Nachricht eingeben...'}
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={1000}
              editable={!sending}
              onSubmitEditing={adjustMode ? handleAdjustSend : handleSend}
              blurOnSubmit={false}
              onKeyPress={(e: any) => {
                if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault();
                  adjustMode ? handleAdjustSend() : handleSend();
                }
              }}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
              onPress={adjustMode ? handleAdjustSend : handleSend}
              disabled={!inputText.trim() || sending}
            >
              <Text style={styles.sendButtonText}>{'➤'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  };

  // Show "Neu starten" button only in conversing/plan_review
  const showRestartButton = phase === 'conversing' || phase === 'plan_review';

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
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>
                {'✨ Fable'}
              </Text>
              {creditsBalance !== null && (
                <Text style={styles.creditsLabel}>{creditsBalance} Inspirationen</Text>
              )}
            </View>
            {showRestartButton ? (
              <TouchableOpacity onPress={handleRestart} style={styles.closeButton}>
                <Text style={styles.restartText}>{'↺'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.closeButton} />
            )}
          </View>
        )}

        {renderContent()}

        <BuyInspirationenModal
          visible={showBuyModal}
          onClose={() => setShowBuyModal(false)}
          userId={userId}
          email={authUser?.email || ''}
          onPurchaseDetected={() => setCreditPurchased(true)}
        />
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
  restartText: { fontSize: 22, color: colors.textSecondary },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.h3, textAlign: 'center' },
  creditsLabel: { ...typography.caption, color: colors.textLight, marginTop: 2 },

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

  // Credit hint (friendly, not error)
  creditBanner: {
    backgroundColor: colors.secondary + '12',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
  },
  creditText: { ...typography.bodySmall, color: colors.textSecondary },
  creditAction: { ...typography.bodySmall, color: colors.secondary, fontWeight: '600', marginTop: spacing.xs },
  creditSuccess: { ...typography.bodySmall, color: colors.success, fontWeight: '600' },

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

  // Restored conversation hint
  restoredBanner: {
    backgroundColor: colors.secondary + '12',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  restoredText: { ...typography.caption, color: colors.secondary },

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

  // Plan review actions
  planReviewActions: {
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  planReviewBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  planReviewBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  planReviewBtnPrimary: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  planReviewBtnGradient: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  planReviewBtnPrimaryText: { ...typography.bodySmall, fontWeight: '600', color: '#FFFFFF' },

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

  // Context warning
  contextWarningBanner: {
    backgroundColor: '#FFFBF0',
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  contextWarningText: { ...typography.bodySmall, color: colors.textSecondary },

  // Conflict dialog
  conflictBanner: {
    backgroundColor: '#FFF5F5',
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  conflictTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  conflictItem: { ...typography.bodySmall, color: colors.textSecondary },
  conflictHint: { ...typography.caption, color: colors.textLight, marginTop: spacing.sm },
  conflictActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  conflictBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  conflictBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  conflictBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
});
