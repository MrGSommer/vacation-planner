import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Platform, Linking } from 'react-native';
import { Activity } from '../../types/database';
import { ACTIVITY_CATEGORIES, getActivityIcon } from '../../utils/constants';
import { CATEGORY_FIELDS, CATEGORY_COLORS } from '../../utils/categoryFields';
import { DocumentPicker } from './DocumentPicker';
import { openInGoogleMaps } from '../../utils/openInMaps';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { linkifyText } from '../../utils/linkify';

interface Props {
  visible: boolean;
  activity: Activity | null;
  onClose: () => void;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
  isEditor?: boolean;
  userId?: string;
}

function formatDE(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export const ActivityViewModal: React.FC<Props> = ({
  visible, activity, onClose, onEdit, onDelete, isEditor = true, userId,
}) => {
  if (!activity) return null;

  const cat = ACTIVITY_CATEGORIES.find(c => c.id === activity.category);
  const catColor = CATEGORY_COLORS[activity.category] || colors.primary;
  const catFields = CATEGORY_FIELDS[activity.category] || [];
  const catData = activity.category_data || {};

  const openUrl = (url: string) => {
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else Linking.openURL(url);
  };

  const renderFieldValue = (key: string, type: string): string | null => {
    // Handle place fields (stored as key_name, key_lat, key_lng)
    if (type === 'place') {
      return catData[`${key}_name`] || null;
    }
    const val = catData[key];
    if (!val) return null;
    if (type === 'date') return formatDE(val);
    return String(val);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1} onStartShouldSetResponder={() => true}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Category badge */}
            <View style={[styles.categoryBadge, { backgroundColor: catColor + '15' }]}>
              <Text style={styles.categoryIcon}>{getActivityIcon(activity.category, catData)}</Text>
              <Text style={[styles.categoryLabel, { color: catColor }]}>{cat?.label || activity.category}</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{activity.title}</Text>

            {/* Time */}
            {activity.start_time && (
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>🕐</Text>
                <Text style={styles.infoText}>{activity.start_time} Uhr</Text>
              </View>
            )}

            {/* Location */}
            {activity.location_name && (
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📍</Text>
                <Text style={[styles.infoText, { flex: 1 }]}>{activity.location_name}</Text>
                {activity.location_lat && activity.location_lng && (
                  <TouchableOpacity
                    onPress={() => openInGoogleMaps(activity.location_lat!, activity.location_lng!, activity.location_name || undefined)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.mapsLinkIcon}>↗</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {activity.location_address && activity.location_address !== activity.location_name && (
              <Text style={styles.addressText}>{activity.location_address}</Text>
            )}

            {/* External links */}
            {catData.google_maps_url && (
              <TouchableOpacity onPress={() => openUrl(catData.google_maps_url)} style={styles.linkRow}>
                <Text style={styles.linkText}>Auf Google Maps anzeigen</Text>
              </TouchableOpacity>
            )}
            {activity.category === 'hotel' && catData.booking_url && (
              <TouchableOpacity onPress={() => openUrl(catData.booking_url)} style={styles.linkRow}>
                <Text style={styles.linkText}>Hotel suchen</Text>
              </TouchableOpacity>
            )}

            {/* Category details */}
            {catFields.length > 0 && (
              <View style={styles.detailsSection}>
                <Text style={styles.sectionLabel}>Details</Text>
                {catFields.map(field => {
                  const value = renderFieldValue(field.key, field.type);
                  if (!value) return null;
                  return (
                    <View key={field.key} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{field.label}</Text>
                      <Text style={styles.detailValue}>{linkifyText(value)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Notes */}
            {activity.description && (
              <View style={styles.notesSection}>
                <Text style={styles.sectionLabel}>Notizen</Text>
                <Text style={styles.notesText}>{linkifyText(activity.description)}</Text>
              </View>
            )}

            {/* Documents */}
            <DocumentPicker
              activityId={activity.id}
              tripId={activity.trip_id}
              userId={userId || ''}
              readOnly={!isEditor}
            />
          </ScrollView>

          {/* Action bar */}
          <View style={styles.actionBar}>
            {isEditor && (
              <>
                <TouchableOpacity style={styles.actionBtn} onPress={() => { onClose(); onEdit(activity); }}>
                  <Text style={styles.editIcon}>✏️</Text>
                  <Text style={styles.actionText}>Bearbeiten</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => { onClose(); onDelete(activity.id); }}>
                  <Text style={styles.deleteIcon}>🗑️</Text>
                  <Text style={[styles.actionText, { color: colors.error }]}>Löschen</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[styles.actionBtn, styles.closeBtn]} onPress={onClose}>
              <Text style={styles.closeText}>Schliessen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '90%',
    maxWidth: 440,
    maxHeight: '80%',
    ...shadows.lg,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  categoryIcon: { fontSize: 16, marginRight: spacing.xs },
  categoryLabel: { ...typography.bodySmall, fontWeight: '600' },
  title: { ...typography.h2, marginBottom: spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  infoIcon: { fontSize: 16, marginRight: spacing.sm, width: 24 },
  infoText: { ...typography.body, flex: 1 },
  addressText: { ...typography.bodySmall, color: colors.textSecondary, marginLeft: 24 + spacing.sm, marginBottom: spacing.sm, marginTop: -spacing.xs },
  linkRow: { marginLeft: 24 + spacing.sm, marginBottom: spacing.xs },
  linkText: { ...typography.bodySmall, color: colors.primary, textDecorationLine: 'underline' },
  detailsSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sectionLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs + 2 },
  detailLabel: { ...typography.bodySmall, color: colors.textSecondary },
  detailValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  notesSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  notesText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  documentsSection: {},
  actionBar: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.md, gap: spacing.xs },
  editIcon: { fontSize: 14 },
  deleteIcon: { fontSize: 14 },
  actionText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  closeBtn: { backgroundColor: colors.background },
  closeText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  mapsLinkIcon: { fontSize: 16, color: colors.textLight, marginLeft: spacing.xs },
});
