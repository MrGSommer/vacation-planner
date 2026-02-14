import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Input, Button, EmptyState, TripBottomNav } from '../../components/common';
import { BOTTOM_NAV_HEIGHT } from '../../components/common/TripBottomNav';
import {
  getPackingLists, createPackingList, getPackingItems,
  createPackingItem, createPackingItems, togglePackingItem,
  togglePackingItems, deletePackingItem, deletePackingItems,
  updatePackingItemAssignment,
} from '../../api/packing';
import { getCollaborators, CollaboratorWithProfile } from '../../api/invitations';
import { PackingItem } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { PACKING_CATEGORIES } from '../../utils/constants';
import { TRIP_TYPES, PACKING_TEMPLATES } from '../../utils/packingTemplates';
import { useRealtime } from '../../hooks/useRealtime';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { PackingSkeleton } from '../../components/skeletons/PackingSkeleton';
import { useToast } from '../../contexts/ToastContext';
import { AiTripModal } from '../../components/ai/AiTripModal';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuthContext } from '../../contexts/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Packing'>;

export const PackingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { showToast } = useToast();
  const { user } = useAuthContext();
  const { isFeatureAllowed } = useSubscription();
  const [showAiModal, setShowAiModal] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<string>(PACKING_CATEGORIES[0]);
  const [newQuantity, setNewQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  // Selection mode (bulk edits)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Template picker
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Collaborators for assignment
  const [collaborators, setCollaborators] = useState<CollaboratorWithProfile[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignItemId, setAssignItemId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [lists, collabs] = await Promise.all([
        getPackingLists(tripId),
        getCollaborators(tripId),
      ]);
      setCollaborators(collabs);

      let activeList = lists[0];
      if (lists.length === 0) {
        activeList = await createPackingList(tripId, 'Packliste');
      }
      setListId(activeList.id);
      const packingItems = await getPackingItems(activeList.id);
      setItems(packingItems);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (item: PackingItem) => {
    if (selectionMode) {
      // In selection mode, tap toggles selection
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      return;
    }
    try {
      await togglePackingItem(item.id, !item.is_packed);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_packed: !i.is_packed } : i));
    } catch (e) {
      console.error(e);
    }
  };

  const handleLongPress = (item: PackingItem) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds(new Set([item.id]));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkPack = async (isPacked: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await togglePackingItems(ids, isPacked);
      setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, is_packed: isPacked } : i));
      showToast(isPacked ? 'Als gepackt markiert' : 'Als nicht gepackt markiert', 'success');
      exitSelectionMode();
    } catch {
      showToast('Fehler beim Aktualisieren', 'error');
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const doDelete = async () => {
      try {
        await deletePackingItems(ids);
        setItems(prev => prev.filter(i => !ids.includes(i.id)));
        showToast(`${ids.length} Gegenstände gelöscht`, 'success');
        exitSelectionMode();
      } catch {
        showToast('Fehler beim Löschen', 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (!window.confirm(`${ids.length} Gegenstände wirklich löschen?`)) return;
      await doDelete();
    } else {
      Alert.alert('Löschen', `${ids.length} Gegenstände wirklich löschen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !listId) return;
    try {
      await createPackingItem(listId, newName.trim(), newCategory, newQuantity);
      setShowModal(false);
      setNewName('');
      setNewQuantity(1);
      await loadData();
    } catch {
      Alert.alert('Fehler', 'Gegenstand konnte nicht hinzugefügt werden');
    }
  };

  const handleDelete = (id: string) => {
    const doDelete = async () => {
      try {
        await deletePackingItem(id);
        setItems(prev => prev.filter(i => i.id !== id));
        showToast('Gegenstand gelöscht', 'success');
      } catch {
        showToast('Fehler beim Löschen', 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (!window.confirm('Gegenstand entfernen?')) return;
      doDelete();
    } else {
      Alert.alert('Löschen', 'Gegenstand entfernen?', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleTemplateSelect = async (tripTypeId: string) => {
    if (!listId) return;
    const templateItems = PACKING_TEMPLATES[tripTypeId];
    if (!templateItems) return;
    try {
      await createPackingItems(listId, templateItems);
      setShowTemplatePicker(false);
      showToast('Vorlage hinzugefügt', 'success');
      await loadData();
    } catch {
      showToast('Fehler beim Laden der Vorlage', 'error');
    }
  };

  const handleAssign = async (userId: string | null) => {
    if (!assignItemId) return;
    try {
      await updatePackingItemAssignment(assignItemId, userId);
      setItems(prev => prev.map(i => i.id === assignItemId ? { ...i, assigned_to: userId } : i));
      setShowAssignModal(false);
      setAssignItemId(null);
    } catch {
      showToast('Fehler bei Zuweisung', 'error');
    }
  };

  const getAssigneeName = (userId: string | null): string | null => {
    if (!userId) return null;
    const collab = collaborators.find(c => c.profile.id === userId);
    return collab ? getDisplayName(collab.profile) || null : null;
  };

  const getAssigneeInitial = (userId: string | null): string => {
    const name = getAssigneeName(userId);
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  const packed = items.filter(i => i.is_packed).length;
  const totalItems = items.length;
  const progress = totalItems > 0 ? (packed / totalItems) * 100 : 0;

  const grouped = PACKING_CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {} as Record<string, PackingItem[]>);

  // Also group any items with categories not in PACKING_CATEGORIES
  const knownCats = new Set(PACKING_CATEGORIES);
  const otherItems = items.filter(i => !knownCats.has(i.category));
  if (otherItems.length > 0) {
    const otherGrouped = otherItems.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, PackingItem[]>);
    Object.assign(grouped, otherGrouped);
  }

  return (
    <View style={styles.container}>
      <Header
        title="Packliste"
        onBack={() => navigation.replace('TripDetail', { tripId })}
        rightAction={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isFeatureAllowed('ai') && (
              <TouchableOpacity onPress={() => setShowAiModal(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 22 }}>✨</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowTemplatePicker(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerBtn}>📋</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{packed}/{totalItems} eingepackt ({progress.toFixed(0)}%)</Text>
      </View>

      {loading ? (
        <PackingSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🧳"
          title="Packliste leer"
          message="Starte mit einer Vorlage oder füge einzelne Gegenstände hinzu"
          actionLabel="Vorlage wählen"
          onAction={() => setShowTemplatePicker(true)}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {Object.entries(grouped).map(([category, catItems]) => (
            <View key={category} style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{category}</Text>
              {catItems.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemRow, selectionMode && selectedIds.has(item.id) && styles.itemRowSelected]}
                  onPress={() => handleToggle(item)}
                  onLongPress={() => handleLongPress(item)}
                >
                  {selectionMode ? (
                    <View style={[styles.checkbox, selectedIds.has(item.id) && styles.selectedCheck]}>
                      {selectedIds.has(item.id) && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  ) : (
                    <View style={[styles.checkbox, item.is_packed && styles.checked]}>
                      {item.is_packed && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  )}
                  <Text style={[styles.itemName, !selectionMode && item.is_packed && styles.itemPacked]}>{item.name}</Text>
                  {item.quantity > 1 && <Text style={styles.quantity}>×{item.quantity}</Text>}

                  {/* Assignment avatar */}
                  <TouchableOpacity
                    onPress={(e: any) => {
                      e.stopPropagation();
                      if (selectionMode) return;
                      setAssignItemId(item.id);
                      setShowAssignModal(true);
                    }}
                    style={styles.assignBtn}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    {item.assigned_to ? (
                      <View style={styles.assignAvatar}>
                        <Text style={styles.assignAvatarText}>{getAssigneeInitial(item.assigned_to)}</Text>
                      </View>
                    ) : (
                      <Text style={styles.assignPlaceholder}>👥</Text>
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Selection mode bottom bar */}
      {selectionMode && (
        <View style={styles.selectionBar}>
          <TouchableOpacity style={styles.selectionAction} onPress={() => handleBulkPack(true)}>
            <Text style={styles.selectionActionText}>✓ Packen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionAction} onPress={() => handleBulkPack(false)}>
            <Text style={styles.selectionActionText}>↩ Entpacken</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionAction} onPress={handleBulkDelete}>
            <Text style={[styles.selectionActionText, { color: colors.error }]}>Löschen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionAction} onPress={exitSelectionMode}>
            <Text style={[styles.selectionActionText, { color: colors.textSecondary }]}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Item Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Gegenstand hinzufügen</Text>
            <Input label="Name" placeholder="z.B. Sonnencreme" value={newName} onChangeText={setNewName} />
            <Text style={styles.fieldLabel}>Kategorie</Text>
            <View style={styles.catRow}>
              {PACKING_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, newCategory === cat && styles.catChipActive]}
                  onPress={() => setNewCategory(cat)}
                >
                  <Text style={[styles.catText, newCategory === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Menge</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setNewQuantity(q => Math.max(1, q - 1))}
              >
                <Text style={styles.quantityBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{newQuantity}</Text>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setNewQuantity(q => q + 1)}
              >
                <Text style={styles.quantityBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => { setShowModal(false); setNewQuantity(1); }} variant="ghost" style={styles.modalBtn} />
              <Button title="Hinzufügen" onPress={handleAdd} disabled={!newName.trim()} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Template Picker Modal */}
      <Modal visible={showTemplatePicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Vorlage wählen</Text>
            <Text style={styles.templateSubtitle}>Wähle einen Reisetyp, um passende Gegenstände hinzuzufügen</Text>
            <View style={styles.templateGrid}>
              {TRIP_TYPES.map(type => (
                <TouchableOpacity
                  key={type.id}
                  style={styles.templateCard}
                  onPress={() => handleTemplateSelect(type.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.templateIcon}>{type.icon}</Text>
                  <Text style={styles.templateLabel}>{type.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title="Abbrechen" onPress={() => setShowTemplatePicker(false)} variant="ghost" />
          </View>
        </View>
      </Modal>

      {/* Assignment Modal */}
      <Modal visible={showAssignModal} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.assignOverlay}
          activeOpacity={1}
          onPress={() => { setShowAssignModal(false); setAssignItemId(null); }}
        >
          <View style={styles.assignModal}>
            <Text style={styles.assignTitle}>Zuweisen an</Text>

            {/* Team / unassigned option */}
            <TouchableOpacity style={styles.assignOption} onPress={() => handleAssign(null)}>
              <Text style={styles.assignOptionIcon}>👥</Text>
              <Text style={styles.assignOptionName}>Team (alle)</Text>
              {assignItemId && !items.find(i => i.id === assignItemId)?.assigned_to && (
                <Text style={styles.assignCheck}>✓</Text>
              )}
            </TouchableOpacity>

            {collaborators.map(collab => (
              <TouchableOpacity
                key={collab.profile.id}
                style={styles.assignOption}
                onPress={() => handleAssign(collab.profile.id)}
              >
                <View style={styles.assignOptionAvatar}>
                  <Text style={styles.assignOptionAvatarText}>
                    {(getDisplayName(collab.profile) || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.assignOptionName}>{getDisplayName(collab.profile)}</Text>
                {assignItemId && items.find(i => i.id === assignItemId)?.assigned_to === collab.profile.id && (
                  <Text style={styles.assignCheck}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)} activeOpacity={0.8}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.fabGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      {showAiModal && user && (
        <AiTripModal
          visible={showAiModal}
          onClose={() => setShowAiModal(false)}
          mode="enhance"
          tripId={tripId}
          userId={user.id}
        />
      )}

      <TripBottomNav tripId={tripId} activeTab="Packing" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerBtn: { fontSize: 22, color: colors.primary, fontWeight: '600' },
  progressContainer: { padding: spacing.md },
  progressBar: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.success, borderRadius: 4 },
  progressText: { ...typography.caption, marginTop: spacing.xs, textAlign: 'center' },
  content: { padding: spacing.md, paddingBottom: 140 },
  categorySection: { marginBottom: spacing.lg },
  categoryTitle: { ...typography.h3, marginBottom: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemRowSelected: { backgroundColor: colors.primary + '10' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checked: { backgroundColor: colors.success, borderColor: colors.success },
  selectedCheck: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  itemName: { ...typography.body, flex: 1 },
  itemPacked: { textDecorationLine: 'line-through', color: colors.textLight },
  quantity: { ...typography.bodySmall, color: colors.textSecondary, marginRight: spacing.sm },
  assignBtn: { paddingLeft: spacing.xs },
  assignAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignAvatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  assignPlaceholder: { fontSize: 16 },

  // Selection bar
  selectionBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  selectionAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  selectionActionText: { ...typography.caption, fontWeight: '600', color: colors.primary },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  catText: { ...typography.caption, fontWeight: '600' },
  catTextActive: { color: '#fff' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  quantityBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityBtnText: { fontSize: 18, fontWeight: '600', color: colors.text },
  quantityValue: { ...typography.body, fontWeight: '600', minWidth: 40, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },

  // Template picker
  templateSubtitle: { ...typography.bodySmall, marginBottom: spacing.lg },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  templateCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  templateIcon: { fontSize: 32, marginBottom: spacing.xs },
  templateLabel: { ...typography.caption, fontWeight: '600', textAlign: 'center' },

  // Assignment modal
  assignOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '80%',
    maxWidth: 340,
    ...shadows.lg,
  },
  assignTitle: { ...typography.h3, marginBottom: spacing.md },
  assignOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  assignOptionIcon: { fontSize: 20, marginRight: spacing.md, width: 28, textAlign: 'center' },
  assignOptionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  assignOptionAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  assignOptionName: { ...typography.body, flex: 1 },
  assignCheck: { fontSize: 16, color: colors.success, fontWeight: '700' },

  // FAB
  fab: { position: 'absolute', right: spacing.xl, bottom: BOTTOM_NAV_HEIGHT + spacing.md, width: 56, height: 56 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300' },
});
