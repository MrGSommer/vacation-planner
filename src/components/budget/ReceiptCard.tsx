import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal, ScrollView,
  Alert, Platform,
} from 'react-native';
import { Card, Avatar, Button } from '../common';
import { Receipt, ReceiptItem } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { formatDate } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';

interface ReceiptCardProps {
  receipt: Receipt;
  currency: string;
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  onUpdate: (id: string, updates: Partial<Pick<Receipt, 'items' | 'status' | 'paid_by' | 'tip'>>) => void;
  onComplete: (receipt: Receipt) => void;
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  receipt, currency, collaborators, currentUserId,
  onUpdate, onComplete, onReopen, onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);

  const assignedCount = receipt.items.filter(i => i.assigned_to.length > 0 && !i.is_tip).length;
  const totalNonTipItems = receipt.items.filter(i => !i.is_tip).length;
  const progressPct = totalNonTipItems > 0 ? assignedCount / totalNonTipItems : 0;

  const paidByCollab = receipt.paid_by
    ? collaborators.find(c => c.user_id === receipt.paid_by)
    : null;

  // Calculate personal share
  const myShare = useMemo(() => {
    let total = 0;
    for (const item of receipt.items) {
      const totalQty = item.assigned_to.reduce((s, a) => s + a.quantity, 0);
      const myAssignment = item.assigned_to.find(a => a.user_id === currentUserId);
      if (myAssignment && totalQty > 0) {
        total += (item.total_price / totalQty) * myAssignment.quantity;
      }
    }
    return Math.round(total * 100) / 100;
  }, [receipt.items, currentUserId]);

  const statusColor = receipt.status === 'completed' ? colors.success
    : receipt.status === 'in_progress' ? colors.sky : colors.warning;
  const statusLabel = receipt.status === 'completed' ? 'Abgeschlossen'
    : receipt.status === 'in_progress' ? 'In Bearbeitung' : 'Offen';

  const updateAssignment = useCallback((itemId: string, userId: string, delta: number) => {
    const updatedItems = receipt.items.map(item => {
      if (item.id !== itemId) return item;
      const existing = item.assigned_to.find(a => a.user_id === userId);
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) {
          return { ...item, assigned_to: item.assigned_to.filter(a => a.user_id !== userId) };
        }
        return { ...item, assigned_to: item.assigned_to.map(a => a.user_id === userId ? { ...a, quantity: newQty } : a) };
      } else if (delta > 0) {
        return { ...item, assigned_to: [...item.assigned_to, { user_id: userId, quantity: 1 }] };
      }
      return item;
    });
    onUpdate(receipt.id, { items: updatedItems, status: receipt.status === 'scanned' ? 'in_progress' : receipt.status });
  }, [receipt, onUpdate]);

  const handleComplete = useCallback(() => {
    if (!receipt.paid_by) {
      Alert.alert('Fehlt', 'Bitte wähle zuerst, wer bezahlt hat.');
      return;
    }
    const unassigned = receipt.items.filter(i => !i.is_tip && i.assigned_to.length === 0);
    if (unassigned.length > 0) {
      Alert.alert('Nicht zugewiesen', `${unassigned.length} Position(en) sind noch niemandem zugewiesen.`);
      return;
    }
    onComplete(receipt);
  }, [receipt, onComplete]);

  const handleSetPaidBy = useCallback((userId: string) => {
    onUpdate(receipt.id, { paid_by: userId } as any);
  }, [receipt.id, onUpdate]);

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
                {myShare > 0 && (
                  <Text style={styles.share}>
                    {receipt.paid_by === currentUserId
                      ? `Du erhältst: ${currency} ${(receipt.total! - myShare).toFixed(2)}`
                      : `Dein Anteil: ${currency} ${myShare.toFixed(2)}`}
                  </Text>
                )}
              </View>
              {/* Progress bar */}
              {receipt.status !== 'completed' && totalNonTipItems > 0 && (
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
                </View>
              )}
            </View>
            <Text style={styles.total}>{currency} {(receipt.total || 0).toFixed(2)}</Text>
          </View>
        </Card>
      </TouchableOpacity>

      {/* Expanded Modal */}
      <Modal visible={expanded} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.expandedContent}>
            <View style={styles.expandedHeader}>
              <Text style={styles.expandedTitle}>{receipt.restaurant_name || 'Beleg'}</Text>
              <TouchableOpacity onPress={() => { setExpanded(false); setAssigningItemId(null); }}>
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

              {/* Paid By */}
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
                    disabled={receipt.status === 'completed'}
                  >
                    <Text style={[styles.chipText, receipt.paid_by === c.user_id && { color: '#fff' }]}>
                      {getDisplayName(c.profile)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Items */}
              <Text style={styles.sectionLabel}>Positionen</Text>
              {receipt.items.map(item => (
                <View key={item.id} style={[
                  styles.itemCard,
                  !item.is_tip && item.assigned_to.length === 0 && receipt.status !== 'completed' && styles.itemCardUnassigned,
                ]}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemInfo}>
                      {item.is_tip && <Icon name="heart" size={14} color={colors.primary} />}
                      <Text style={styles.itemName}>{item.name}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{currency} {item.total_price.toFixed(2)}</Text>
                  </View>
                  {item.quantity > 1 && item.unit_price && (
                    <Text style={styles.itemQty}>{item.quantity}x {currency} {item.unit_price.toFixed(2)}</Text>
                  )}

                  {/* Assignment chips */}
                  <View style={styles.assignmentRow}>
                    {item.is_tip ? (
                      <Text style={styles.assignmentHint}>Wird auf alle aufgeteilt</Text>
                    ) : receipt.status !== 'completed' ? (
                      <>
                        {collaborators.map(c => {
                          const assignment = item.assigned_to.find(a => a.user_id === c.user_id);
                          return assignment ? (
                            <View key={c.user_id} style={[styles.assignChip, styles.assignChipActive]}>
                              <Avatar uri={c.profile.avatar_url} name={getDisplayName(c.profile)} size={20} />
                              <Text style={styles.assignChipText}>{getDisplayName(c.profile).split(' ')[0]}</Text>
                              <TouchableOpacity onPress={() => updateAssignment(item.id, c.user_id, -1)} style={styles.stepperBtn}>
                                <Text style={styles.stepperBtnText}>−</Text>
                              </TouchableOpacity>
                              <Text style={styles.stepperQty}>{assignment.quantity}</Text>
                              <TouchableOpacity onPress={() => updateAssignment(item.id, c.user_id, 1)} style={styles.stepperBtn}>
                                <Text style={styles.stepperBtnText}>+</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              key={c.user_id}
                              style={styles.assignChip}
                              onPress={() => updateAssignment(item.id, c.user_id, 1)}
                            >
                              <Avatar uri={c.profile.avatar_url} name={getDisplayName(c.profile)} size={20} />
                            </TouchableOpacity>
                          );
                        })}
                        {item.quantity > 1 && item.assigned_to.length > 0 && (
                          <Text style={styles.assignmentHint}>
                            Zugewiesen: {item.assigned_to.reduce((s, a) => s + a.quantity, 0)} von {item.quantity}
                          </Text>
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

              {/* Summary per person */}
              {receipt.items.some(i => i.assigned_to.length > 0) && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Aufteilung</Text>
                  {collaborators.map(c => {
                    let share = 0;
                    for (const item of receipt.items) {
                      const totalQty = item.assigned_to.reduce((s, a) => s + a.quantity, 0);
                      const assignment = item.assigned_to.find(a => a.user_id === c.user_id);
                      if (assignment && totalQty > 0) {
                        share += (item.total_price / totalQty) * assignment.quantity;
                      }
                    }
                    if (share === 0) return null;
                    share = Math.round(share * 100) / 100;
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
                <View style={[styles.totalRow, styles.totalRowFinal]}>
                  <Text style={styles.totalLabelBold}>Total</Text>
                  <Text style={styles.totalValueBold}>{currency} {(receipt.total || 0).toFixed(2)}</Text>
                </View>
              </View>
            </ScrollView>

            {/* Action buttons */}
            <View style={styles.expandedFooter}>
              {receipt.status === 'completed' ? (
                <View style={styles.footerButtons}>
                  <Button title="Bearbeiten" variant="ghost" onPress={() => onReopen(receipt.id)} style={styles.footerBtn} />
                  <Button
                    title="Löschen"
                    variant="ghost"
                    onPress={() => {
                      Alert.alert('Beleg löschen', 'Beleg und zugehörige Ausgaben wirklich löschen?', [
                        { text: 'Abbrechen', style: 'cancel' },
                        { text: 'Löschen', style: 'destructive', onPress: () => { onDelete(receipt.id); setExpanded(false); } },
                      ]);
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
                      Alert.alert('Beleg löschen', 'Diesen Beleg wirklich löschen?', [
                        { text: 'Abbrechen', style: 'cancel' },
                        { text: 'Löschen', style: 'destructive', onPress: () => { onDelete(receipt.id); setExpanded(false); } },
                      ]);
                    }}
                    style={styles.footerBtn}
                  />
                  <Button
                    title="Abschliessen"
                    onPress={handleComplete}
                    style={styles.footerBtn}
                    disabled={!receipt.paid_by || receipt.items.some(i => !i.is_tip && i.assigned_to.length === 0)}
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
  share: { ...typography.caption, color: colors.secondary, fontWeight: '600' },
  total: { ...typography.body, fontWeight: '700', color: colors.primary },
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
  expandedTitle: { ...typography.h2 },
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
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  itemName: { ...typography.bodySmall, fontWeight: '500' },
  itemPrice: { ...typography.bodySmall, fontWeight: '700' },
  itemQty: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  // Assignment
  assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
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
  stepperBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.secondary + '20', alignItems: 'center', justifyContent: 'center' },
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
