import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, AppState, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAiPlanner, AiPhase, ConflictResolution, FormWidget } from '../../hooks/useAiPlanner';
import { AiPlanningAnimation } from './AiPlanningAnimation';
import { AiPlanPreview } from './AiPlanPreview';
import { ChatFormWidget } from './ChatFormWidget';
import { BuyInspirationenModal } from '../common/BuyInspirationenModal';
import { UpgradePrompt } from '../common/UpgradePrompt';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { linkifyText, openExternalUrl } from '../../utils/linkify';
import { ProgressStep } from '../../services/ai/planExecutor';

function renderMarkdownLinks(text: string, keyPrefix: string): React.ReactNode[] {
  // Handle markdown links [text](url)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = mdLinkRegex.exec(text)) !== null) {
    // Add text before link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add clickable link
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <Text
        key={`${keyPrefix}_link_${idx++}`}
        style={{ color: colors.primary, textDecorationLine: 'underline' }}
        onPress={() => openExternalUrl(linkUrl)}
        accessibilityRole="link"
      >
        {linkText}
      </Text>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function renderMarkdown(text: string): React.ReactNode {
  // Split on bold markers first
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      // Check for markdown links within bold text
      if (inner.includes('](')) {
        return <Text key={i} style={{ fontWeight: '700' }}>{renderMarkdownLinks(inner, `b${i}`)}</Text>;
      }
      return <Text key={i} style={{ fontWeight: '700' }}>{linkifyText(inner)}</Text>;
    }
    // Handle markdown links in regular text
    if (part.includes('](')) {
      return <React.Fragment key={i}>{renderMarkdownLinks(part, `p${i}`)}</React.Fragment>;
    }
    // Linkify plain text segments
    return <React.Fragment key={i}>{linkifyText(part)}</React.Fragment>;
  });
}

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: 'create' | 'enhance';
  tripId?: string;
  userId: string;
  initialContext?: {
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
  /** Auto-send this message after conversation starts (e.g. from "Fable vorschlagen lassen") */
  autoMessage?: string;
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
  visible, onClose, mode, tripId, userId, initialContext = {}, onComplete, autoMessage,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user: authUser, profile } = useAuth();
  const { updateCreditsBalance, refreshProfile } = useAuthContext();
  const { isPremium } = useSubscription();
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const {
    phase, messages, metadata, plan, structure, error, sending,
    progressStep, executionResult, tokenWarning, conflicts,
    restored, creditsBalance,
    contextReady, webSearching, typingUsers, lockUserName, fableDisabled,
    startConversation, sendMessage, generatePlan,
    generateStructure, checkConflictsAndGenerate, conflictInfo, resolveConflicts,
    confirmPlan, rejectPlan, showPreview, hidePreview, adjustPlan,
    dismissConflicts, confirmWithConflicts, retryLastAction, reset, saveConversationNow,
    generatePackingList, generateBudgetCategories, generateDayPlan,
    broadcastTyping,
  } = useAiPlanner({ mode, tripId, userId, initialContext, initialCredits: profile?.ai_credits_balance, onCreditsUpdate: updateCreditsBalance });
  const [adjustMode, setAdjustMode] = useState(false);
  const [pendingAction, setPendingAction] = useState<'packing_list' | 'budget_categories' | 'day_plan' | null>(null);
  const [creditPurchased, setCreditPurchased] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [localConflictResolution, setLocalConflictResolution] = useState<ConflictResolution>('merge');
  const [localKeepAccommodations, setLocalKeepAccommodations] = useState(true);
  const shownSuggestionsRef = useRef<Set<string>>(new Set());
  const autoMessageSentRef = useRef(false);

  // Can the user send messages? Premium or has credits
  const canSendMessages = isPremium || (creditsBalance !== null && creditsBalance > 0);

  // Refresh profile (credits) when modal opens, then auto-start conversation
  useEffect(() => {
    if (visible && phase === 'idle' && contextReady) {
      autoMessageSentRef.current = false;
      refreshProfile().then(() => startConversation(canSendMessages));
    }
    if (visible) { setCreditPurchased(false); setShowBuyModal(false); }
  }, [visible, phase, contextReady]);

  // Auto-send message after conversation starts (e.g. "Erstelle eine Packliste")
  useEffect(() => {
    if (autoMessage && visible && phase === 'conversing' && !sending && !autoMessageSentRef.current && messages.length > 0 && canSendMessages) {
      autoMessageSentRef.current = true;
      // Small delay to let the greeting render first
      const timer = setTimeout(() => sendMessage(autoMessage), 600);
      return () => clearTimeout(timer);
    }
  }, [autoMessage, visible, phase, sending, messages.length, canSendMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, sending]);

  // Save conversation state when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        saveConversationNow();
      }
    });
    return () => sub.remove();
  }, [saveConversationNow]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    broadcastTyping(false);
    sendMessage(inputText);
    setInputText('');
  };

  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    if (text.trim().length > 0) broadcastTyping(true);
    else broadcastTyping(false);
  }, [broadcastTyping]);

  const handleChipPress = (text: string) => {
    sendMessage(text);
  };

  const handleClose = () => {
    // Don't reset — conversation is persisted and can be resumed
    refreshProfile(); // fire-and-forget, final DB sync
    onClose();
  };

  const handleRestart = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Bist du sicher? Alle Nachrichten und Erinnerungen für diese Reise werden gelöscht.');
      if (confirmed) reset();
    } else {
      Alert.alert(
        'Gespräch neu starten',
        'Bist du sicher? Alle Nachrichten und Erinnerungen für diese Reise werden gelöscht.',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Neu starten', style: 'destructive', onPress: () => reset() },
        ],
      );
    }
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
    if (phase === 'generating_structure') {
      return (
        <View style={styles.executingContainer}>
          <AiPlanningAnimation />
        </View>
      );
    }

    if (phase === 'structure_overview' && structure) {
      const stopNames = (structure.stops || []).map(s => s.name);
      const dayCount = structure.days?.length || 0;

      return (
        <View style={styles.structureOverview}>
          <ScrollView contentContainerStyle={styles.structureContent}>
            <Text style={styles.structureTitle}>Route</Text>
            <View style={styles.routeList}>
              {stopNames.map((name, i) => (
                <View key={i} style={styles.routeItem}>
                  <View style={styles.routeDot} />
                  <Text style={styles.routeText}>{name}</Text>
                  {i < stopNames.length - 1 && <View style={styles.routeLine} />}
                </View>
              ))}
            </View>

            <Text style={styles.structureStats}>
              {dayCount} Tage, {structure.stops?.length || 0} Stops, {structure.budget_categories?.length || 0} Budget-Kategorien
            </Text>

            <View style={styles.granularityButtons}>
              <TouchableOpacity style={styles.granularityBtn} onPress={checkConflictsAndGenerate} activeOpacity={0.8}>
                <LinearGradient
                  colors={[...gradients.ocean]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.granularityBtnGradient}
                >
                  <Text style={styles.granularityBtnTextPrimary}>
                    Plan erstellen
                  </Text>
                  <Text style={styles.granularityBtnHint}>Fable erstellt deinen Plan Tag für Tag</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.granularityHintText}>
                Du kannst das Modal schliessen — der Fortschritt wird oben angezeigt.
              </Text>
            </View>
          </ScrollView>
        </View>
      );
    }

    if (phase === 'conflict_review' && conflictInfo) {
      return (
        <View style={styles.structureOverview}>
          <ScrollView contentContainerStyle={styles.structureContent}>
            <Text style={styles.structureTitle}>Bestehende Aktivitäten</Text>
            <Text style={[styles.structureStats, { marginBottom: spacing.md }]}>
              {conflictInfo.daysWithActivities.length} Tage haben bereits Aktivitäten:
            </Text>
            {conflictInfo.daysWithActivities.map((d, i) => (
              <View key={i} style={styles.conflictRow}>
                <Text style={styles.conflictDate}>{d.date}</Text>
                <Text style={styles.conflictCount}>{d.activityCount} Aktivitäten</Text>
              </View>
            ))}

            <Text style={[styles.structureTitle, { marginTop: spacing.lg }]}>Was soll Fable tun?</Text>

            {(['merge', 'overwrite', 'skip'] as ConflictResolution[]).map((option) => {
              const labels: Record<ConflictResolution, { title: string; hint: string }> = {
                merge: { title: 'Ergänzen', hint: 'Bestehende beibehalten, neue hinzufügen' },
                overwrite: { title: 'Überschreiben', hint: 'Alle bestehenden ersetzen' },
                skip: { title: 'Überspringen', hint: 'Diese Tage nicht generieren' },
              };
              const isSelected = localConflictResolution === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.conflictOption, isSelected && styles.conflictOptionSelected]}
                  onPress={() => setLocalConflictResolution(option)}
                  activeOpacity={0.7}
                >
                  <Icon name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={20} color={isSelected ? colors.primary : colors.textLight} />
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[styles.conflictOptionTitle, isSelected && { color: colors.primary }]}>{labels[option].title}</Text>
                    <Text style={styles.conflictOptionHint}>{labels[option].hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.conflictOption, { marginTop: spacing.sm }]}
              onPress={() => setLocalKeepAccommodations(!localKeepAccommodations)}
              activeOpacity={0.7}
            >
              <Icon name={localKeepAccommodations ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
              <Text style={[styles.conflictOptionTitle, { marginLeft: spacing.sm }]}>Unterkünfte beibehalten</Text>
            </TouchableOpacity>

            <View style={[styles.granularityButtons, { marginTop: spacing.lg }]}>
              <TouchableOpacity
                style={styles.granularityBtn}
                onPress={() => resolveConflicts(localConflictResolution, localKeepAccommodations)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[...gradients.ocean]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.granularityBtnGradient}
                >
                  <Text style={styles.granularityBtnTextPrimary}>Plan erstellen</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      );
    }

    if (phase === 'generating_plan') {
      return (
        <View style={styles.executingContainer}>
          <AiPlanningAnimation />
          <Text style={styles.backgroundHint}>
            Fable erstellt deinen Plan Tag für Tag.{'\n'}Du kannst dieses Fenster schliessen.
          </Text>
        </View>
      );
    }

    if (phase === 'previewing_plan' && plan) {
      return (
        <AiPlanPreview
          plan={plan}
          currency={plan.trip?.currency || initialContext?.currency || 'CHF'}
          onConfirm={(filteredPlan) => confirmPlan(false, filteredPlan)}
          onReject={hidePreview}
          loading={sending}
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
            <Icon name="happy-outline" size={48} color="#FFFFFF" />
            <Text style={styles.completedTitle}>Reiseplan erstellt!</Text>
            {executionResult && (
              <View style={styles.completedStats}>
                {executionResult.daysCreated > 0 && (
                  <Text style={styles.completedStat}>{executionResult.daysCreated} Tage</Text>
                )}
                {executionResult.activitiesCreated > 0 && (
                  <Text style={styles.completedStat}>{executionResult.activitiesCreated} Aktivitäten</Text>
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

    // Full-screen Fable pitch when user has no Inspirationen
    if (!canSendMessages && (phase === 'conversing' || phase === 'idle')) {
      const handleBuyPress = () => {
        onClose();
        navigation.navigate('Subscription');
      };

      const handleBuyInspirations = () => {
        if (Platform.OS === 'web') {
          setShowBuyModal(true);
        } else {
          onClose();
          navigation.navigate('Subscription');
        }
      };

      return (
        // Free user — full feature showcase + buy option
        <UpgradePrompt
          iconName="sparkles"
          title="Dein KI-Reisebegleiter"
          message="Fable plant deine Reise, erstellt Packlisten, schlägt Budget-Kategorien vor und vieles mehr."
          heroGradient={gradients.sunset}
          secondaryLabel="Inspirationen kaufen"
          onSecondaryPress={handleBuyInspirations}
          highlights={[
            { icon: 'map-outline', text: 'Komplette Reisepläne', detail: 'Fable erstellt Tag-für-Tag Pläne mit Aktivitäten' },
            { icon: 'chatbubbles-outline', text: 'Persönliche Beratung', detail: 'Frage Fable nach Tipps, Restaurants & Geheimtipps' },
            { icon: 'list-outline', text: 'Packlisten & Budget', detail: 'Automatische Packlisten und Budget-Vorschläge' },
            { icon: 'calendar-outline', text: 'Tagesplanung', detail: 'Optimiere einzelne Tage mit lokalen Empfehlungen' },
          ]}
        />
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
        {/* Fable disabled banner */}
        {fableDisabled && (
          <View style={styles.fableDisabledBanner}>
            <Text style={styles.fableDisabledText}>Fable ist für diese Reise deaktiviert.</Text>
            {tripId && (
              <TouchableOpacity onPress={() => { onClose(); navigation.navigate('FableTripSettings', { tripId }); }}>
                <Text style={styles.fableDisabledAction}>Zu den Einstellungen</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Context-disabled warning */}
        {mode === 'enhance' && !profile?.ai_trip_context_enabled && (
          <View style={styles.contextWarningBanner}>
            <Text style={styles.contextWarningText}>
              Hinweis: Daten-Lesen ist deaktiviert. Fable kann bestehende Aktivitäten nicht sehen und könnte Duplikate vorschlagen. Aktiviere es in den Profil-Einstellungen.
            </Text>
          </View>
        )}

        {/* Restored conversation hint */}
        {restored && (
          <View style={styles.restoredBanner}>
            <Text style={styles.restoredText}>Gespräch fortgesetzt</Text>
          </View>
        )}

        {/* Processing lock banner */}
        {lockUserName && (
          <View style={styles.lockBanner}>
            <ActivityIndicator size="small" color={colors.secondary} />
            <Text style={styles.lockText}>
              Fable bearbeitet eine Anfrage von {lockUserName}...
            </Text>
          </View>
        )}

        {/* Conflict dialog */}
        {conflicts.length > 0 && (
          <View style={styles.conflictBanner}>
            <Text style={styles.conflictTitle}>Folgende Aktivitäten existieren bereits:</Text>
            {conflicts.slice(0, 5).map((c, i) => (
              <Text key={i} style={styles.conflictItem}>- {c}</Text>
            ))}
            {conflicts.length > 5 && (
              <Text style={styles.conflictItem}>... und {conflicts.length - 5} weitere</Text>
            )}
            <Text style={styles.conflictHint}>Duplikate werden automatisch übersprungen.</Text>
            <View style={styles.conflictActions}>
              <TouchableOpacity style={styles.conflictBtn} onPress={dismissConflicts}>
                <Text style={styles.conflictBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.conflictBtn, styles.conflictBtnPrimary]} onPress={confirmWithConflicts}>
                <Text style={[styles.conflictBtnText, { color: '#FFFFFF' }]}>Trotzdem übernehmen</Text>
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
          {messages.map((msg) => {
            const isOwnMessage = msg.role === 'user' && msg.senderId === userId;
            const isOtherUser = msg.role === 'user' && !isOwnMessage;
            return (
              <View key={msg.id}>
                {msg.senderName && (
                  <Text style={[
                    styles.senderName,
                    msg.role === 'user'
                      ? (isOwnMessage ? styles.senderNameRight : styles.senderNameLeft)
                      : styles.senderNameLeft,
                  ]}>
                    {msg.senderName}
                  </Text>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    isOwnMessage ? styles.userBubble
                      : isOtherUser ? styles.otherUserBubble
                      : styles.aiBubble,
                  ]}
                >
                  <Text style={[
                    styles.messageText,
                    isOwnMessage ? styles.userText
                      : isOtherUser ? styles.otherUserText
                      : styles.aiText,
                  ]}>
                    {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                  </Text>
                </View>
                {!isPremium && msg.role === 'assistant' && msg.creditsAfter !== undefined && (
                  <View style={styles.creditIndicator}>
                    <Text style={styles.creditIndicatorText}>
                      {msg.creditsCost !== undefined && msg.creditsCost > 0
                        ? `-${msg.creditsCost} · `
                        : ''}
                      {msg.creditsAfter} Inspirationen
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          {sending && !webSearching && (
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          {webSearching && (
            <View style={[styles.messageBubble, styles.aiBubble, styles.searchBubble]}>
              <ActivityIndicator size="small" color={colors.secondary} />
              <Text style={[styles.messageText, styles.aiText, { marginLeft: spacing.sm }]}>
                Suche im Web...
              </Text>
            </View>
          )}

          {typingUsers.length > 0 && (
            <View style={styles.typingIndicator}>
              <Text style={styles.typingText}>
                {typingUsers.join(', ')} tippt...
              </Text>
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
                <TouchableOpacity onPress={retryLastAction}>
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
          <View>
            <View style={styles.planReviewActions}>
              <TouchableOpacity style={styles.planReviewBtn} onPress={showPreview} activeOpacity={0.7}>
                <Icon name="list-outline" size={14} color={colors.primary} />
                <Text style={styles.planReviewBtnText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.planReviewBtnPrimary, sending && { opacity: 0.5 }]} onPress={() => confirmPlan()} disabled={sending} activeOpacity={0.7}>
                <LinearGradient
                  colors={[...gradients.ocean]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.planReviewBtnGradient}
                >
                  <Icon name="checkmark-circle-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.planReviewBtnPrimaryText}>Übernehmen</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.planReviewBtn} onPress={() => setAdjustMode(true)} activeOpacity={0.7}>
                <Icon name="create-outline" size={14} color={colors.primary} />
                <Text style={styles.planReviewBtnText}>Anpassen</Text>
              </TouchableOpacity>
            </View>
            {/* Day-specific refinement chips */}
            {plan && plan.days?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayAdjustRow} contentContainerStyle={styles.dayAdjustContent}>
                {plan.days.map((day, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.dayAdjustChip}
                    onPress={() => {
                      setAdjustMode(true);
                      setInputText(`Ändere Tag ${i + 1} (${day.date}): `);
                    }}
                    activeOpacity={0.7}
                  >
                    <Icon name="refresh-outline" size={12} color={colors.secondary} />
                    <Text style={styles.dayAdjustChipText}>Tag {i + 1}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Agent action button (enhance mode only) — triggers confirmation */}
        {!isPlanReview && metadata?.agent_action && tripId && !sending && !pendingAction && (
          <TouchableOpacity
            style={styles.agentActionButton}
            onPress={() => setPendingAction(metadata.agent_action!)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[...gradients.ocean]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.agentActionGradient}
            >
              <Text style={styles.agentActionText}>
                {metadata.agent_action === 'packing_list' ? 'Packliste erstellen' :
                 metadata.agent_action === 'budget_categories' ? 'Budget erstellen' :
                 'Tagesplan erstellen'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Confirmation dialog for agent actions */}
        {pendingAction && !sending && (
          <View style={styles.confirmationContainer}>
            <View style={[styles.messageBubble, styles.aiBubble, { maxWidth: '100%' }]}>
              <Text style={[styles.messageText, styles.aiText]}>
                {pendingAction === 'packing_list' ? 'Soll ich die Packliste jetzt erstellen?' :
                 pendingAction === 'budget_categories' ? 'Soll ich die Budget-Kategorien jetzt erstellen?' :
                 'Soll ich den Tagesplan jetzt erstellen?'}
              </Text>
            </View>
            <View style={styles.confirmationActions}>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={() => {
                  const action = pendingAction;
                  setPendingAction(null);
                  if (action === 'packing_list') generatePackingList();
                  else if (action === 'budget_categories') generateBudgetCategories();
                  else if (action === 'day_plan') generateDayPlan();
                }}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[...gradients.ocean]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmBtnGradient}
                >
                  <Text style={styles.confirmBtnTextPrimary}>Ja</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtnSecondary}
                onPress={() => setPendingAction(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmBtnText}>Nein</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtnSecondary}
                onPress={() => {
                  setPendingAction(null);
                  // Focus the input — just clearing pendingAction reveals it
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmBtnText}>Frage stellen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Form options (structured choices — widget or legacy buttons) */}
        {!isPlanReview && metadata?.form_options && !sending && (() => {
          const fo = metadata.form_options;
          // New FormWidget (has 'type' property)
          if (fo && 'type' in fo) {
            const widget = fo as FormWidget;
            return (
              <ChatFormWidget
                widget={widget}
                onSubmit={(text) => {
                  handleChipPress(text);
                  // Clear form_options immediately after submission
                }}
              />
            );
          }
          // Legacy: plain array of {label}
          if (Array.isArray(fo) && fo.length > 0) {
            return (
              <ChatFormWidget
                widget={{ type: 'single_select', options: fo.map(o => ({ label: o.label })) }}
                onSubmit={(text) => {
                  handleChipPress(text);
                }}
              />
            );
          }
          return null;
        })()}

        {/* Conversation starters (shown when chat just started, no suggestions yet) */}
        {!isPlanReview && !sending && phase === 'conversing' && messages.length <= 2 && !metadata?.suggested_questions?.length && !metadata?.form_options && (
          <View style={styles.startersContainer}>
            {(mode === 'create' ? [
              'Erstelle einen Reiseplan für mich',
              'Ich brauche Inspiration — wohin soll es gehen?',
              'Plane einen Wochenendtrip',
              'Ich reise mit der Familie',
            ] : [
              'Erstelle einen Tagesplan',
              'Was kann man dort unternehmen?',
              'Plane Aktivitäten für den nächsten freien Tag',
              'Schlage Restaurants in der Nähe vor',
            ]).map((starter, i) => (
              <TouchableOpacity
                key={i}
                style={styles.starterChip}
                onPress={() => handleChipPress(starter)}
                activeOpacity={0.7}
              >
                <Icon name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                <Text style={styles.starterChipText}>{starter}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Suggestion chips (conversing only — horizontal) */}
        {!isPlanReview && !metadata?.form_options && metadata?.suggested_questions && metadata.suggested_questions.length > 0 && !sending && (() => {
          // Filter out empty/invalid suggestions and already-shown ones to prevent loops
          const validSuggestions = metadata.suggested_questions.filter(q => typeof q === 'string' && q.trim());
          if (validSuggestions.length === 0) return null;
          const newSuggestions = validSuggestions.filter(q => !shownSuggestionsRef.current.has(q));
          // If all filtered out, show current ones (AI generated fresh set)
          const displaySuggestions = newSuggestions.length > 0 ? newSuggestions : validSuggestions;
          // Track shown suggestions
          displaySuggestions.forEach(q => shownSuggestionsRef.current.add(q));
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsContainer}
              contentContainerStyle={styles.chipsContent}
            >
              {displaySuggestions.map((q, i) => (
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
          );
        })()}

        {/* Generate plan button (conversing only) */}
        {!isPlanReview && metadata?.ready_to_plan && !sending && !metadata?.agent_action && (
          <TouchableOpacity style={styles.generateButton} onPress={generatePlan} activeOpacity={0.8}>
            <LinearGradient
              colors={[...gradients.ocean]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.generateButtonGradient}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="sparkles-outline" size={18} color="#FFFFFF" /><Text style={styles.generateButtonText}>{mode === 'enhance' ? 'Reise planen' : 'Plan erstellen'}</Text></View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Input (conversing or adjust mode) */}
        {(!isPlanReview || adjustMode) && !fableDisabled && (
          <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={handleInputChange}
              placeholder={!canSendMessages ? 'Kaufe Inspirationen um mitzuschreiben' : adjustMode ? 'Was soll angepasst werden...' : isPremium ? 'Frag Fable...' : 'Nachricht eingeben...'}
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={1000}
              editable={!sending && canSendMessages}
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
              style={[styles.sendButton, (!inputText.trim() || sending || !canSendMessages) && styles.sendButtonDisabled]}
              onPress={adjustMode ? handleAdjustSend : handleSend}
              disabled={!inputText.trim() || sending || !canSendMessages}
            >
              <Text style={styles.sendButtonText}>{'➤'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  };

  // Show "Neu starten" button only in conversing/plan_review/structure_overview
  const showRestartButton = phase === 'conversing' || phase === 'plan_review' || phase === 'structure_overview' || phase === 'conflict_review';

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
              <Icon name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="sparkles-outline" size={18} color={colors.secondary} />
                <Text style={styles.headerTitle}>Fable</Text>
              </View>
              {!isPremium && creditsBalance !== null && (
                <Text style={styles.creditsLabel}>{creditsBalance} Inspirationen</Text>
              )}
            </View>
            <View style={styles.headerRight}>
              {tripId && (
                <TouchableOpacity onPress={() => { navigation.setParams({ openFable: true } as any); onClose(); navigation.navigate('FableTripSettings' as any, { tripId }); }} style={styles.closeButton}>
                  <Icon name="settings-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              {showRestartButton ? (
                <TouchableOpacity onPress={handleRestart} style={styles.closeButton}>
                  <Icon name="refresh-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.closeButton} />
              )}
            </View>
          </View>
        )}

        {renderContent()}

        <BuyInspirationenModal
          visible={showBuyModal}
          onClose={() => { setShowBuyModal(false); refreshProfile(); }}
          userId={userId}
          email={authUser?.email || ''}
          onPurchaseDetected={() => { setCreditPurchased(true); refreshProfile(); }}
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
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.h3, textAlign: 'center' },
  creditsLabel: { ...typography.caption, color: colors.secondary, marginTop: 2, fontWeight: '600' },

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
    backgroundColor: colors.secondary + '12',
    borderBottomLeftRadius: spacing.xs,
  },
  messageText: { ...typography.body, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  otherUserBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderBottomLeftRadius: spacing.xs,
    ...shadows.sm,
  },
  otherUserText: { color: colors.text },
  aiText: { color: colors.text },
  senderName: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 2,
    marginHorizontal: spacing.xs,
  },
  senderNameRight: { alignSelf: 'flex-end', color: colors.textLight },
  senderNameLeft: { alignSelf: 'flex-start', color: colors.textSecondary },

  // Credit indicator per message
  creditIndicator: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  creditIndicatorText: {
    ...typography.caption,
    color: colors.textLight,
    fontSize: 11,
  },

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

  // Lock banner
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.secondary + '12',
    gap: spacing.sm,
  },
  lockText: { ...typography.bodySmall, color: colors.secondary, flex: 1 },

  // Web search bubble
  searchBubble: { flexDirection: 'row', alignItems: 'center' },

  // Typing indicator
  typingIndicator: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  typingText: { ...typography.caption, color: colors.textLight, fontStyle: 'italic' },

  // Starters
  startersContainer: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  starterChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.primary + '30',
    backgroundColor: colors.primary + '08',
  },
  starterChipText: { ...typography.bodySmall, color: colors.primary, fontWeight: '500' },

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
  chipText: { ...typography.bodySmall, color: colors.text },

  // Form options (vertical buttons for structured choices)
  formOptionsContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  formOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    backgroundColor: colors.card,
    alignItems: 'center' as const,
  },
  formOptionText: {
    ...typography.body,
    fontWeight: '600' as const,
    color: colors.secondary,
  },

  // Confirmation dialog
  confirmationContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  confirmationActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  confirmBtnGradient: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  confirmBtnTextPrimary: { ...typography.bodySmall, fontWeight: '600', color: '#FFFFFF' },
  confirmBtnSecondary: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },

  // Agent action button
  agentActionButton: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  agentActionGradient: {
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  agentActionText: { ...typography.button, color: '#FFFFFF', fontSize: 14 },

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
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: borderRadius.md,
  },
  planReviewBtnPrimaryText: { ...typography.bodySmall, fontWeight: '600', color: '#FFFFFF' },
  dayAdjustRow: { maxHeight: 40, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  dayAdjustContent: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs },
  dayAdjustChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.full, backgroundColor: colors.secondary + '15',
    borderWidth: 1, borderColor: colors.secondary + '30',
  },
  dayAdjustChipText: { ...typography.caption, color: colors.secondary, fontWeight: '600' },

  // Structure overview
  structureOverview: { flex: 1 },
  structureContent: { padding: spacing.lg },
  structureTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  routeList: { marginBottom: spacing.lg },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.secondary,
    marginRight: spacing.sm,
  },
  routeText: { ...typography.body, color: colors.text, flex: 1 },
  routeLine: {
    position: 'absolute',
    left: 4,
    top: 28,
    width: 2,
    height: 16,
    backgroundColor: colors.border,
  },
  structureStats: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  structureEstimate: { ...typography.bodySmall, color: colors.textLight, marginBottom: spacing.lg },
  granularityButtons: { gap: spacing.sm },
  granularityBtn: { borderRadius: borderRadius.lg, overflow: 'hidden' },
  granularityBtnGradient: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
  },
  granularityBtnTextPrimary: { ...typography.button, color: '#FFFFFF' },
  granularityBtnHint: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  granularityHintText: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  conflictRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  conflictDate: {
    ...typography.bodySmall,
    color: colors.text,
  },
  conflictCount: {
    ...typography.caption,
    color: colors.textLight,
  },
  conflictOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  conflictOptionSelected: {
    backgroundColor: `${colors.primary}10`,
  },
  conflictOptionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  conflictOptionHint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 1,
  },
  backgroundHint: {
    ...typography.bodySmall,
    color: colors.textLight,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

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
  fableDisabledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.border + '30',
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
  },
  fableDisabledText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  fableDisabledAction: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, marginLeft: spacing.sm },

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
