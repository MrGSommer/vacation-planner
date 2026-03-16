import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Platform, Modal, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, TripBottomNav } from '../../components/common';
import { UpgradePrompt } from '../../components/common/UpgradePrompt';
import { SneakPeekOverlay } from '../../components/common/SneakPeekOverlay';
import { AiTripModal } from '../../components/ai/AiTripModal';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { ReceiptScanModal } from '../../components/budget/ReceiptScanModal';
import { ReceiptCard } from '../../components/budget/ReceiptCard';
import { useReceipts } from '../../hooks/useReceipts';
import { Receipt } from '../../types/database';
import { BudgetOverviewCard } from '../../components/budget/BudgetOverviewCard';
import { ExpenseSummaryCard } from '../../components/budget/ExpenseSummaryCard';
import { BudgetCategoryCard } from '../../components/budget/BudgetCategoryCard';
import { ExpenseItem } from '../../components/budget/ExpenseItem';
import { AddCategoryModal } from '../../components/budget/AddCategoryModal';
import { AddExpenseModal } from '../../components/budget/AddExpenseModal';
import { EditExpenseModal } from '../../components/budget/EditExpenseModal';
import { useBudget } from '../../hooks/useBudget';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getTrip } from '../../api/trips';
import { getCollaborators, CollaboratorWithProfile } from '../../api/invitations';
import { Trip, Expense, BudgetCategory } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { colors, spacing, borderRadius, typography, shadows, iconSize } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { Settlement } from '../../utils/splitCalculator';
import { BudgetSkeleton } from '../../components/skeletons/BudgetSkeleton';
import { SwipeableRow } from '../../components/common/SwipeableRow';
import { usePresence } from '../../hooks/usePresence';

type Props = NativeStackScreenProps<RootStackParamList, 'Budget'>;

type TabType = 'budget' | 'expenses';

