import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, TripBottomNav } from '../../components/common';
import { AiTripModal } from '../../components/ai/AiTripModal';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { ScopeToggle } from '../../components/budget/ScopeToggle';
import { BudgetOverviewCard } from '../../components/budget/BudgetOverviewCard';
import { BudgetCategoryCard } from '../../components/budget/BudgetCategoryCard';
import { ExpenseItem } from '../../components/budget/ExpenseItem';
import { AddCategoryModal } from '../../components/budget/AddCategoryModal';
import { AddExpenseModal } from '../../components/budget/AddExpenseModal';
import { EditExpenseModal } from '../../components/budget/EditExpenseModal';
import { useBudget } from '../../hooks/useBudget';
import { useAuthContext } from '../../contexts/AuthContext';
import { getTrip } from '../../api/trips';
import { getCollaborators, CollaboratorWithProfile } from '../../api/invitations';
import { Trip, Expense, BudgetCategory } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { BudgetSkeleton } from '../../components/skeletons/BudgetSkeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'Budget'>;

type TabType = 'budget' | 'expenses';

export const BudgetScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user } = useAuthContext();
  const { isFeatureAllowed } = useSubscription();
  const [showAiModal, setShowAiModal] = useState(false);
  const [scope, setScope] = useState<'group' | 'personal'>('group');
  const [tab, setTab] = useState<TabType>('budget');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorWithProfile[]>([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);

  const {
    categories, expenses, loading, total, totalBudget, byCategory,
    addCategory, updateCategory, removeCategory,
    addExpense, updateExpense, removeExpense, upgradeExpenseToGroup,
  } = useBudget(tripId, scope);

  const currency = trip?.currency || 'CHF';

  // Fetch trip + collaborators
  useEffect(() => {
    (async () => {
      try {
        const [t, c] = await Promise.all([getTrip(tripId), getCollaborators(tripId)]);
        setTrip(t);
        setCollaborators(c);
      } catch (e) {
        console.error('Trip/Collab fetch error:', e);
      }
    })();
  }, [tripId]);

  const handleAddCategory = useCallback(async (name: string, color: string, limit: number | null) => {
    try {
      await addCategory(name, color, limit ?? undefined);
    } catch {
      Alert.alert('Fehler', 'Kategorie konnte nicht erstellt werden');
    }
  }, [addCategory]);

  const handleEditCategory = useCallback(async (id: string, name: string, color: string, limit: number | null) => {
    try {
      await updateCategory(id, { name, color, budget_limit: limit });
      setEditingCategory(null);
    } catch {
      Alert.alert('Fehler', 'Kategorie konnte nicht aktualisiert werden');
    }
  }, [updateCategory]);

  const handleDeleteCategory = useCallback((id: string, name: string) => {
    Alert.alert('Kategorie löschen', `"${name}" wirklich löschen? Zugeordnete Ausgaben bleiben erhalten.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => removeCategory(id) },
    ]);
  }, [removeCategory]);

  const handleAddExpense = useCallback(async (data: {
    amount: number; description: string; category_id: string; date: string;
    paid_by: string | null; split_with: string[];
  }) => {
    try {
      await addExpense({
        trip_id: tripId,
        category_id: data.category_id,
        description: data.description,
        amount: data.amount,
        currency,
        date: data.date,
        paid_by: data.paid_by,
        split_with: data.split_with,
      });
    } catch {
      Alert.alert('Fehler', 'Ausgabe konnte nicht erstellt werden');
    }
  }, [addExpense, tripId, currency]);

  const handleUpdateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
    try {
      await updateExpense(id, updates);
    } catch {
      Alert.alert('Fehler', 'Ausgabe konnte nicht aktualisiert werden');
    }
  }, [updateExpense]);

  const handleDeleteExpense = useCallback((id: string) => {
    Alert.alert('Löschen', 'Ausgabe wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => removeExpense(id) },
    ]);
  }, [removeExpense]);

  const handleUpgradeToGroup = useCallback(async (id: string, paidBy: string, splitWith: string[]) => {
    try {
      await upgradeExpenseToGroup(id, paidBy, splitWith);
    } catch {
      Alert.alert('Fehler', 'Ausgabe konnte nicht geteilt werden');
    }
  }, [upgradeExpenseToGroup]);

  return (
    <View style={styles.container}>
      <Header
        title="Budget & Ausgaben"
        onBack={() => navigation.replace('TripDetail', { tripId })}
        rightAction={
          isFeatureAllowed('ai') ? (
            <TouchableOpacity onPress={() => setShowAiModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 22 }}>✨</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading && !trip ? (
        <BudgetSkeleton />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Scope Toggle */}
          <ScopeToggle scope={scope} onChange={setScope} />

          {/* Tab Bar */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, tab === 'budget' && styles.tabActive]}
              onPress={() => setTab('budget')}
            >
              <Text style={[styles.tabText, tab === 'budget' && styles.tabTextActive]}>Budget</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'expenses' && styles.tabActive]}
              onPress={() => setTab('expenses')}
            >
              <Text style={[styles.tabText, tab === 'expenses' && styles.tabTextActive]}>Ausgaben</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <BudgetSkeleton />
          ) : tab === 'budget' ? (
            /* ===== BUDGET TAB ===== */
            <>
              <BudgetOverviewCard
                totalBudget={totalBudget}
                totalSpent={total}
                currency={currency}
              />

              {byCategory.map(cat => (
                <BudgetCategoryCard
                  key={cat.id}
                  name={cat.name}
                  color={cat.color}
                  spent={cat.spent}
                  budgetLimit={cat.budget_limit}
                  currency={currency}
                  onEdit={() => setEditingCategory(cat)}
                  onDelete={() => handleDeleteCategory(cat.id, cat.name)}
                />
              ))}

              {byCategory.length === 0 && (
                <Text style={styles.emptyText}>Noch keine Kategorien erstellt</Text>
              )}

              <TouchableOpacity style={styles.addCatButton} onPress={() => setShowAddCategory(true)} activeOpacity={0.7}>
                <Text style={styles.addCatText}>+ Kategorie hinzufügen</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ===== EXPENSES TAB ===== */
            <>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>Noch keine Ausgaben erfasst</Text>
              ) : (
                expenses.map(exp => (
                  <ExpenseItem
                    key={exp.id}
                    expense={exp}
                    currency={currency}
                    showPaidBy={scope === 'group'}
                    collaborators={collaborators}
                    onPress={() => setEditingExpense(exp)}
                    onLongPress={() => handleDeleteExpense(exp.id)}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => tab === 'budget' ? setShowAddCategory(true) : setShowAddExpense(true)}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[colors.sunny, '#FFA502']}
          style={styles.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Modals */}
      <AddCategoryModal
        visible={showAddCategory}
        onClose={() => setShowAddCategory(false)}
        onSave={handleAddCategory}
        currency={currency}
      />

      {editingCategory && (
        <AddCategoryModal
          visible={!!editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={(name, color, limit) => handleEditCategory(editingCategory.id, name, color, limit)}
          currency={currency}
          title="Kategorie bearbeiten"
          initialName={editingCategory.name}
          initialColor={editingCategory.color}
          initialLimit={editingCategory.budget_limit}
        />
      )}

      <AddExpenseModal
        visible={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        onSave={handleAddExpense}
        categories={categories}
        collaborators={collaborators}
        currentUserId={user?.id || ''}
        currency={currency}
        scope={scope}
      />

      <EditExpenseModal
        visible={!!editingExpense}
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
        onSave={handleUpdateExpense}
        onDelete={handleDeleteExpense}
        onUpgradeToGroup={scope === 'personal' ? handleUpgradeToGroup : undefined}
        categories={categories}
        collaborators={collaborators}
        currentUserId={user?.id || ''}
        currency={currency}
        scope={scope}
      />

      {showAiModal && user && (
        <AiTripModal
          visible={showAiModal}
          onClose={() => setShowAiModal(false)}
          mode="enhance"
          tripId={tripId}
          userId={user.id}
        />
      )}

      <TripBottomNav tripId={tripId} activeTab="Budget" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 140 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  addCatButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginTop: spacing.sm,
  },
  addCatText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  fab: { position: 'absolute', right: spacing.xl, bottom: 56 + spacing.md, width: 56, height: 56 },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
});
