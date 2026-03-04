import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal } from 'react-native';
import { PollWithVotes, vote, closePoll, createPoll } from '../../api/polls';
import { useAuthContext } from '../../contexts/AuthContext';
import { Card } from './Card';
import { Button } from './Button';
import { Icon } from '../../utils/icons';
import { colors, spacing, borderRadius, typography, iconSize } from '../../utils/theme';

interface PollCardProps {
  poll: PollWithVotes;
  onUpdate: () => void;
}

export const PollCard: React.FC<PollCardProps> = ({ poll, onUpdate }) => {
  const { user } = useAuthContext();
  const myVote = poll.votes.find(v => v.user_id === user?.id);
  const totalVotes = poll.votes.length;

  const handleVote = async (index: number) => {
    if (!user || poll.is_closed) return;
    await vote(poll.id, user.id, index);
    onUpdate();
  };

  const handleClose = async () => {
    await closePoll(poll.id);
    onUpdate();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Icon name="bar-chart-outline" size={iconSize.sm} color={colors.secondary} />
        <Text style={styles.question}>{poll.question}</Text>
        {poll.is_closed && <Text style={styles.closedBadge}>Beendet</Text>}
      </View>

      {poll.options.map((option, i) => {
        const count = poll.votes.filter(v => v.option_index === i).length;
        const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
        const isMyVote = myVote?.option_index === i;

        return (
          <TouchableOpacity
            key={i}
            style={[styles.option, isMyVote && styles.optionSelected]}
            onPress={() => handleVote(i)}
            disabled={poll.is_closed}
            activeOpacity={0.7}
          >
            <View style={[styles.optionFill, { width: `${pct}%` }]} />
            <Text style={[styles.optionText, isMyVote && styles.optionTextSelected]}>{option}</Text>
            {totalVotes > 0 && (
              <Text style={styles.optionPct}>{Math.round(pct)}%</Text>
            )}
          </TouchableOpacity>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.votesCount}>{totalVotes} {totalVotes === 1 ? 'Stimme' : 'Stimmen'}</Text>
        {!poll.is_closed && poll.created_by === user?.id && (
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.closeBtn}>Beenden</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

// Create Poll Modal
interface CreatePollModalProps {
  visible: boolean;
  tripId: string;
  onClose: () => void;
  onCreated: () => void;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({ visible, tripId, onClose, onCreated }) => {
  const { user } = useAuthContext();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [creating, setCreating] = useState(false);

  const addOption = () => {
    if (options.length < 6) setOptions(prev => [...prev, '']);
  };

  const updateOption = (index: number, value: string) => {
    setOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!user || !question.trim() || creating) return;
    const validOptions = options.filter(o => o.trim());
    if (validOptions.length < 2) return;

    setCreating(true);
    try {
      await createPoll(tripId, user.id, question.trim(), validOptions);
      setQuestion('');
      setOptions(['', '']);
      onCreated();
      onClose();
    } catch {}
    setCreating(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Neue Abstimmung</Text>

          <Text style={styles.label}>Frage</Text>
          <TextInput
            style={styles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="z.B. Museum oder Strand?"
            placeholderTextColor={colors.textLight}
            maxLength={200}
          />

          <Text style={styles.label}>Optionen</Text>
          {options.map((opt, i) => (
            <View key={i} style={styles.optionInputRow}>
              <TextInput
                style={[styles.input, styles.optionInput]}
                value={opt}
                onChangeText={(v) => updateOption(i, v)}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.textLight}
                maxLength={100}
              />
              {options.length > 2 && (
                <TouchableOpacity onPress={() => removeOption(i)}>
                  <Icon name="close-circle-outline" size={iconSize.sm} color={colors.textLight} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {options.length < 6 && (
            <TouchableOpacity style={styles.addOptionBtn} onPress={addOption}>
              <Icon name="add-outline" size={iconSize.sm} color={colors.secondary} />
              <Text style={styles.addOptionText}>Option hinzufügen</Text>
            </TouchableOpacity>
          )}

          <View style={styles.modalActions}>
            <Button title="Abbrechen" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title="Erstellen"
              onPress={handleCreate}
              loading={creating}
              disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  question: { ...typography.body, fontWeight: '600', flex: 1 },
  closedBadge: { ...typography.caption, color: colors.textLight, fontStyle: 'italic' },
  option: {
    position: 'relative', overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  optionSelected: { borderColor: colors.secondary, backgroundColor: colors.secondary + '08' },
  optionFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: colors.secondary + '15', borderRadius: borderRadius.md,
  },
  optionText: { ...typography.bodySmall, color: colors.text, zIndex: 1 },
  optionTextSelected: { fontWeight: '600', color: colors.secondary },
  optionPct: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', zIndex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  votesCount: { ...typography.caption, color: colors.textLight },
  closeBtn: { ...typography.caption, color: colors.secondary, fontWeight: '500' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.lg },
  modalTitle: { ...typography.h3, marginBottom: spacing.md },
  label: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    ...typography.body, color: colors.text,
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  optionInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionInput: { flex: 1 },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  addOptionText: { ...typography.bodySmall, color: colors.secondary },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
