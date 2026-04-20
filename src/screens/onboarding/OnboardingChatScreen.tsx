import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
import { useAuthContext } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { updateProfile, activateFreeTrial } from '../../api/auth';
import { supabase } from '../../api/supabase';
import { colors, spacing, borderRadius, typography, shadows, gradients } from '../../utils/theme';
import { Icon, MISC_ICONS } from '../../utils/icons';
import { linkifyText, openExternalUrl } from '../../utils/linkify';
import { RootStackParamList } from '../../types/navigation';
import { logError } from '../../services/errorLogger';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'> };

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// --- Markdown rendering (same pattern as AiTripModal) ---

function renderMarkdownLinks(text: string, keyPrefix: string): React.ReactNode[] {
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = mdLinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <Text
        key={`${keyPrefix}_link_${idx++}`}
        style={{ color: colors.primary, textDecorationLine: 'underline' }}
        onPress={() => openExternalUrl(linkUrl)}
      >
        {linkText}
      </Text>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      if (inner.includes('](')) {
        return <Text key={i} style={{ fontWeight: '700' }}>{renderMarkdownLinks(inner, `b${i}`)}</Text>;
      }
      return <Text key={i} style={{ fontWeight: '700' }}>{linkifyText(inner)}</Text>;
    }
    if (part.includes('](')) {
      return <React.Fragment key={i}>{renderMarkdownLinks(part, `p${i}`)}</React.Fragment>;
    }
    return <React.Fragment key={i}>{linkifyText(part)}</React.Fragment>;
  });
}

// --- Strip internal tags from displayed content ---

function stripInternalTags(content: string): string {
  return content
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
    .replace(/<memory_add>[\s\S]*?<\/memory_add>/g, '')
    .replace(/<memory_conflict[^>]*>[\s\S]*?<\/memory_conflict>/g, '')
    .replace(/<profile_update>[\s\S]*?<\/profile_update>/g, '')
    .trim();
}

// --- Parse metadata from response ---

function parseMetadata(content: string): { onboarding_complete?: boolean; suggested_questions?: string[] } {
  const match = content.match(/<metadata>([\s\S]*?)<\/metadata>/);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    logError(e, { component: 'OnboardingChatScreen', context: { action: 'parseMetadata' } });
    return {};
  }
}

// --- Parse memory tags ---

function parseMemoryTags(content: string): string[] {
  const tags: string[] = [];
  const regex = /<memory_add>([\s\S]*?)<\/memory_add>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1].trim());
  }
  return tags;
}

