import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header, Input, Button, Card, EmptyState, TripBottomNav } from '../../components/common';
import { getPackingLists, createPackingList, getPackingItems, createPackingItem, togglePackingItem, deletePackingItem } from '../../api/packing';
import { PackingItem } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { PACKING_CATEGORIES } from '../../utils/constants';
import { useRealtime } from '../../hooks/useRealtime';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Packing'>;

export const PackingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<string>(PACKING_CATEGORIES[0]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      let lists = await getPackingLists(tripId);
      if (lists.length === 0) {
        const list = await createPackingList(tripId, 'Packliste');
        lists = [list];
      }
      setListId(lists[0].id);
      const packingItems = await getPackingItems(lists[0].id);
      setItems(packingItems);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (item: PackingItem) => {
    try {
      await togglePackingItem(item.id, !item.is_packed);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_packed: !i.is_packed } : i));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !listId) return;
    try {
      await createPackingItem(listId, newName.trim(), newCategory);
      setShowModal(false);
      setNewName('');
      await loadData();
    } catch {
      Alert.alert('Fehler', 'Gegenstand konnte nicht hinzugefügt werden');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Löschen', 'Gegenstand entfernen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deletePackingItem(id);
        await loadData();
      }},
    ]);
  };

  const packed = items.filter(i => i.is_packed).length;
  const totalItems = items.length;
  const progress = totalItems > 0 ? (packed / totalItems) * 100 : 0;

  const grouped = PACKING_CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {} as Record<string, PackingItem[]>);

  return (
    <View style={styles.container}>
      <Header title="Packliste" onBack={() => navigation.goBack()} rightAction={
        <TouchableOpacity onPress={() => setShowModal(true)}>
          <Text style={styles.addBtn}>+</Text>
        </TouchableOpacity>
      } />

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{packed}/{totalItems} eingepackt ({progress.toFixed(0)}%)</Text>
      </View>

      {items.length === 0 ? (
        <EmptyState icon="🧳" title="Packliste leer" message="Füge Gegenstände hinzu, die du einpacken musst" actionLabel="Hinzufügen" onAction={() => setShowModal(true)} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {Object.entries(grouped).map(([category, catItems]) => (
            <View key={category} style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{category}</Text>
              {catItems.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => handleToggle(item)}
                  onLongPress={() => handleDelete(item.id)}
                >
                  <View style={[styles.checkbox, item.is_packed && styles.checked]}>
                    {item.is_packed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.itemName, item.is_packed && styles.itemPacked]}>{item.name}</Text>
                  {item.quantity > 1 && <Text style={styles.quantity}>×{item.quantity}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
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
            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => setShowModal(false)} variant="ghost" style={styles.modalBtn} />
              <Button title="Hinzufügen" onPress={handleAdd} disabled={!newName.trim()} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

      <TripBottomNav tripId={tripId} activeTab="Packing" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  addBtn: { fontSize: 24, color: colors.primary, fontWeight: '600' },
  progressContainer: { padding: spacing.md },
  progressBar: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.success, borderRadius: 4 },
  progressText: { ...typography.caption, marginTop: spacing.xs, textAlign: 'center' },
  content: { padding: spacing.md },
  categorySection: { marginBottom: spacing.lg },
  categoryTitle: { ...typography.h3, marginBottom: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  checked: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  itemName: { ...typography.body, flex: 1 },
  itemPacked: { textDecorationLine: 'line-through', color: colors.textLight },
  quantity: { ...typography.bodySmall, color: colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  catText: { ...typography.caption, fontWeight: '600' },
  catTextActive: { color: '#fff' },
  modalButtons: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },
});
