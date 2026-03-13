import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal, ScrollView,
  Alert, Platform, TextInput,
} from 'react-native';
import { Card, Avatar, Button, DatePickerInput } from '../common';
import { Receipt, ReceiptItem, BudgetCategory } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { formatDate } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';
import { logError } from '../../services/errorLogger';

const CATEGORY_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C42', '#6C5CE7'];

interface ReceiptCardProps {
  receipt: Receipt;
  currency: string;
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  categories: BudgetCategory[];
  onUpdate: (id: string, updates: Partial<Pick<Receipt, 'items' | 'status' | 'paid_by' | 'tip' | 'restaurant_name' | 'date' | 'category_id'>>) => void;
  onComplete: (receipt: Receipt) => void;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
  onCategoryCreated?: (category: BudgetCategory) => void;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  receipt, currency, collaborators, currentUserId, categories,
  onUpdate, onComplete, onReopen, onDelete, onCategoryCreated,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  // Inline category creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]);

  const isEditable = receipt.status !== 'completed';
  const isOwner = receipt.scanned_by === currentUserId;

  const nonTipNonDiscountItems = receipt.items.filter(i => !i.is_tip && !i.is_discount);
  const assignedCount = nonTipNonDiscountItems.filter(i => i.assigned_to.length > 0).length;
  const totalNonTipItems = nonTipNonDiscountItems.length;
  const progressPct = totalNonTipItems > 0 ? assignedCount / totalNonTipItems : 0;

  const discountItems = receipt.items.filter(i => i.is_discount);
  const generalDiscountTotal = discountItems
    .filter(i => i.discount_target === 'all')
    .reduce((s, i) => s + i.total_price, 0); // negative values

  const paidByCollab = receipt.paid_by
    ? collaborators.find(c => c.user_id === receipt.paid_by)
    : null;

  // Calculate personal share with discount support
  const myShare = useMemo(() => {
    let total = 0;
    let totalBeforeDiscount = 0;
    for (const item of receipt.items) {
      if (item.is_discount) continue;
      const totalQty = item.assigned_to.reduce((s, a) => s + a.quantity, 0);
      const myAssignment = item.assigned_to.find(a => a.user_id === currentUserId);
      if (myAssignment && totalQty > 0) {
        const share = (item.total_price / totalQty) * myAssignment.quantity;
        total += share;
      }
      if (totalQty > 0) {
        totalBeforeDiscount += item.total_price;
      }
    }
    // Apply position-specific discounts
    for (const disc of discountItems) {
      if (disc.discount_target && disc.discount_target !== 'all') {
        const targetItem = receipt.items.find(i => i.name === disc.discount_target);
        if (targetItem) {
          const totalQty = targetItem.assigned_to.reduce((s, a) => s + a.quantity, 0);
          const myAssignment = targetItem.assigned_to.find(a => a.user_id === currentUserId);
          if (myAssignment && totalQty > 0) {
            total += (disc.total_price / totalQty) * myAssignment.quantity;
          }
        }
      }
    }
    // Apply general discounts proportionally
    if (generalDiscountTotal < 0 && totalBeforeDiscount > 0 && total > 0) {
      total += generalDiscountTotal * (total / totalBeforeDiscount);
    }
    return Math.round(Math.max(0, total) * 100) / 100;
  }, [receipt.items, currentUserId, discountItems, generalDiscountTotal]);

  const statusColor = receipt.status === 'completed' ? colors.success
    : receipt.status === 'in_progress' ? colors.sky : colors.warning;
  const statusLabel = receipt.status === 'completed' ? 'Abgeschlossen'
    : receipt.status === 'in_progress' ? 'In Bearbeitung' : 'Offen';

  const toggleUserAssignment = useCallback((itemId: string, userId: string) => {
    const updatedItems = receipt.items.map(item => {
      if (item.id !== itemId) return item;
      const existing = item.assigned_to.find(a => a.user_id === userId);
      if (existing) {
        return { ...item, assigned_to: item.assigned_to.filter(a => a.user_id !== userId) };
      } else {
        return { ...item, assigned_to: [...item.assigned_to, { user_id: userId, quantity: 1 }] };
      }
    });
    onUpdate(receipt.id, { items: updatedItems, status: receipt.status === 'scanned' ? 'in_progress' : receipt.status });
  }, [receipt, onUpdate]);