export const BudgetScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { user } = useAuthContext();
  const { isFeatureAllowed, isSneakPeek, isPremium } = useSubscription();
  const { showToast } = useToast();
  usePresence(tripId, 'Budget');
  const [showAiModal, setShowAiModal] = useState(false);
  const [tab, setTab] = useState<TabType>('expenses');
  const [showPrivateOnly, setShowPrivateOnly] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorWithProfile[]>([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const [personalLimitCategory, setPersonalLimitCategory] = useState<BudgetCategory | null>(null);
  const [personalLimitValue, setPersonalLimitValue] = useState('');

  const {
    categories, expenses, loading, total, totalBudget, byCategory,
    addCategory, updateCategory, removeCategory,
    setPersonalLimit, removePersonalLimit,
    addExpense, updateExpense, removeExpense, refresh,
  } = useBudget(tripId);

  const {
    receipts, addReceipt, updateReceipt: updateReceiptHook,
    removeReceipt, completeReceipt, reopenReceipt,
  } = useReceipts(tripId);

  const currency = trip?.currency || 'CHF';

  const filteredExpenses = showPrivateOnly
    ? expenses.filter(e => e.scope === 'personal')
    : expenses;

  // Receipts are always group — hide when private filter is on
  const filteredReceipts = showPrivateOnly ? [] : receipts;

  const groupExpenses = expenses.filter(e => e.scope === 'group');

  // Filtered totals for budget tab (respect private filter)
  const filteredTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const filteredByCategory = React.useMemo(() => {
    const catIds = new Set(categories.map(c => c.id));
    const result = categories.map(cat => ({
      ...cat,
      spent: filteredExpenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0),
    }));
    const uncategorizedSpent = filteredExpenses
      .filter(e => !e.category_id || !catIds.has(e.category_id))
      .reduce((sum, e) => sum + e.amount, 0);
    if (uncategorizedSpent > 0) {
      result.push({
        id: '__uncategorized__',
        trip_id: tripId,
        name: 'Unkategorisiert',
        color: '#9E9E9E',
        budget_limit: null,
        scope: 'group' as const,
        user_id: null,
        created_at: '',
        spent: uncategorizedSpent,
      });
    }
    return result;
  }, [categories, filteredExpenses, tripId]);

  // Reopen Fable modal when returning from FableTripSettings
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if ((route.params as any)?.openFable) {
        setShowAiModal(true);
        navigation.setParams({ openFable: undefined } as any);
      }
    });
    return unsubscribe;
  }, [navigation, route.params]);

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

  const handleAddCategory = useCallback(async (name: string, color: string, limit: number | null, scope: 'group' | 'personal') => {
    try {
      await addCategory(name, color, limit ?? undefined, scope);
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
    if (Platform.OS === 'web') {
      if (window.confirm(`"${name}" wirklich löschen? Zugeordnete Ausgaben bleiben erhalten.`)) {
        removeCategory(id);
      }
    } else {
      Alert.alert('Kategorie löschen', `"${name}" wirklich löschen? Zugeordnete Ausgaben bleiben erhalten.`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: () => removeCategory(id) },
      ]);
    }
  }, [removeCategory]);

  const handleSetPersonalLimit = useCallback((cat: BudgetCategory) => {
    setPersonalLimitCategory(cat);
    setPersonalLimitValue(cat.personal_limit ? String(cat.personal_limit) : '');
  }, []);

  const handleSavePersonalLimit = useCallback(async () => {
    if (!personalLimitCategory) return;
    const value = parseFloat(personalLimitValue);
    try {
      if (!personalLimitValue.trim() || value <= 0) {
        await removePersonalLimit(personalLimitCategory.id);
      } else {
        await setPersonalLimit(personalLimitCategory.id, value);
      }
    } catch {
      Alert.alert('Fehler', 'Persönliches Limit konnte nicht gesetzt werden');
    }
    setPersonalLimitCategory(null);
  }, [personalLimitCategory, personalLimitValue, setPersonalLimit, removePersonalLimit]);

  const handleAddExpense = useCallback(async (data: {
    amount: number; description: string; category_id: string | null; date: string;
    paid_by: string | null; split_with: string[];
    scope: 'group' | 'personal'; visible_to: string[];
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
        scope: data.scope,
        visible_to: data.visible_to,
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
    if (Platform.OS === 'web') {
      if (window.confirm('Ausgabe wirklich löschen?')) {
        removeExpense(id);
      }
    } else {
      Alert.alert('Löschen', 'Ausgabe wirklich löschen?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: () => removeExpense(id) },
      ]);
    }
  }, [removeExpense]);

  const handleSettle = useCallback(async (settlement: Settlement) => {
    if (!user) return;
    try {
      await addExpense({
        trip_id: tripId,
        category_id: categories[0]?.id || null,
        description: `Ausgleich: ${settlement.fromName} → ${settlement.toName}`,
        amount: settlement.amount,
        currency,
        date: new Date().toISOString().split('T')[0],
        paid_by: settlement.from,
        split_with: [settlement.to],
        scope: 'group',
        visible_to: [],
      });
    } catch {
      Alert.alert('Fehler', 'Ausgleich konnte nicht erstellt werden');
    }
  }, [addExpense, tripId, currency, categories, user]);

  const handleReceiptSave = useCallback(async (data: {
    imageUrl: string;
    restaurantName: string | null;
    date: string | null;
    currency: string;
    items: Receipt['items'];
    subtotal: number | null;
    tax: number | null;
    tip: number | null;
    total: number | null;
    categoryId: string | null;
    paidBy: string | null;
  }) => {
    if (!user) return;
    try {
      await addReceipt({
        trip_id: tripId,
        scanned_by: user.id,
        status: 'scanned',
        image_url: data.imageUrl,
        restaurant_name: data.restaurantName,
        date: data.date,
        currency: data.currency,
        items: data.items,
        subtotal: data.subtotal,
        tax: data.tax,
        tip: data.tip,
        total: data.total,
        paid_by: data.paidBy,
        category_id: data.categoryId,
      });
    } catch {
      Alert.alert('Fehler', 'Beleg konnte nicht gespeichert werden');
    }
  }, [addReceipt, tripId, user]);

  const handleReceiptUpdate = useCallback(async (id: string, updates: any) => {
    try {
      await updateReceiptHook(id, updates);
    } catch {
      Alert.alert('Fehler', 'Beleg konnte nicht aktualisiert werden');
    }
  }, [updateReceiptHook]);

  const handleReceiptComplete = useCallback(async (receipt: Receipt) => {
    try {
      await completeReceipt(receipt);
      refresh(); // Refresh expenses too
    } catch {
      Alert.alert('Fehler', 'Beleg konnte nicht abgeschlossen werden');
    }
  }, [completeReceipt, refresh]);

  const handleReceiptReopen = useCallback(async (id: string) => {
    try {
      await reopenReceipt(id);
      refresh();
    } catch {
      Alert.alert('Fehler', 'Beleg konnte nicht erneut geöffnet werden');
    }
  }, [reopenReceipt, refresh]);

  const handleReceiptDelete = useCallback(async (id: string) => {
    try {
      await removeReceipt(id);
      refresh();
    } catch {
      Alert.alert('Fehler', 'Beleg konnte nicht gelöscht werden');
    }
  }, [removeReceipt, refresh]);

  // Free user on shared trip → can see but not edit
  const isSharedReadonly = !isPremium && !!trip && trip.owner_id !== user?.id;
  const budgetSneakPeek = isSneakPeek('budget', expenses.length > 0 || categories.length > 0);
  const readonlyMode = budgetSneakPeek || isSharedReadonly;

  const guardAction = (action: string = 'bearbeiten') => {
    showToast(`Upgrade auf Premium um ${action} zu können`, 'info');
  };

  // Budget feature gating — show upgrade showcase for free users without data
  if (!isFeatureAllowed('budget') && !readonlyMode && !isSharedReadonly) {
    return (
      <View style={styles.container}>
        <Header title="Budget & Ausgaben" />
        <UpgradePrompt
          iconName="wallet-outline"
          title="Budget & Ausgaben"
          message="Behalte den Überblick über deine Reisekosten — von Kategorien bis zur fairen Aufteilung"
          heroGradient={['#4ECDC4', '#2ECC71']}
          highlights={[
            { icon: 'pie-chart-outline', text: 'Ausgaben nach Kategorie', detail: 'Essen, Transport, Unterkunft & mehr' },
            { icon: 'receipt-outline', text: 'Quittungen scannen', detail: 'Beleg fotografieren, Betrag wird erkannt' },
            { icon: 'people-outline', text: 'Faire Aufteilung', detail: 'Wer schuldet wem? Automatisch berechnet' },
            { icon: 'bar-chart-outline', text: 'Budget-Übersicht', detail: 'Tages- und Gesamtbudget im Blick' },
          ]}
        />
        <TripBottomNav tripId={tripId} activeTab="Budget" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Budget & Ausgaben"
        rightAction={
          <TouchableOpacity onPress={() => setShowAiModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="sparkles-outline" size={iconSize.md} color={colors.secondary} />
          </TouchableOpacity>
        }
      />

      {readonlyMode && <SneakPeekOverlay feature="Budget" />}

      {loading && !trip ? (
        <BudgetSkeleton />
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}>
          {/* Tab Bar with Privacy Filter */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, tab === 'expenses' && styles.tabActive]}
              onPress={() => setTab('expenses')}
            >
              <Text style={[styles.tabText, tab === 'expenses' && styles.tabTextActive]}>Ausgaben</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'budget' && styles.tabActive]}
              onPress={() => setTab('budget')}
            >
              <Text style={[styles.tabText, tab === 'budget' && styles.tabTextActive]}>Budget</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowPrivateOnly(prev => !prev)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon
                name={showPrivateOnly ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={showPrivateOnly ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {loading ? (
            <BudgetSkeleton />
          ) : tab === 'budget' ? (
            /* ===== BUDGET TAB ===== */
            <>
              <BudgetOverviewCard
                totalBudget={totalBudget}
                totalSpent={filteredTotal}
                currency={currency}
                categories={filteredByCategory.map(c => ({ name: c.name, color: c.color, spent: c.spent }))}
              />

              {filteredByCategory.map(cat => (
                <BudgetCategoryCard
                  key={cat.id}
                  name={cat.name}
                  color={cat.color}
                  spent={cat.spent}
                  budgetLimit={cat.budget_limit}
                  personalLimit={cat.personal_limit}
                  currency={currency}
                  scope={cat.scope}
                  onEdit={cat.id !== '__uncategorized__' ? () => readonlyMode ? guardAction('bearbeiten') : setEditingCategory(cat) : undefined}
                  onDelete={cat.id !== '__uncategorized__' ? () => readonlyMode ? guardAction('löschen') : handleDeleteCategory(cat.id, cat.name) : undefined}
                  onSetPersonalLimit={cat.id !== '__uncategorized__' && cat.scope === 'group' ? () => readonlyMode ? guardAction('bearbeiten') : handleSetPersonalLimit(cat) : undefined}
                />
              ))}

              {filteredByCategory.length === 0 && (
                <Text style={styles.emptyText}>Noch keine Kategorien erstellt</Text>
              )}

              {!readonlyMode && (
                <TouchableOpacity style={styles.addCatButton} onPress={() => setShowAddCategory(true)} activeOpacity={0.7}>
                  <Text style={styles.addCatText}>+ Kategorie hinzufügen</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            /* ===== EXPENSES TAB ===== */
            <>
              {/* Summary + Settlement Card */}
              <ExpenseSummaryCard
                expenses={filteredExpenses}
                collaborators={collaborators}
                currency={currency}
                currentUserId={user?.id || ''}
                groupExpenses={groupExpenses}
                onSettle={readonlyMode ? () => guardAction('bearbeiten') : handleSettle}
              />

              {filteredExpenses.length === 0 && filteredReceipts.length === 0 ? (
                <Text style={styles.emptyText}>Noch keine Ausgaben erfasst</Text>
              ) : (
                (() => {
                  // Merge receipts + manual expenses into one sorted list
                  type FeedItem =
                    | { type: 'receipt'; data: Receipt; sortDate: string; sortCreated: string }
                    | { type: 'expense'; data: typeof filteredExpenses[0]; sortDate: string; sortCreated: string };

                  const feed: FeedItem[] = [
                    ...filteredReceipts.map(r => ({
                      type: 'receipt' as const,
                      data: r,
                      sortDate: r.date || r.created_at,
                      sortCreated: r.created_at,
                    })),
                    ...filteredExpenses
                      .filter(exp => !exp.receipt_id)
                      .map(e => ({
                        type: 'expense' as const,
                        data: e,
                        sortDate: e.date,
                        sortCreated: e.created_at,
                      })),
                  ];

                  feed.sort((a, b) =>
                    new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
                    || new Date(b.sortCreated).getTime() - new Date(a.sortCreated).getTime()
                  );

                  return feed.map(item => {
                    if (item.type === 'receipt') {
                      const receipt = item.data;
                      return (
                        <SwipeableRow
                          key={`r-${receipt.id}`}
                          actions={readonlyMode ? [] : [
                            { icon: 'trash-outline', color: colors.error, onPress: () => handleReceiptDelete(receipt.id) },
                          ]}
                        >
                          <ReceiptCard
                            receipt={receipt}
                            currency={currency}
                            collaborators={collaborators}
                            currentUserId={user?.id || ''}
                            categories={categories}
                            onUpdate={readonlyMode ? () => guardAction('bearbeiten') : handleReceiptUpdate}
                            onComplete={readonlyMode ? () => guardAction('bearbeiten') : handleReceiptComplete}
                            onReopen={readonlyMode ? () => guardAction('bearbeiten') : handleReceiptReopen}
                            onDelete={readonlyMode ? () => guardAction('löschen') : handleReceiptDelete}
                            onCategoryCreated={() => refresh()}
                          />
                        </SwipeableRow>
                      );
                    }
                    const exp = item.data;
                    return (
                      <SwipeableRow
                        key={`e-${exp.id}`}
                        actions={readonlyMode ? [] : [
                          { icon: 'create-outline', color: colors.primary, onPress: () => setEditingExpense(exp) },
                          { icon: 'trash-outline', color: colors.error, onPress: () => handleDeleteExpense(exp.id) },
                        ]}
                      >
                        <ExpenseItem
                          expense={exp}
                          currency={currency}
                          currentUserId={user?.id}
                          showPaidBy={exp.scope === 'group'}
                          collaborators={collaborators}
                          onPress={() => readonlyMode ? guardAction('bearbeiten') : setEditingExpense(exp)}
                          onLongPress={() => readonlyMode ? guardAction('löschen') : handleDeleteExpense(exp.id)}
                        />
                      </SwipeableRow>
                    );
                  });
                })()
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Scan FAB (expenses tab only, AI-gated, not in sneak-peek) */}
      {tab === 'expenses' && !readonlyMode && (
        <TouchableOpacity
          style={styles.scanFab}
          onPress={() => setShowReceiptScan(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[colors.secondary, '#3DBCB3']}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Icon name="scan-outline" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* FAB (hidden in sneak-peek mode) */}
      {!readonlyMode && <TouchableOpacity
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
      </TouchableOpacity>}

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
          initialScope={editingCategory.scope}
          showScopeToggle={false}
        />
      )}

      {/* Personal Limit Modal */}
      {personalLimitCategory && (
        <Modal visible={!!personalLimitCategory} transparent animationType="fade" onRequestClose={() => setPersonalLimitCategory(null)}>
          <TouchableOpacity style={styles.plOverlay} activeOpacity={1} onPress={() => setPersonalLimitCategory(null)}>
            <TouchableOpacity style={styles.plModal} activeOpacity={1} onPress={() => {}}>
              <Text style={styles.plTitle}>Mein Limit</Text>
              <Text style={styles.plSubtitle}>
                Persönliches Zusatzbudget für «{personalLimitCategory.name}»
                {personalLimitCategory.budget_limit ? ` (Gruppe: ${currency} ${personalLimitCategory.budget_limit.toFixed(0)})` : ''}
              </Text>
              <View style={styles.plInputRow}>
                <Text style={styles.plCurrency}>{currency}</Text>
                <TextInput
                  style={styles.plInput}
                  value={personalLimitValue}
                  onChangeText={setPersonalLimitValue}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textLight}
                  autoFocus
                />
              </View>
              <Text style={styles.plHint}>Nur für dich sichtbar. Wird zum Gruppenbudget addiert.</Text>
              <View style={styles.plButtons}>
                <TouchableOpacity style={styles.plBtnCancel} onPress={() => setPersonalLimitCategory(null)}>
                  <Text style={styles.plBtnCancelText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.plBtnSave} onPress={handleSavePersonalLimit}>
                  <Text style={styles.plBtnSaveText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      <AddExpenseModal
        visible={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        onSave={handleAddExpense}
        categories={categories}
        collaborators={collaborators}
        currentUserId={user?.id || ''}
        currency={currency}
        onCreateCategory={async (name, color) => { await addCategory(name, color); }}
      />

      <EditExpenseModal
        visible={!!editingExpense}
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
        onSave={handleUpdateExpense}
        onDelete={handleDeleteExpense}
        categories={categories}
        collaborators={collaborators}
        currentUserId={user?.id || ''}
        currency={currency}
        onCreateCategory={async (name, color) => { await addCategory(name, color); }}
      />

      <ReceiptScanModal
        visible={showReceiptScan}
        onClose={() => setShowReceiptScan(false)}
        onSave={handleReceiptSave}
        tripId={tripId}
        categories={categories}
        collaborators={collaborators}
        currentUserId={user?.id || ''}
        currency={currency}
        onCategoryCreated={() => refresh()}
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
    marginBottom: spacing.sm,
    overflow: 'hidden',
    alignItems: 'center',
    ...shadows.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
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
  scanFab: { position: 'absolute', right: spacing.xl, bottom: 56 + spacing.md + 56 + spacing.sm, width: 56, height: 56 },
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
  // Personal limit modal
  plOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  plModal: { backgroundColor: '#FFFFFF', borderRadius: borderRadius.lg, padding: spacing.xl, width: '85%', maxWidth: 360, ...shadows.lg },
  plTitle: { ...typography.h3, marginBottom: spacing.xs },
  plSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  plInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  plCurrency: { ...typography.body, fontWeight: '600', color: colors.textSecondary, marginRight: spacing.sm },
  plInput: { ...typography.h2, flex: 1, paddingVertical: spacing.sm, color: colors.text },
  plHint: { ...typography.caption, color: colors.textLight, fontStyle: 'italic', marginBottom: spacing.md },
  plButtons: { flexDirection: 'row', gap: spacing.sm },
  plBtnCancel: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, alignItems: 'center', backgroundColor: colors.background },
  plBtnCancelText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  plBtnSave: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, alignItems: 'center', backgroundColor: colors.primary },
  plBtnSaveText: { ...typography.bodySmall, fontWeight: '600', color: '#FFFFFF' },
});