export const OnboardingChatScreen: React.FC<Props> = ({ navigation }) => {
  const { user, profile } = useAuth();
  const { refreshProfile } = useAuthContext();
  const { isTrialing, hasHadTrial } = useSubscription();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isFromProfile, setIsFromProfile] = useState(false);
  const [trialActivated, setTrialActivated] = useState(false);
  const [trialDeclined, setTrialDeclined] = useState(false);
  const [activatingTrial, setActivatingTrial] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const msgIdRef = useRef(0);
  const conversationRef = useRef<{ role: string; content: string }[]>([]);
  // Track all memories locally to avoid stale profile reads and duplicates
  const memoriesRef = useRef<string[]>([]);

  // Detect if user came from profile (dismissed before)
  useEffect(() => {
    if (profile?.onboarding_dismissed) {
      setIsFromProfile(true);
    }
  }, [profile?.onboarding_dismissed]);

  // Auto-start: send initial greeting (runs once)
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current && user) {
      startedRef.current = true;
      sendToFable([]);
    }
  }, [user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, sending]);

  const sendToFable = async (currentMessages: { role: string; content: string }[]) => {
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ogwccvzyhljxwtcbjbsd.supabase.co';

      const res = await fetch(
        `${supabaseUrl}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            task: 'onboarding',
            messages: currentMessages.length === 0
              ? [{ role: 'user', content: 'Hallo!' }]
              : currentMessages,
            context: { userName },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Fable ist gerade nicht erreichbar');
      }

      const data = await res.json();
      const content = data.content || '';

      // Parse metadata
      const meta = parseMetadata(content);
      if (meta.suggested_questions?.length) {
        setSuggestedQuestions(meta.suggested_questions);
      }

      // Parse memory tags, deduplicate, and save to ai_custom_instruction
      const newMemories = parseMemoryTags(content);
      if (newMemories.length > 0 && profile) {
        // Deduplicate: only add memories not already tracked
        const existingSet = new Set(memoriesRef.current.map(m => m.toLowerCase()));
        const unique = newMemories.filter(m => !existingSet.has(m.toLowerCase()));
        if (unique.length > 0) {
          memoriesRef.current.push(...unique);
          // Build full instruction from base + all accumulated memories
          const baseInstruction = profile.ai_custom_instruction || '';
          const memoryLines = memoriesRef.current.map(m => `- ${m}`).join('\n');
          const newInstruction = baseInstruction
            ? `${baseInstruction}\n${memoryLines}`
            : memoryLines;
          updateProfile(profile.id, { ai_custom_instruction: newInstruction })
            .then(() => refreshProfile())
            .catch((e) => console.error('Failed to save memory:', e));
        }
      }

      // Strip internal tags for display
      const displayContent = stripInternalTags(content);

      const aiMsg: ChatMessage = {
        id: `msg-${++msgIdRef.current}`,
        role: 'assistant',
        content: displayContent,
      };
      setMessages(prev => [...prev, aiMsg]);
      // Store stripped content to avoid sending internal tags back to Claude (saves tokens)
      conversationRef.current.push({ role: 'assistant', content: displayContent });

      // Check if onboarding is complete
      if (meta.onboarding_complete) {
        setCompleted(true);
        // Ensure profile is refreshed (edge function sets onboarding_completed)
        setTimeout(() => refreshProfile(), 1000);
      }
    } catch (e: any) {
      logError(e, { component: 'OnboardingChatScreen', context: { action: 'sendMessage' } });
      const errorMsg: ChatMessage = {
        id: `msg-${++msgIdRef.current}`,
        role: 'assistant',
        content: e.message || 'Etwas ist schiefgelaufen. Versuche es nochmal.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleSend = (text?: string) => {
    const msgText = (text || inputText).trim();
    if (!msgText || sending) return;

    const userMsg: ChatMessage = {
      id: `msg-${++msgIdRef.current}`,
      role: 'user',
      content: msgText,
    };
    setMessages(prev => [...prev, userMsg]);
    setSuggestedQuestions([]);
    setInputText('');

    conversationRef.current.push({ role: 'user', content: msgText });
    sendToFable([...conversationRef.current]);
  };

  const handleSkip = async () => {
    if (!profile) return;

    if (isFromProfile) {
      // Second skip: set onboarding_completed = true, button disappears
      await updateProfile(profile.id, { onboarding_completed: true });
    } else {
      // First skip: set onboarding_dismissed = true, no auto-redirect
      await updateProfile(profile.id, { onboarding_dismissed: true });
    }
    await refreshProfile();
    navigation.goBack();
  };

  const handleComplete = async () => {
    if (profile && !profile.onboarding_completed) {
      await updateProfile(profile.id, { onboarding_completed: true } as any).catch(() => {});
      await refreshProfile();
    }
  };

  const handleActivateTrial = async () => {
    setActivatingTrial(true);
    try {
      const result = await activateFreeTrial();
      if (result.success) {
        setTrialActivated(true);
        await refreshProfile();
      } else {
        // Already had trial — skip to CTAs
        setTrialDeclined(true);
      }
    } catch (e) {
      logError(e, { component: 'OnboardingChatScreen', context: { action: 'handleActivateTrial' } });
      console.error('Trial activation failed:', e);
      setTrialDeclined(true);
    } finally {
      setActivatingTrial(false);
    }
  };

  const handleGoToCreateTrip = async () => {
    await handleComplete();
    navigation.replace('CreateTrip');
  };

  const handleGoToHome = async () => {
    await handleComplete();
    navigation.goBack();
  };

  // Show CTAs phase when trial decision is made or user already has trial
  const showTrialOffer = completed && !isTrialing && !hasHadTrial && !trialActivated && !trialDeclined;
  const showCTAs = completed && (isTrialing || hasHadTrial || trialActivated || trialDeclined);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.fableAvatar}>
            <Icon name={MISC_ICONS.sparkles} size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.headerTitle}>Fable kennenlernen</Text>
        </View>
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skipText}>Überspringen</Text>
        </TouchableOpacity>
      </View>

      {/* Chat area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {messages.map((msg) => (
            <View key={msg.id}>
              <View
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
            </View>
          ))}

          {sending && (
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </ScrollView>

        {/* Trial offer card */}
        {showTrialOffer && (
          <View style={styles.completedCard}>
            <View style={styles.trialCard}>
              <LinearGradient
                colors={['#4ECDC4', '#6C5CE7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.trialCardGradient}
              >
                <Icon name="sparkles" size={24} color="#FFFFFF" />
                <Text style={styles.trialTitle}>Premium 14 Tage kostenlos</Text>
                <View style={styles.trialFeatures}>
                  <Text style={styles.trialFeature}>✓ Unbegrenzte Reisen & Mitreisende</Text>
                  <Text style={styles.trialFeature}>✓ Fable — dein KI-Reisebegleiter</Text>
                  <Text style={styles.trialFeature}>✓ Stops, Fotos & alle Features</Text>
                </View>
                <Text style={styles.trialDisclaimer}>
                  Danach automatisch Free-Plan — keine Zahlungsdaten nötig
                </Text>
                <TouchableOpacity
                  style={styles.trialButton}
                  onPress={handleActivateTrial}
                  activeOpacity={0.8}
                  disabled={activatingTrial}
                >
                  {activatingTrial
                    ? <ActivityIndicator size="small" color="#4ECDC4" />
                    : <Text style={styles.trialButtonText}>Premium 14 Tage testen</Text>
                  }
                </TouchableOpacity>
              </LinearGradient>
            </View>
            <TouchableOpacity onPress={() => setTrialDeclined(true)} style={styles.skipTrialLink}>
              <Text style={styles.skipTrialText}>Nein danke, weiter ohne Premium</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* CTA buttons after trial decision */}
        {showCTAs && (
          <View style={styles.completedCard}>
            {trialActivated && (
              <View style={styles.trialSuccessBanner}>
                <Icon name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.trialSuccessText}>Premium-Trial aktiviert — 14 Tage kostenlos!</Text>
              </View>
            )}
            <TouchableOpacity style={styles.completedButton} onPress={handleGoToCreateTrip} activeOpacity={0.8}>
              <LinearGradient
                colors={[...gradients.ocean]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.completedButtonGradient}
              >
                <Icon name="airplane-outline" size={20} color="#FFFFFF" />
                <Text style={styles.completedButtonText}>Erste Reise planen</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGoToHome} style={styles.secondaryLink}>
              <Text style={styles.secondaryLinkText}>Zu meinen Reisen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Suggestion chips */}
        {suggestedQuestions.length > 0 && !sending && !completed && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
            {suggestedQuestions.map((q, i) => (
              <TouchableOpacity
                key={i}
                style={styles.chip}
                onPress={() => handleSend(q)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input */}
        {!completed && (
          <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Deine Antwort..."
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={500}
              editable={!sending}
              onSubmitEditing={() => handleSend()}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.7}
            >
              <Icon name="send" size={20} color={!inputText.trim() || sending ? colors.textLight : colors.primary} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fableAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.h3 },
  skipText: { ...typography.bodySmall, color: colors.textSecondary },
  chatContainer: { flex: 1 },
  messageList: { flex: 1 },
  messageListContent: { padding: spacing.md, paddingBottom: spacing.xl },
  messageBubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: borderRadius.sm,
  },
  aiBubble: {
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: borderRadius.sm,
    ...shadows.sm,
  },
  messageText: { ...typography.body, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  aiText: { color: colors.text },
  completedCard: { padding: spacing.md },
  completedButton: { borderRadius: borderRadius.lg, overflow: 'hidden' },
  completedButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
  },
  completedButtonText: { ...typography.body, color: '#FFFFFF', fontWeight: '700' },
  trialCard: { borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.md },
  trialCardGradient: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  trialTitle: {
    ...typography.h3,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  trialFeatures: { gap: spacing.xs, alignSelf: 'stretch', paddingVertical: spacing.sm },
  trialFeature: {
    ...typography.body,
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
  },
  trialDisclaimer: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  trialButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  trialButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: '#6C5CE7',
  },
  skipTrialLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  skipTrialText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  trialSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#E8F8F5',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  trialSuccessText: {
    ...typography.bodySmall,
    color: colors.success,
    fontWeight: '600',
    flex: 1,
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  secondaryLinkText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  chipsRow: { maxHeight: 50, flexGrow: 0 },
  chipsContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.sm },
  chip: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipText: { ...typography.bodySmall, color: colors.primary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxHeight: 100,
    color: colors.text,
  },
  sendBtn: { padding: spacing.sm + 2 },
  sendBtnDisabled: { opacity: 0.5 },
});