  const updateQuantityAssignment = useCallback((itemId: string, userId: string, delta: number) => {
    const updatedItems = receipt.items.map(item => {
      if (item.id !== itemId) return item;
      const existing = item.assigned_to.find(a => a.user_id === userId);
      if (!existing) return item;

      // Max validation: sum of all assignments must not exceed item.quantity
      if (delta > 0) {
        const currentTotal = item.assigned_to.reduce((s, a) => s + a.quantity, 0);
        if (currentTotal >= item.quantity) return item;
      }

      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        return { ...item, assigned_to: item.assigned_to.filter(a => a.user_id !== userId) };
      }
      return { ...item, assigned_to: item.assigned_to.map(a => a.user_id === userId ? { ...a, quantity: newQty } : a) };
    });
    onUpdate(receipt.id, { items: updatedItems, status: receipt.status === 'scanned' ? 'in_progress' : receipt.status });
  }, [receipt, onUpdate]);

  const handleComplete = useCallback(() => {
    if (!receipt.paid_by) {
      if (Platform.OS === 'web') {
        window.alert('Bitte wähle zuerst, wer bezahlt hat.');
      } else {
        Alert.alert('Fehlt', 'Bitte wähle zuerst, wer bezahlt hat.');
      }
      return;
    }
    const unassigned = receipt.items.filter(i => !i.is_tip && !i.is_discount && i.assigned_to.length === 0);
    if (unassigned.length > 0) {
      if (Platform.OS === 'web') {
        window.alert(`${unassigned.length} Position(en) sind noch niemandem zugewiesen.`);
      } else {
        Alert.alert('Nicht zugewiesen', `${unassigned.length} Position(en) sind noch niemandem zugewiesen.`);
      }
      return;
    }
    onComplete(receipt);
  }, [receipt, onComplete]);

  const handleSetPaidBy = useCallback((userId: string) => {
    onUpdate(receipt.id, { paid_by: userId });
  }, [receipt.id, onUpdate]);

  const handleMetadataUpdate = useCallback((field: 'restaurant_name' | 'date' | 'category_id', value: string | null) => {
    onUpdate(receipt.id, { [field]: value } as Pick<Receipt, 'restaurant_name' | 'date' | 'category_id'>);
  }, [receipt.id, onUpdate]);

  // Calculate summary shares with discount support
  const calcShareForUser = useCallback((userId: string) => {
    let share = 0;
    let totalBeforeDiscount = 0;
    for (const item of receipt.items) {
      if (item.is_discount) continue;
      const totalQty = item.assigned_to.reduce((s, a) => s + a.quantity, 0);
      const assignment = item.assigned_to.find(a => a.user_id === userId);
      if (assignment && totalQty > 0) {
        share += (item.total_price / totalQty) * assignment.quantity;
      }
      if (totalQty > 0) totalBeforeDiscount += item.total_price;
    }
    // Position-specific discounts
    for (const disc of discountItems) {
      if (disc.discount_target && disc.discount_target !== 'all') {
        const targetItem = receipt.items.find(i => i.name === disc.discount_target);
        if (targetItem) {
          const totalQty = targetItem.assigned_to.reduce((s, a) => s + a.quantity, 0);
          const assignment = targetItem.assigned_to.find(a => a.user_id === userId);
          if (assignment && totalQty > 0) {
            share += (disc.total_price / totalQty) * assignment.quantity;
          }
        }
      }
    }
    // General discounts proportionally
    if (generalDiscountTotal < 0 && totalBeforeDiscount > 0 && share > 0) {
      share += generalDiscountTotal * (share / totalBeforeDiscount);
    }
    return Math.round(Math.max(0, share) * 100) / 100;
  }, [receipt.items, discountItems, generalDiscountTotal]);

  const currentCategory = categories.find(c => c.id === receipt.category_id);

  return (
    <>
      {/* Collapsed Card */}
      <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.7}>
        <Card style={styles.card}>
          <View style={styles.row}>
            {receipt.image_url ? (
              <Image source={{ uri: receipt.image_url }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                <Icon name="receipt-outline" size={20} color={colors.textLight} />
              </View>
            )}
            <View style={styles.info}>
              <View style={styles.titleRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {receipt.restaurant_name || 'Beleg'}
                </Text>
                <View style={[styles.badge, { backgroundColor: `${statusColor}20` }]}>
                  <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                {receipt.date && <Text style={styles.date}>{formatDate(receipt.date)}</Text>}
                {currentCategory && (
                  <View style={[styles.metaCatBadge, { backgroundColor: currentCategory.color + '20' }]}>
                    <Text style={[styles.metaCatText, { color: currentCategory.color }]}>{currentCategory.name}</Text>
                  </View>
                )}
                {paidByCollab && (
                  <Text style={styles.metaPaidBy}>{getDisplayName(paidByCollab.profile)}</Text>
                )}
              </View>
              {/* Progress bar */}
              {receipt.status !== 'completed' && totalNonTipItems > 0 && (
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
                </View>
              )}
            </View>
            <View style={styles.amountCol}>
              {myShare > 0 ? (
                <>
                  <Text style={[styles.shareAmount, receipt.paid_by === currentUserId ? styles.sharePositive : styles.shareNegative]}>
                    {receipt.paid_by === currentUserId
                      ? `+${(receipt.total! - myShare).toFixed(2)}`
                      : `-${myShare.toFixed(2)}`}
                  </Text>
                  <Text style={styles.totalSmall}>{currency} {(receipt.total || 0).toFixed(2)}</Text>
                </>
              ) : (
                <Text style={styles.total}>{currency} {(receipt.total || 0).toFixed(2)}</Text>
              )}
            </View>
          </View>
        </Card>
      </TouchableOpacity>

      {/* Expanded Modal */}
      <Modal visible={expanded} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.expandedContent}>
            <View style={styles.expandedHeader}>
              {isEditable ? (
                <TextInput
                  style={[styles.expandedTitle, styles.editableInput]}
                  value={receipt.restaurant_name || ''}
                  onChangeText={(v) => handleMetadataUpdate('restaurant_name', v || null)}
                  placeholder="Beleg-Name"
                  placeholderTextColor={colors.textLight}
                />
              ) : (
                <Text style={styles.expandedTitle}>{receipt.restaurant_name || 'Beleg'}</Text>
              )}
              <TouchableOpacity onPress={() => { setExpanded(false); setExpandedItemId(null); }}>
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.expandedScroll} contentContainerStyle={styles.expandedScrollContent}>
              {/* Image */}
              {receipt.image_url && (
                <TouchableOpacity onPress={() => setShowImage(true)}>
                  <Image source={{ uri: receipt.image_url }} style={styles.receiptImage} resizeMode="contain" />
                  <Text style={styles.tapToEnlarge}>Antippen zum Vergrössern</Text>
                </TouchableOpacity>
              )}

              {/* Editable metadata: Date + Category (TODO 1) */}
              {isEditable && (
                <View style={styles.metadataSection}>
                  <View style={styles.fieldRow}>
                    <View style={[styles.fieldHalf, { marginBottom: 0 }]}>
                      <DatePickerInput
                        label="Datum"
                        value={receipt.date || ''}
                        onChange={(v) => handleMetadataUpdate('date', v || null)}
                        maxDate={new Date().toISOString().split('T')[0]}
                      />
                    </View>
                    {currentCategory && (
                      <View style={styles.fieldHalf}>
                        <Text style={styles.fieldLabel}>Kategorie</Text>
                        <Text style={[styles.categoryBadge, { backgroundColor: currentCategory.color + '30', color: currentCategory.color }]}>
                          {currentCategory.name}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.fieldLabel}>Kategorie</Text>
                  <View style={styles.chipRow}>
                    {categories.map(cat => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.chip, receipt.category_id === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]}
                        onPress={() => handleMetadataUpdate('category_id', cat.id)}
                      >
                        <Text style={[styles.chipText, receipt.category_id === cat.id && { color: '#fff' }]}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                    {onCategoryCreated && (
                      <TouchableOpacity
                        style={[styles.chip, { borderStyle: 'dashed' as any }]}
                        onPress={() => setShowNewCategory(!showNewCategory)}
                      >
                        <Icon name={showNewCategory ? 'close' : 'add'} size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {showNewCategory && onCategoryCreated && (
                    <View style={styles.newCatRow}>
                      <TextInput
                        style={[styles.metaInput, { flex: 1 }]}
                        value={newCatName}
                        onChangeText={setNewCatName}
                        placeholder="Kategorie-Name"
                        placeholderTextColor={colors.textLight}
                      />
                      <View style={styles.colorPickerRow}>
                        {CATEGORY_COLORS.map(c => (
                          <TouchableOpacity
                            key={c}
                            style={[styles.colorDot, { backgroundColor: c }, newCatColor === c && styles.colorDotActive]}
                            onPress={() => setNewCatColor(c)}
                          />
                        ))}
                      </View>
                      <Button
                        title="Erstellen"
                        onPress={async () => {
                          if (!newCatName.trim()) return;
                          try {
                            const { createBudgetCategory } = await import('../../api/budgets');
                            const created = await createBudgetCategory(receipt.trip_id, newCatName.trim(), newCatColor, null);
                            onCategoryCreated!(created);
                            handleMetadataUpdate('category_id', created.id);
                            setNewCatName('');
                            setShowNewCategory(false);
                          } catch (e) { logError(e, { component: 'ReceiptCard', context: { action: 'createCategory' } }); }
                        }}
                        disabled={!newCatName.trim()}
                        style={{ marginTop: spacing.xs }}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Read-only metadata for completed status */}
              {!isEditable && (
                <View style={styles.readOnlyMetaRow}>
                  {receipt.date && (
                    <View style={styles.readOnlyMetaItem}>
                      <Text style={styles.readOnlyMetaLabel}>Datum</Text>
                      <Text style={styles.readOnlyMetaValue}>{formatDate(receipt.date)}</Text>
                    </View>
                  )}
                  {currentCategory && (
                    <View style={styles.readOnlyMetaItem}>
                      <Text style={styles.readOnlyMetaLabel}>Kategorie</Text>
                      <Text style={[styles.categoryBadge, { backgroundColor: currentCategory.color + '30', color: currentCategory.color }]}>
                        {currentCategory.name}
                      </Text>
                    </View>
                  )}
                  {paidByCollab && (
                    <View style={styles.readOnlyMetaItem}>
                      <Text style={styles.readOnlyMetaLabel}>Bezahlt von</Text>
                      <Text style={styles.readOnlyMetaValue}>{getDisplayName(paidByCollab.profile)}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Paid By (editable) */}
              {isEditable && (
                <>
                  <Text style={styles.sectionLabel}>Bezahlt von</Text>
                  <View style={styles.chipRow}>
                    {collaborators.map(c => (
                      <TouchableOpacity
                        key={c.user_id}
                        style={[
                          styles.chip,
                          receipt.paid_by === c.user_id && { backgroundColor: colors.secondary, borderColor: colors.secondary },
                        ]}
                        onPress={() => handleSetPaidBy(c.user_id)}
                      >
                        <Text style={[styles.chipText, receipt.paid_by === c.user_id && { color: '#fff' }]}>
                          {getDisplayName(c.profile)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Items */}
              <Text style={styles.sectionLabel}>Positionen</Text>
              {receipt.items.filter(i => !i.is_discount).map(item => (
                <View key={item.id} style={[
                  styles.itemCard,
                  !item.is_tip && item.assigned_to.length === 0 && isEditable && styles.itemCardUnassigned,
                ]}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemInfo}>
                      {item.is_tip && <Icon name="heart" size={14} color={colors.primary} />}
                      <Text style={styles.itemName}>{item.name}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{currency} {item.total_price.toFixed(2)}</Text>
                  </View>
                  {item.quantity > 1 && item.unit_price && (
                    <View style={styles.qtyHeaderRow}>
                      <Text style={styles.itemQty}>{item.quantity}x {currency} {item.unit_price.toFixed(2)}</Text>
                      {isEditable && item.assigned_to.length > 0 && (
                        <TouchableOpacity onPress={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}>
                          <Icon
                            name={expandedItemId === item.id ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={colors.textSecondary}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* Assignment: 2-Level UI (TODO 3) */}
                  <View style={styles.assignmentRow}>
                    {item.is_tip ? (
                      <Text style={styles.assignmentHint}>Wird auf alle aufgeteilt</Text>
                    ) : isEditable ? (
                      <>
                        {/* Level 1: Avatar toggles */}
                        {collaborators.map(c => {
                          const assignment = item.assigned_to.find(a => a.user_id === c.user_id);
                          const isSelected = !!assignment;
                          return (
                            <TouchableOpacity
                              key={c.user_id}
                              style={[styles.assignChip, isSelected && styles.assignChipActive]}
                              onPress={() => toggleUserAssignment(item.id, c.user_id)}
                            >
                              <Avatar uri={c.profile.avatar_url} name={getDisplayName(c.profile)} size={20} />
                              {isSelected && (
                                <Text style={styles.assignChipText}>{getDisplayName(c.profile).split(' ')[0]}</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                        {/* Per-person share info */}
                        {item.assigned_to.length > 1 && item.quantity <= 1 && (
                          <Text style={styles.assignmentHint}>
                            je {currency} {(item.total_price / item.assigned_to.length).toFixed(2)}
                          </Text>
                        )}
                        {/* Multi-quantity: assigned count + stepper hint */}
                        {item.quantity > 1 && item.assigned_to.length > 0 && (() => {
                          const totalAssigned = item.assigned_to.reduce((s, a) => s + a.quantity, 0);
                          const isFull = totalAssigned >= item.quantity;
                          return (
                            <Text style={[styles.assignmentHint, { color: isFull ? colors.success : colors.warning }]}>
                              Zugewiesen: {totalAssigned} von {item.quantity}
                            </Text>
                          );
                        })()}

                        {/* Level 2: Quantity steppers (only for multi-quantity, only when expanded) */}
                        {item.quantity > 1 && expandedItemId === item.id && item.assigned_to.length > 0 && (
                          <View style={styles.stepperSection}>
                            {item.assigned_to.map(a => {
                              const collab = collaborators.find(c => c.user_id === a.user_id);
                              if (!collab) return null;
                              const totalAssigned = item.assigned_to.reduce((s, ass) => s + ass.quantity, 0);
                              const isMaxReached = totalAssigned >= item.quantity;
                              return (
                                <View key={a.user_id} style={styles.stepperRow}>
                                  <Avatar uri={collab.profile.avatar_url} name={getDisplayName(collab.profile)} size={20} />
                                  <Text style={styles.stepperName}>{getDisplayName(collab.profile).split(' ')[0]}</Text>
                                  <View style={styles.stepperControls}>
                                    <TouchableOpacity
                                      onPress={() => updateQuantityAssignment(item.id, a.user_id, -1)}
                                      style={styles.stepperBtn}
                                    >
                                      <Text style={styles.stepperBtnText}>−</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.stepperQty}>{a.quantity}</Text>
                                    <TouchableOpacity
                                      onPress={() => updateQuantityAssignment(item.id, a.user_id, 1)}
                                      style={[styles.stepperBtn, isMaxReached && styles.stepperBtnDisabled]}
                                      disabled={isMaxReached}
                                    >
                                      <Text style={[styles.stepperBtnText, isMaxReached && { color: colors.textLight }]}>+</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.assignedAvatars}>
                        {item.assigned_to.map(a => {
                          const collab = collaborators.find(c => c.user_id === a.user_id);
                          if (!collab) return null;
                          return (
                            <View key={a.user_id} style={styles.completedAvatarWrap}>
                              <Avatar uri={collab.profile.avatar_url} name={getDisplayName(collab.profile)} size={22} />
                              {a.quantity > 1 && (
                                <View style={styles.qtyBadge}>
                                  <Text style={styles.qtyBadgeText}>×{a.quantity}</Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              ))}

              {/* Discount items (TODO 2c) */}
              {discountItems.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: spacing.sm }]}>Rabatte</Text>
                  {discountItems.map(item => (
                    <View key={item.id} style={[styles.itemCard, styles.discountCard]}>
                      <View style={styles.itemHeader}>
                        <View style={styles.itemInfo}>
                          <Icon name="pricetag-outline" size={14} color={colors.success} />
                          <Text style={[styles.itemName, { color: colors.success }]}>{item.name}</Text>
                        </View>
                        <Text style={[styles.itemPrice, { color: colors.success }]}>{currency} {item.total_price.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.assignmentHint}>
                        {item.discount_target === 'all'
                          ? 'Wird proportional aufgeteilt'
                          : item.discount_target
                            ? `Für: ${item.discount_target}`
                            : 'Wird proportional aufgeteilt'}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* Summary per person (TODO 2d — with discount support) */}
              {receipt.items.some(i => !i.is_discount && i.assigned_to.length > 0) && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Aufteilung</Text>
                  {collaborators.map(c => {
                    const share = calcShareForUser(c.user_id);
                    if (share === 0) return null;
                    const isPayer = receipt.paid_by === c.user_id;
                    return (
                      <View key={c.user_id} style={styles.summaryRow}>
                        <View style={styles.summaryLeft}>
                          <Avatar uri={c.profile.avatar_url} name={getDisplayName(c.profile)} size={24} />
                          <Text style={styles.summaryName}>{getDisplayName(c.profile)}</Text>
                        </View>
                        <View style={styles.summaryRight}>
                          <Text style={styles.summaryAmount}>{currency} {share.toFixed(2)}</Text>
                          {isPayer && receipt.total && (
                            <Text style={[styles.summaryNote, { color: colors.success }]}>
                              Erhält {currency} {(receipt.total - share).toFixed(2)} zurück
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              {/* Totals */}
              <View style={styles.totalsBox}>
                {receipt.subtotal != null && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Subtotal</Text>
                    <Text style={styles.totalValue}>{currency} {receipt.subtotal.toFixed(2)}</Text>
                  </View>
                )}
                {receipt.tax != null && receipt.tax > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>MwSt</Text>
                    <Text style={styles.totalValue}>{currency} {receipt.tax.toFixed(2)}</Text>
                  </View>
                )}
                {receipt.tip != null && receipt.tip > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Trinkgeld</Text>
                    <Text style={styles.totalValue}>{currency} {receipt.tip.toFixed(2)}</Text>
                  </View>
                )}
                {generalDiscountTotal < 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.success }]}>Rabatt</Text>
                    <Text style={[styles.totalValue, { color: colors.success }]}>{currency} {generalDiscountTotal.toFixed(2)}</Text>
                  </View>
                )}
                <View style={[styles.totalRow, styles.totalRowFinal]}>
                  <Text style={styles.totalLabelBold}>Total</Text>
                  <Text style={styles.totalValueBold}>{currency} {(receipt.total || 0).toFixed(2)}</Text>
                </View>
              </View>
            </ScrollView>

            {/* Action buttons (TODO 5b: owner-based reopen) */}
            <View style={styles.expandedFooter}>
              {receipt.status === 'completed' ? (
                <View style={styles.footerButtons}>
                  {isOwner && (
                    <Button title="Bearbeiten" variant="ghost" onPress={() => onReopen(receipt.id)} style={styles.footerBtn} />
                  )}
                  <Button
                    title="Löschen"
                    variant="ghost"
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm('Beleg und zugehörige Ausgaben wirklich löschen?')) { onDelete(receipt.id); setExpanded(false); }
                      } else {
                        Alert.alert('Beleg löschen', 'Beleg und zugehörige Ausgaben wirklich löschen?', [
                          { text: 'Abbrechen', style: 'cancel' },
                          { text: 'Löschen', style: 'destructive', onPress: () => { onDelete(receipt.id); setExpanded(false); } },
                        ]);
                      }
                    }}
                    style={styles.footerBtn}
                  />
                </View>
              ) : (
                <View style={styles.footerButtons}>
                  <Button
                    title="Löschen"
                    variant="ghost"
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (window.confirm('Diesen Beleg wirklich löschen?')) { onDelete(receipt.id); setExpanded(false); }
                      } else {
                        Alert.alert('Beleg löschen', 'Diesen Beleg wirklich löschen?', [
                          { text: 'Abbrechen', style: 'cancel' },
                          { text: 'Löschen', style: 'destructive', onPress: () => { onDelete(receipt.id); setExpanded(false); } },
                        ]);
                      }
                    }}
                    style={styles.footerBtn}
                  />
                  <Button
                    title="Abschliessen"
                    onPress={handleComplete}
                    style={styles.footerBtn}
                    disabled={!receipt.paid_by || receipt.items.some(i => !i.is_tip && !i.is_discount && i.assigned_to.length === 0)}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen image viewer */}
      <Modal visible={showImage} transparent animationType="fade">
        <TouchableOpacity style={styles.imageOverlay} onPress={() => setShowImage(false)} activeOpacity={1}>
          <Image source={{ uri: receipt.image_url }} style={styles.fullImage} resizeMode="contain" />
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Collapsed card
  card: { marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.secondary },
  row: { flexDirection: 'row', alignItems: 'center' },
  thumbnail: { width: 44, height: 44, borderRadius: borderRadius.sm, marginRight: spacing.sm },
  thumbnailPlaceholder: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginRight: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  name: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  badgeText: { ...typography.caption, fontWeight: '700', fontSize: 10 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2, flexWrap: 'wrap' },
  date: { ...typography.caption },
  metaCatBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: borderRadius.full },
  metaCatText: { ...typography.caption, fontSize: 10, fontWeight: '600' },
  metaPaidBy: { ...typography.caption, color: colors.textSecondary },
  amountCol: { alignItems: 'flex-end', gap: 1 },
  shareAmount: { ...typography.body, fontWeight: '700' },
  sharePositive: { color: colors.success },
  shareNegative: { color: colors.error },
  totalSmall: { ...typography.caption, color: colors.textLight, fontSize: 10 },
  total: { ...typography.body, fontWeight: '700', color: colors.text },
  progressBar: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: 4 },
  progressFill: { height: 3, backgroundColor: colors.secondary, borderRadius: 2 },

  // Expanded modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  expandedContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '92%',
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  expandedTitle: { ...typography.h2, flex: 1, marginRight: spacing.sm },
  editableInput: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 2 },
  expandedScroll: { flex: 1 },
  expandedScrollContent: { padding: spacing.xl, paddingTop: spacing.md },
  expandedFooter: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButtons: { flexDirection: 'row', gap: spacing.md },
  footerBtn: { flex: 1 },

  // Receipt image
  receiptImage: { width: '100%', height: 150, borderRadius: borderRadius.md, marginBottom: spacing.xs },
  tapToEnlarge: { ...typography.caption, color: colors.textLight, textAlign: 'center', marginBottom: spacing.md },

  // Metadata section (TODO 1)
  metadataSection: { marginBottom: spacing.md },
  fieldRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  fieldHalf: { flex: 1 },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.xs },
  metaInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  metaReadOnly: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  readOnlyMetaRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md, flexWrap: 'wrap' },
  readOnlyMetaItem: { gap: 2 },
  readOnlyMetaLabel: { ...typography.caption, color: colors.textLight, fontSize: 10 },
  readOnlyMetaValue: { ...typography.bodySmall, fontWeight: '600' },
  categoryBadge: {
    ...typography.caption,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },

  // Sections
  sectionLabel: { ...typography.bodySmall, fontWeight: '700', marginBottom: spacing.sm },

  // Items
  itemCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  itemCardUnassigned: { borderWidth: 1, borderColor: colors.warning, borderStyle: 'dashed' },
  discountCard: { borderWidth: 1, borderColor: colors.success, borderStyle: 'dashed', backgroundColor: `${colors.success}08` },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  itemName: { ...typography.bodySmall, fontWeight: '500' },
  itemPrice: { ...typography.bodySmall, fontWeight: '700' },
  itemQty: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  qtyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },

  // Assignment
  assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs, alignItems: 'center' },
  assignmentHint: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  assignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  assignChipActive: { borderColor: colors.secondary, backgroundColor: `${colors.secondary}15` },
  assignChipText: { ...typography.caption, fontSize: 11, color: colors.secondary, fontWeight: '600' },

  // Stepper section (Level 2)
  stepperSection: { width: '100%', marginTop: spacing.xs, gap: spacing.xs },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  stepperName: { ...typography.caption, fontSize: 11, color: colors.text, flex: 1 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.secondary + '20', alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { backgroundColor: colors.border + '40' },
  stepperBtnText: { fontSize: 14, fontWeight: '700', color: colors.secondary, lineHeight: 16 },
  stepperQty: { ...typography.caption, fontSize: 12, fontWeight: '700', color: colors.secondary, minWidth: 14, textAlign: 'center' },
  completedAvatarWrap: { position: 'relative' },
  qtyBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: colors.secondary, borderRadius: 8, paddingHorizontal: 3, minWidth: 16, alignItems: 'center' },
  qtyBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  assignedAvatars: { flexDirection: 'row', gap: 4 },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipText: { ...typography.caption, fontWeight: '600' },

  // Inline category creation
  newCatRow: { marginBottom: spacing.md, gap: spacing.xs },
  colorPickerRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: colors.text, transform: [{ scale: 1.15 }] },

  // Summary
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryName: { ...typography.bodySmall, fontWeight: '500' },
  summaryRight: { alignItems: 'flex-end' },
  summaryAmount: { ...typography.bodySmall, fontWeight: '700' },
  summaryNote: { ...typography.caption, fontSize: 10 },

  // Totals
  totalsBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  totalLabel: { ...typography.bodySmall, color: colors.textSecondary },
  totalValue: { ...typography.bodySmall, fontWeight: '600' },
  totalRowFinal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  totalLabelBold: { ...typography.body, fontWeight: '700' },
  totalValueBold: { ...typography.body, fontWeight: '700', color: colors.primary },

  // Fullscreen image
  imageOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '95%', height: '90%' },
});
