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
  updatePackingItemAssignment, updatePackingItem,
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

const CATEGORY_ICONS: Record<string, string> = {
  'Kleidung': '\uD83D\uDC55',
  'Toilettenartikel': '\uD83E\uDDF4',
  'Elektronik': '\uD83D\uDD0C',
  'Dokumente': '\uD83D\uDCC4',
  'Medikamente': '\uD83D\uDC8A',
  'Medizin': '\uD83D\uDC8A',
  'Sonstiges': '\uD83D\uDCE6',
};

interface CustomTemplate {
  id: string;
  label: string;
  icon: string;
  items: { name: string; category: string; quantity: number }[];
}

export const PackingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  const { showToast } = useToast();
  const { user, profile } = useAuthContext();
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
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // Template editing
  const [editingTemplate, setEditingTemplate] = useState<CustomTemplate | null>(null);
  const [editTemplateName, setEditTemplateName] = useState('');

  // Edit item
  const [editingItem, setEditingItem] = useState<PackingItem | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemCategory, setEditItemCategory] = useState<string>(PACKING_CATEGORIES[0]);
  const [editItemQuantity, setEditItemQuantity] = useState(1);

  // Drag-to-category
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Collaborators for assignment
  const [collaborators, setCollaborators] = useState<CollaboratorWithProfile[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignItemId, setAssignItemId] = useState<string | null>(null);

  // Collapsed categories
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const [lists, collabs] = await Promise.all([
        getPackingLists(tripId),
        getCollaborators(tripId),
      ]);
      if (user && !collabs.find(c => c.user_id === user.id)) {
        collabs.unshift({
          id: 'self',
          trip_id: tripId,
          user_id: user.id,
          role: 'owner',
          created_at: new Date().toISOString(),
          profile: { id: user.id, email: user.email || '', first_name: profile?.first_name, last_name: profile?.last_name, avatar_url: profile?.avatar_url },
        } as CollaboratorWithProfile);
      }
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

  const handlePackingRealtime = useCallback(() => { loadData(); }, [loadData]);

  useRealtime(
    'packing_items',
    listId ? `list_id=eq.${listId}` : 'list_id=eq.00000000-0000-0000-0000-000000000000',
    handlePackingRealtime,
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if ((route.params as any)?.openFable) {
        setShowAiModal(true);
        navigation.setParams({ openFable: undefined } as any);
      }
    });
    return unsubscribe;
  }, [navigation, route.params]);

  const handleToggle = async (item: PackingItem) => {
    if (selectionMode) {
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

  const openEditItem = (item: PackingItem) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemCategory(item.category);
    setEditItemQuantity(item.quantity);
  };

  const handleSaveEditItem = async () => {
    if (!editingItem || !editItemName.trim()) return;
    try {
      await updatePackingItem(editingItem.id, {
        name: editItemName.trim(),
        category: editItemCategory,
        quantity: editItemQuantity,
      });
      setItems(prev => prev.map(i =>
        i.id === editingItem.id
          ? { ...i, name: editItemName.trim(), category: editItemCategory, quantity: editItemQuantity }
          : i
      ));
      setEditingItem(null);
      showToast('Gegenstand aktualisiert', 'success');
    } catch {
      showToast('Fehler beim Speichern', 'error');
    }
  };

  const handleDeleteFromEdit = () => {
    if (!editingItem) return;
    const id = editingItem.id;
    setEditingItem(null);
    handleDelete(id);
  };

  // Long press → open category picker for moving item
  const handleItemLongPress = (item: PackingItem) => {
    if (selectionMode) return;
    setDraggingItemId(item.id);
    setShowCategoryPicker(true);
  };

  const handleMoveToCategory = async (newCategory: string) => {
    if (!draggingItemId) return;
    try {
      await updatePackingItem(draggingItemId, { category: newCategory });
      setItems(prev => prev.map(i =>
        i.id === draggingItemId ? { ...i, category: newCategory } : i
      ));
      setShowCategoryPicker(false);
      setDraggingItemId(null);
      showToast(`Verschoben nach ${newCategory}`, 'success');
    } catch {
      showToast('Fehler beim Verschieben', 'error');
    }
  };

  // Load custom templates from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('wayfable_custom_templates');
      if (stored) setCustomTemplates(JSON.parse(stored));
    } catch {}
  }, []);

  const persistTemplates = (templates: CustomTemplate[]) => {
    setCustomTemplates(templates);
    try {
      localStorage.setItem('wayfable_custom_templates', JSON.stringify(templates));
    } catch {}
  };

  const handleTemplateSelect = async (tripTypeId: string) => {
    if (!listId) return;
    const templateItems = PACKING_TEMPLATES[tripTypeId]
      || customTemplates.find(t => t.id === tripTypeId)?.items;
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

  const handleSaveAsTemplate = () => {
    if (!newTemplateName.trim() || items.length === 0) return;
    const id = `custom_${Date.now()}`;
    const templateItems = items.map(i => ({ name: i.name, category: i.category, quantity: i.quantity }));
    const newTemplate: CustomTemplate = { id, label: newTemplateName.trim(), icon: '\uD83D\uDCCB', items: templateItems };
    persistTemplates([...customTemplates, newTemplate]);
    setShowSaveTemplate(false);
    setNewTemplateName('');
    showToast('Vorlage gespeichert', 'success');
  };

  const handleDeleteCustomTemplate = (id: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Vorlage löschen?')) return;
    }
    persistTemplates(customTemplates.filter(t => t.id !== id));
    showToast('Vorlage gelöscht', 'success');
  };

  const handleEditTemplate = (tmpl: CustomTemplate) => {
    setEditingTemplate(tmpl);
    setEditTemplateName(tmpl.label);
    setShowTemplatePicker(false);
  };

  const handleSaveEditTemplate = () => {
    if (!editingTemplate || !editTemplateName.trim()) return;
    const updated = customTemplates.map(t =>
      t.id === editingTemplate.id ? { ...t, label: editTemplateName.trim() } : t
    );
    persistTemplates(updated);
    setEditingTemplate(null);
    setEditTemplateName('');
    showToast('Vorlage aktualisiert', 'success');
  };

  const handleRemoveTemplateItem = (itemIndex: number) => {
    if (!editingTemplate) return;
    const newItems = editingTemplate.items.filter((_, i) => i !== itemIndex);
    const updated = { ...editingTemplate, items: newItems };
    setEditingTemplate(updated);
    const updatedTemplates = customTemplates.map(t => t.id === updated.id ? updated : t);
    persistTemplates(updatedTemplates);
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

  const toggleCategory = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const packed = items.filter(i => i.is_packed).length;
  const totalItems = items.length;
  const progress = totalItems > 0 ? (packed / totalItems) * 100 : 0;

  const grouped = PACKING_CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {} as Record<string, PackingItem[]>);

  const knownCats = new Set<string>(PACKING_CATEGORIES);
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

      {/* Progress Card */}
      {totalItems > 0 && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressEmoji}>{progress === 100 ? '✅' : '🧳'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressTitle}>
                {progress === 100 ? 'Alles eingepackt!' : `${packed} von ${totalItems} eingepackt`}
              </Text>
              <Text style={styles.progressPercent}>{progress.toFixed(0)}%</Text>
            </View>
          </View>
          <View style={styles.progressBarOuter}>
            <LinearGradient
              colors={progress === 100 ? [colors.success, '#00D2A0'] : [colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressBarFill, { width: `${Math.max(progress, 2)}%` }]}
            />
          </View>
        </View>
      )}

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
          {Object.entries(grouped).map(([category, catItems]) => {
            const catPacked = catItems.filter(i => i.is_packed).length;
            const isCollapsed = collapsedCats.has(category);
            const catIcon = CATEGORY_ICONS[category] || '\uD83D\uDCE6';

            return (
              <View key={category} style={styles.categoryCard}>
                <TouchableOpacity
                  style={styles.categoryHeader}
                  onPress={() => toggleCategory(category)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryIcon}>{catIcon}</Text>
                  <Text style={styles.categoryTitle}>{category}</Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{catPacked}/{catItems.length}</Text>
                  </View>
                  <Text style={styles.chevron}>{isCollapsed ? '\u25B6' : '\u25BC'}</Text>
                </TouchableOpacity>

                {!isCollapsed && catItems.map(item => (
                  <View
                    key={item.id}
                    style={[styles.itemRow, selectionMode && selectedIds.has(item.id) && styles.itemRowSelected]}
                  >
                    {/* Checkbox — separate touch target */}
                    <TouchableOpacity
                      onPress={() => handleToggle(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
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
                    </TouchableOpacity>

                    {/* Tap name → edit, long press → move category */}
                    <TouchableOpacity
                      style={styles.itemNameArea}
                      onPress={() => selectionMode ? handleToggle(item) : openEditItem(item)}
                      onLongPress={() => handleItemLongPress(item)}
                      activeOpacity={0.6}
                    >
                      <Text style={[styles.itemName, !selectionMode && item.is_packed && styles.itemPacked]}>{item.name}</Text>
                      {item.quantity > 1 && <Text style={styles.quantity}>×{item.quantity}</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
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
                  </View>
                ))}
              </View>
            );
          })}

          {/* Save as template button */}
          {items.length > 0 && (
            <TouchableOpacity
              style={styles.saveTemplateBtn}
              onPress={() => setShowSaveTemplate(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.saveTemplateBtnIcon}>💾</Text>
              <Text style={styles.saveTemplateBtnText}>Als Vorlage speichern</Text>
            </TouchableOpacity>
          )}
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
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowModal(false); setNewQuantity(1); }}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
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
                  <Text style={styles.catChipIcon}>{CATEGORY_ICONS[cat] || '\uD83D\uDCE6'}</Text>
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
        </TouchableOpacity>
      </Modal>

      {/* Template Picker Modal */}
      <Modal visible={showTemplatePicker} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTemplatePicker(false)}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Vorlage wählen</Text>
            <Text style={styles.templateSubtitle}>Wähle einen Reisetyp oder eine eigene Vorlage</Text>
            <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              {/* Built-in templates */}
              <Text style={styles.templateSectionLabel}>Reisetypen</Text>
              <View style={styles.templateGrid}>
                {TRIP_TYPES.map(type => (
                  <TouchableOpacity
                    key={type.id}
                    style={styles.templateChip}
                    onPress={() => handleTemplateSelect(type.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.templateChipIcon}>{type.icon}</Text>
                    <Text style={styles.templateChipLabel}>{type.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom templates */}
              {customTemplates.length > 0 && (
                <>
                  <Text style={styles.templateSectionLabel}>Eigene Vorlagen</Text>
                  <View style={styles.templateGrid}>
                    {customTemplates.map(tmpl => (
                      <View key={tmpl.id} style={styles.customTemplateRow}>
                        <TouchableOpacity
                          style={[styles.templateChip, styles.templateChipCustom]}
                          onPress={() => handleTemplateSelect(tmpl.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.templateChipIcon}>{tmpl.icon}</Text>
                          <Text style={styles.templateChipLabel} numberOfLines={1}>{tmpl.label}</Text>
                          <Text style={styles.templateChipCount}>{tmpl.items.length}</Text>
                        </TouchableOpacity>
                        <View style={styles.templateActions}>
                          <TouchableOpacity
                            onPress={() => handleEditTemplate(tmpl)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.templateActionIcon}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteCustomTemplate(tmpl.id)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.templateActionIcon}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Create new template */}
              <TouchableOpacity
                style={styles.newTemplateBtn}
                onPress={() => { setShowTemplatePicker(false); setShowSaveTemplate(true); }}
                activeOpacity={0.7}
              >
                <Text style={styles.newTemplateBtnIcon}>+</Text>
                <Text style={styles.newTemplateBtnText}>Aktuelle Liste als Vorlage speichern</Text>
              </TouchableOpacity>
            </ScrollView>
            <Button title="Schliessen" onPress={() => setShowTemplatePicker(false)} variant="ghost" />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Save as Template Modal */}
      <Modal visible={showSaveTemplate} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowSaveTemplate(false); setNewTemplateName(''); }}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Vorlage speichern</Text>
            <Text style={styles.templateSubtitle}>
              Speichere die aktuelle Packliste ({items.length} Gegenstände) als wiederverwendbare Vorlage
            </Text>
            <Input
              label="Name der Vorlage"
              placeholder="z.B. Strandurlaub mit Kind"
              value={newTemplateName}
              onChangeText={setNewTemplateName}
            />
            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => { setShowSaveTemplate(false); setNewTemplateName(''); }} variant="ghost" style={styles.modalBtn} />
              <Button title="Speichern" onPress={handleSaveAsTemplate} disabled={!newTemplateName.trim() || items.length === 0} style={styles.modalBtn} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Template Modal */}
      <Modal visible={!!editingTemplate} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setEditingTemplate(null); setEditTemplateName(''); }}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Vorlage bearbeiten</Text>
            <Input
              label="Name"
              value={editTemplateName}
              onChangeText={setEditTemplateName}
              placeholder="Vorlagenname"
            />
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              Gegenstände ({editingTemplate?.items.length || 0})
            </Text>
            <ScrollView style={{ maxHeight: 300, flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              {editingTemplate?.items.map((item, index) => (
                <View key={index} style={styles.editTemplateItem}>
                  <Text style={styles.editTemplateItemIcon}>
                    {CATEGORY_ICONS[item.category] || '\uD83D\uDCE6'}
                  </Text>
                  <Text style={styles.editTemplateItemName} numberOfLines={1}>{item.name}</Text>
                  {item.quantity > 1 && (
                    <Text style={styles.editTemplateItemQty}>×{item.quantity}</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => handleRemoveTemplateItem(index)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={{ fontSize: 16, color: colors.error }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <View style={[styles.modalButtons, { marginTop: spacing.md }]}>
              <Button
                title="Abbrechen"
                onPress={() => { setEditingTemplate(null); setEditTemplateName(''); }}
                variant="ghost"
                style={styles.modalBtn}
              />
              <Button
                title="Speichern"
                onPress={handleSaveEditTemplate}
                disabled={!editTemplateName.trim()}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Item Modal */}
      <Modal visible={!!editingItem} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditingItem(null)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Gegenstand bearbeiten</Text>
            <Input label="Name" placeholder="z.B. Sonnencreme" value={editItemName} onChangeText={setEditItemName} />
            <Text style={styles.fieldLabel}>Kategorie</Text>
            <View style={styles.catRow}>
              {PACKING_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, editItemCategory === cat && styles.catChipActive]}
                  onPress={() => setEditItemCategory(cat)}
                >
                  <Text style={styles.catChipIcon}>{CATEGORY_ICONS[cat] || '\uD83D\uDCE6'}</Text>
                  <Text style={[styles.catText, editItemCategory === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Menge</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setEditItemQuantity(q => Math.max(1, q - 1))}
              >
                <Text style={styles.quantityBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{editItemQuantity}</Text>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setEditItemQuantity(q => q + 1)}
              >
                <Text style={styles.quantityBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.editDeleteBtn}
                onPress={handleDeleteFromEdit}
              >
                <Text style={styles.editDeleteBtnText}>🗑️ Löschen</Text>
              </TouchableOpacity>
              <Button title="Abbrechen" onPress={() => setEditingItem(null)} variant="ghost" style={styles.modalBtn} />
              <Button title="Speichern" onPress={handleSaveEditItem} disabled={!editItemName.trim()} style={styles.modalBtn} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Category Picker (long press move) */}
      <Modal visible={showCategoryPicker} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.assignOverlay}
          activeOpacity={1}
          onPress={() => { setShowCategoryPicker(false); setDraggingItemId(null); }}
        >
          <View style={styles.assignModal}>
            <Text style={styles.assignTitle}>Verschieben nach</Text>
            {PACKING_CATEGORIES.map(cat => {
              const currentCat = draggingItemId ? items.find(i => i.id === draggingItemId)?.category : null;
              return (
                <TouchableOpacity
                  key={cat}
                  style={styles.assignOption}
                  onPress={() => handleMoveToCategory(cat)}
                >
                  <Text style={styles.assignOptionIcon}>{CATEGORY_ICONS[cat] || '\uD83D\uDCE6'}</Text>
                  <Text style={styles.assignOptionName}>{cat}</Text>
                  {currentCat === cat && <Text style={styles.assignCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
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

            <TouchableOpacity style={styles.assignOption} onPress={() => handleAssign(null)}>
              <Text style={styles.assignOptionIcon}>👥</Text>
              <Text style={styles.assignOptionName}>Team (alle)</Text>
              {assignItemId && !items.find(i => i.id === assignItemId)?.assigned_to && (
                <Text style={styles.assignCheck}>✓</Text>
              )}
            </TouchableOpacity>

            {collaborators.map(collab => {
              const isSelf = collab.user_id === user?.id;
              return (
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
                  <Text style={styles.assignOptionName}>
                    {getDisplayName(collab.profile)}{isSelf ? ' (Du)' : ''}
                  </Text>
                  {assignItemId && items.find(i => i.id === assignItemId)?.assigned_to === collab.profile.id && (
                    <Text style={styles.assignCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
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

  // Progress card
  progressCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  progressEmoji: { fontSize: 24 },
  progressTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  progressPercent: { ...typography.caption, color: colors.textSecondary },
  progressBarOuter: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: { height: 6, borderRadius: 3 },

  content: { padding: spacing.md, paddingBottom: 140 },

  // Category cards
  categoryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  categoryIcon: { fontSize: 18 },
  categoryTitle: { ...typography.body, fontWeight: '600', flex: 1 },
  categoryBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  categoryBadgeText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  chevron: { fontSize: 10, color: colors.textLight },

  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemRowSelected: { backgroundColor: colors.primary + '10' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checked: { backgroundColor: colors.success, borderColor: colors.success },
  selectedCheck: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemNameArea: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md, gap: spacing.xs },
  itemName: { ...typography.body, flex: 1, fontSize: 15 },
  itemPacked: { textDecorationLine: 'line-through', color: colors.textLight },
  quantity: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, marginRight: spacing.sm },
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

  // Save as template inline button
  saveTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderStyle: 'dashed',
  },
  saveTemplateBtnIcon: { fontSize: 16 },
  saveTemplateBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },

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
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  catChipIcon: { fontSize: 14 },
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
  editDeleteBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.error + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDeleteBtnText: { ...typography.caption, fontWeight: '600', color: colors.error },

  // Template picker — compact chips
  templateSubtitle: { ...typography.bodySmall, marginBottom: spacing.md },
  templateSectionLabel: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  templateChipCustom: {
    flex: 1,
    borderColor: colors.accent + '40',
    backgroundColor: colors.accent + '08',
  },
  templateChipIcon: { fontSize: 18 },
  templateChipLabel: { ...typography.bodySmall, fontWeight: '600', flexShrink: 1 },
  templateChipCount: { ...typography.caption, color: colors.textLight, marginLeft: 'auto' },
  customTemplateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  templateActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  templateActionIcon: { fontSize: 14 },
  newTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  newTemplateBtnIcon: { fontSize: 18, color: colors.textSecondary },
  newTemplateBtnText: { ...typography.bodySmall, color: colors.textSecondary },

  // Edit template modal
  editTemplateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  editTemplateItemIcon: { fontSize: 14 },
  editTemplateItemName: { ...typography.bodySmall, flex: 1 },
  editTemplateItemQty: { ...typography.caption, color: colors.textSecondary },

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
