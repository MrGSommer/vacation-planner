import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/common';
import { useAuth } from '../../hooks/useAuth';
import {
  createSupportConversation,
  updateSupportConversation,
  sendSupportMessage,
  parseSupportConversation,
} from '../../api/support';
import { submitFeedback } from '../../api/feedback';
import { useToast } from '../../contexts/ToastContext';
import { SupportMessage } from '../../types/database';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportChat'>;

const QUICK_CHIPS = [
  { label: 'Wie funktioniert...?', value: 'Wie funktioniert eine bestimmte Funktion in WayFable?' },
  { label: 'Problem melden', value: 'Ich habe ein Problem mit der App.' },
  { label: 'Fable & Inspirationen', value: 'Wie funktionieren Fable und Inspirationen?' },
  { label: 'Abo & Preise', value: 'Was kostet WayFable und was ist in Premium enthalten?' },
];

const GREETING: SupportMessage = {
  role: 'assistant',
  content: 'Hallo! Ich bin Echo, dein WayFable-Support. Wie kann ich dir helfen?',
  timestamp: new Date().toISOString(),
};

export const SupportChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const flatListRef = useRef<FlatList>(null);
  const initialQuestionSent = useRef(false);
  const initialQuestion = route.params?.initialQuestion;

  const [messages, setMessages] = useState<SupportMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  // Create conversation on first user message
  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    try {
      const conv = await createSupportConversation();
      setConversationId(conv.id);
      return conv.id;
    } catch (e) {
      console.error('Failed to create support conversation:', e);
      return null;
    }
  }, [conversationId]);

  // Save conversation on unmount
  useEffect(() => {
    return () => {
      if (conversationId && messages.length > 1) {
        updateSupportConversation(conversationId, {
          messages: messages,
          status: resolved ? 'resolved' : 'active',
          resolved_by: resolved ? 'bot' : undefined,
        }).catch(() => {});
        parseSupportConversation(conversationId, messages);
      }
    };
  }, [conversationId, messages, resolved]);

  // Auto-send initial question from FeedbackScreen
  useEffect(() => {
    if (initialQuestion && !initialQuestionSent.current) {
      initialQuestionSent.current = true;
      const timer = setTimeout(() => handleSend(initialQuestion), 300);
      return () => clearTimeout(timer);
    }
  }, [initialQuestion]);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    setInput('');
    const userMsg: SupportMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setMessageCount(c => c + 1);
    setLoading(true);

    try {
      await ensureConversation();

      // Build messages array for the API (exclude greeting)
      const apiMessages = [...messages.filter(m => m !== GREETING), userMsg]
        .map(m => ({ role: m.role, content: m.content }));

      const response = await sendSupportMessage(apiMessages);

      const botMsg: SupportMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
        meta: { resolved: response.resolved, category: response.category },
      };

      setMessages(prev => [...prev, botMsg]);

      if (response.resolved) {
        setResolved(true);
        setShowSatisfaction(true);
      }
    } catch {
      const errorMsg: SupportMessage = {
        role: 'assistant',
        content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es nochmal oder sende uns direkt Feedback.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, ensureConversation]);

  const handleSatisfaction = useCallback(async (satisfied: boolean) => {
    setShowSatisfaction(false);
    if (satisfied) {
      if (conversationId) {
        updateSupportConversation(conversationId, { status: 'resolved', resolved_by: 'user' }).catch(() => {});
      }
      const thankMsg: SupportMessage = {
        role: 'assistant',
        content: 'Freut mich, dass ich helfen konnte! Falls du weitere Fragen hast, bin ich jederzeit hier.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, thankMsg]);
    } else {
      setResolved(false);
      const continueMsg: SupportMessage = {
        role: 'assistant',
        content: 'Tut mir leid, dass das nicht geholfen hat. Möchtest du mir mehr Details geben, oder direkt Feedback an das Team senden?',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, continueMsg]);
    }
  }, [conversationId]);

  const handleFeedback = useCallback(async () => {
    if (conversationId) {
      updateSupportConversation(conversationId, { status: 'escalated', resolved_by: 'feedback' }).catch(() => {});
    }
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    const prefillDesc = userMessages.length > 0
      ? `Aus Support-Chat:\n${userMessages.join('\n')}`
      : '';

    try {
      await submitFeedback({
        type: 'question',
        title: userMessages[0] || 'Frage',
        description: prefillDesc,
        supportConversationId: conversationId || undefined,
      });
      showToast('Deine Frage wurde eingereicht — wir melden uns!', 'success');
    } catch {
      showToast('Frage konnte nicht eingereicht werden', 'error');
    }

    navigation.navigate('FeedbackModal');
  }, [conversationId, messages, navigation, showToast]);

  const renderMessage = useCallback(({ item }: { item: SupportMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.botBubble]}>
        <Text style={[styles.messageText, isUser && styles.userText]}>{item.content}</Text>
      </View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <Header
        title="Echo — Support"
        onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Profile' } as any)}
      />

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          messages.length <= 1 ? (
            <View style={styles.chipsContainer}>
              <Text style={styles.chipsTitle}>Häufige Themen:</Text>
              <View style={styles.chipsRow}>
                {QUICK_CHIPS.map(chip => (
                  <TouchableOpacity
                    key={chip.label}
                    style={styles.chip}
                    onPress={() => handleSend(chip.value)}
                    disabled={loading}
                  >
                    <Text style={styles.chipText}>{chip.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null
        }
        ListFooterComponent={
          <>
            {loading && (
              <View style={[styles.messageBubble, styles.botBubble, styles.loadingBubble]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Tippt...</Text>
              </View>
            )}
            {showSatisfaction && (
              <View style={styles.satisfactionContainer}>
                <Text style={styles.satisfactionText}>Hat das geholfen?</Text>
                <View style={styles.satisfactionRow}>
                  <TouchableOpacity style={[styles.satisfactionBtn, styles.satisfactionYes]} onPress={() => handleSatisfaction(true)}>
                    <Text style={styles.satisfactionBtnText}>Ja</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.satisfactionBtn, styles.satisfactionNo]} onPress={() => handleSatisfaction(false)}>
                    <Text style={styles.satisfactionBtnText}>Nein</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        }
      />

      {/* Feedback button (visible after 2+ messages or if unresolved) */}
      {messageCount >= 2 && (
        <TouchableOpacity style={styles.feedbackBar} onPress={handleFeedback}>
          <Text style={styles.feedbackBarText}>Frage einreichen</Text>
          <Text style={styles.feedbackBarArrow}>{'>'}</Text>
        </TouchableOpacity>
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          style={styles.input}
          placeholder="Stelle eine Frage..."
          placeholderTextColor={colors.textLight}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
          multiline
          maxLength={1000}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={() => handleSend()}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendBtnText}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  chatContent: { padding: spacing.md, paddingBottom: spacing.xl },
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
    borderBottomRightRadius: borderRadius.xs,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderBottomLeftRadius: borderRadius.xs,
    ...shadows.sm,
  },
  messageText: { ...typography.body, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  loadingBubble: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loadingText: { ...typography.bodySmall, color: colors.textLight },

  chipsContainer: { marginBottom: spacing.lg },
  chipsTitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  chipText: { ...typography.bodySmall, fontWeight: '500', color: colors.text },

  satisfactionContainer: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  satisfactionText: { ...typography.body, fontWeight: '600', marginBottom: spacing.sm },
  satisfactionRow: { flexDirection: 'row', gap: spacing.sm },
  satisfactionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  satisfactionYes: { backgroundColor: colors.success },
  satisfactionNo: { backgroundColor: colors.error },
  satisfactionBtnText: { ...typography.body, color: '#FFFFFF', fontWeight: '600' },

  feedbackBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent + '15',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  feedbackBarText: { ...typography.bodySmall, color: colors.accent, fontWeight: '600' },
  feedbackBarArrow: { fontSize: 14, color: colors.accent, fontWeight: '700' },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: { fontSize: 18, color: '#FFFFFF', fontWeight: '700' },
});
