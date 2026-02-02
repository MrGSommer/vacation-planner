import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, FlatList } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Card, Input, Button, EmptyState, TripBottomNav } from '../../components/common';
import { useBudget } from '../../hooks/useBudget';
import { RootStackParamList } from '../../types/navigation';
import { BUDGET_CATEGORIES } from '../../utils/constants';
import { formatDate } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { BudgetSkeleton } from '../../components/skeletons/BudgetSkeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'Budget'>;

export const BudgetScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { expenses, total, byCategory, loading, addExpense, removeExpense, categories } = useBudget(tripId);
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const handleAdd = async () => {
    if (!amount || !description.trim() || !selectedCategory) return;
    try {
      await addExpense({
        trip_id: tripId,
        category_id: selectedCategory,
        description: description.trim(),
        amount: parseFloat(amount),
        currency: 'CHF',
        date: new Date().toISOString().split('T')[0],
      });
      setShowModal(false);
      setAmount('');
      setDescription('');
      setSelectedCategory('');
    } catch {
      Alert.alert('Fehler', 'Ausgabe konnte nicht erstellt werden');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Löschen', 'Ausgabe wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => removeExpense(id) },
    ]);
  };

  const maxCategoryTotal = Math.max(...byCategory.map(c => c.total), 1);

  return (
    <View style={styles.container}>
      <Header title="Budget" onBack={() => navigation.goBack()} />
      {loading ? (
        <BudgetSkeleton />
      ) : (
      <ScrollView contentContainerStyle={styles.content}>
        {/* Total */}
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Gesamtausgaben</Text>
          <Text style={styles.totalAmount}>CHF {total.toFixed(2)}</Text>
        </Card>

        {/* Category Bars */}
        <Card style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Nach Kategorie</Text>
          {byCategory.map(cat => (
            <View key={cat.id} style={styles.barRow}>
              <Text style={styles.barLabel}>{cat.name}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(cat.total / maxCategoryTotal) * 100}%`, backgroundColor: cat.color }]} />
              </View>
              <Text style={styles.barAmount}>CHF {cat.total.toFixed(0)}</Text>
            </View>
          ))}
        </Card>

        {/* Expense List */}
        <Text style={styles.sectionTitle}>Ausgaben</Text>
        {expenses.length === 0 ? (
          <Text style={styles.emptyText}>Noch keine Ausgaben erfasst</Text>
        ) : (
          expenses.map(exp => (
            <TouchableOpacity key={exp.id} onLongPress={() => handleDelete(exp.id)}>
              <Card style={styles.expenseCard}>
                <View style={styles.expenseRow}>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseDesc}>{exp.description}</Text>
                    <Text style={styles.expenseDate}>{formatDate(exp.date)}</Text>
                  </View>
                  <Text style={styles.expenseAmount}>CHF {exp.amount.toFixed(2)}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)} activeOpacity={0.8}>
        <LinearGradient colors={[colors.sunny, '#FFA502']} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Add Expense Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ausgabe erfassen</Text>
            <Input label="Betrag (CHF)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Input label="Beschreibung" placeholder="z.B. Abendessen" value={description} onChangeText={setDescription} />
            <Text style={styles.fieldLabel}>Kategorie</Text>
            <View style={styles.catRow}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, selectedCategory === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Text style={[styles.catText, selectedCategory === cat.id && { color: '#fff' }]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => setShowModal(false)} variant="ghost" style={styles.modalBtn} />
              <Button title="Speichern" onPress={handleAdd} disabled={!amount || !description || !selectedCategory} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

      <TripBottomNav tripId={tripId} activeTab="Budget" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  totalCard: { alignItems: 'center', marginBottom: spacing.md },
  totalLabel: { ...typography.bodySmall, color: colors.textSecondary },
  totalAmount: { ...typography.h1, color: colors.primary, marginTop: spacing.xs },
  chartCard: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  barLabel: { ...typography.caption, width: 90 },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, marginHorizontal: spacing.sm },
  barFill: { height: 8, borderRadius: 4 },
  barAmount: { ...typography.caption, width: 70, textAlign: 'right' },
  expenseCard: { marginBottom: spacing.sm },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expenseInfo: { flex: 1 },
  expenseDesc: { ...typography.body },
  expenseDate: { ...typography.caption, marginTop: 2 },
  expenseAmount: { ...typography.body, fontWeight: '700', color: colors.primary },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xl },
  fab: { position: 'absolute', right: spacing.xl, bottom: 56 + spacing.md, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border },
  catText: { ...typography.caption, fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },
});
