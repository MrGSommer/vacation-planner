import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Activity } from '../../types/database';
import { FlightInfo } from '../../utils/flightLookup';
import { getFlightStatusLabel } from '../../hooks/useFlightStatus';
import { ACTIVITY_CATEGORIES, getActivityIcon } from '../../utils/constants';
import { CATEGORY_FIELDS, CATEGORY_COLORS, getTransportFields } from '../../utils/categoryFields';
import { DocumentPicker } from './DocumentPicker';
import { openInGoogleMaps } from '../../utils/openInMaps';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { linkifyText, openExternalUrl } from '../../utils/linkify';

interface Props {
  visible: boolean;
  activity: Activity | null;
  onClose: () => void;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
  isEditor?: boolean;
  userId?: string;
  flightStatus?: FlightInfo;
}

function formatDE(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export const ActivityViewModal: React.FC<Props> = ({
  visible, activity, onClose, onEdit, onDelete, isEditor = true, userId, flightStatus,
}) => {
  if (!activity) return null;

  const cat = ACTIVITY_CATEGORIES.find(c => c.id === activity.category);
  const catColor = CATEGORY_COLORS[activity.category] || colors.primary;
  const catData = activity.category_data || {};
  const baseFields = CATEGORY_FIELDS[activity.category] || [];
  // For transport: also include type-specific fields (departure_station, arrival_station, etc.)
  const catFields = activity.category === 'transport'
    ? [...baseFields, ...getTransportFields(catData.transport_type)]
    : baseFields;

  const renderFieldValue = (key: string, type: string): string | null => {
    // Handle place/airport fields (stored as key_name, key_lat, key_lng)
    if (type === 'place' || type === 'airport') {
      return catData[`${key}_name`] || catData[key] || null;
    }
    // For select fields, just show the value directly
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
                    onPress={() => openInGoogleMaps(activity.location_lat!, activity.location_lng!, activity.location_name || undefined, activity.location_address || undefined)}
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
              <TouchableOpacity onPress={() => openExternalUrl(catData.google_maps_url)} style={styles.linkRow}>
                <Text style={styles.linkText}>Auf Google Maps anzeigen</Text>
              </TouchableOpacity>
            )}
            {activity.category === 'hotel' && catData.booking_url && (
              <TouchableOpacity onPress={() => openExternalUrl(catData.booking_url)} style={styles.linkRow}>
                <Text style={styles.linkText}>Hotel suchen</Text>
              </TouchableOpacity>
            )}

            {/* Flight status badge + live details */}
            {activity.category === 'transport' && catData.transport_type === 'Flug' && catData.flight_verified && (() => {
              const hasLive = flightStatus?.found;
              const { label: statusLabel, color: statusColor } = hasLive
                ? getFlightStatusLabel(flightStatus!.status)
                : { label: 'Geplant', color: '#3498DB' };
              const depTime = flightStatus?.dep_time_local?.split(/[T ]/)[1]?.substring(0, 5);
              const arrTime = flightStatus?.arr_time_local?.split(/[T ]/)[1]?.substring(0, 5);
              return (
                <View style={styles.flightSection}>
                  <View style={styles.flightSectionHeader}>
                    <Text style={styles.sectionLabel}>{hasLive ? 'Flugstatus (Live)' : 'Flugstatus'}</Text>
                    {statusLabel ? (
                      <View style={[styles.flightBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[styles.flightBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  {hasLive && (
                    <>
                      <View style={styles.flightRoute}>
                        <View style={styles.flightAirport}>
                          <Text style={styles.flightCode}>{flightStatus!.dep_airport || '—'}</Text>
                          <Text style={styles.flightCity}>{flightStatus!.dep_city || ''}</Text>
                          {depTime ? <Text style={styles.flightTime}>{depTime}</Text> : null}
                          {flightStatus!.dep_terminal && (
                            <Text style={styles.flightTerminal}>T{flightStatus!.dep_terminal}{flightStatus!.dep_gate ? ` Gate ${flightStatus!.dep_gate}` : ''}</Text>
                          )}
                        </View>
                        <View style={styles.flightArrow}>
                          <Text style={styles.flightArrowIcon}>{'✈'}</Text>
                          {flightStatus!.duration_min ? (
                            <Text style={styles.flightDuration}>
                              {Math.floor(flightStatus!.duration_min / 60)}h{String(flightStatus!.duration_min % 60).padStart(2, '0')}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.flightAirport}>
                          <Text style={styles.flightCode}>{flightStatus!.arr_airport || '—'}</Text>
                          <Text style={styles.flightCity}>{flightStatus!.arr_city || ''}</Text>
                          {arrTime ? <Text style={styles.flightTime}>{arrTime}</Text> : null}
                          {flightStatus!.arr_terminal && (
                            <Text style={styles.flightTerminal}>T{flightStatus!.arr_terminal}{flightStatus!.arr_gate ? ` Gate ${flightStatus!.arr_gate}` : ''}</Text>
                          )}
                        </View>
                      </View>
                      {(flightStatus!.airline_name || flightStatus!.aircraft) && (
                        <View style={styles.flightMeta}>
                          {flightStatus!.airline_name && <Text style={styles.flightMetaText}>{flightStatus!.airline_name}</Text>}
                          {flightStatus!.aircraft && <Text style={styles.flightMetaText}>{flightStatus!.aircraft}</Text>}
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })()}

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
  flightSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  flightSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  flightBadge: { paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderRadius: borderRadius.full },
  flightBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  flightRoute: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  flightAirport: { alignItems: 'center', flex: 1 },
  flightCode: { fontSize: 20, fontWeight: '700', color: colors.text },
  flightCity: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  flightTime: { ...typography.body, fontWeight: '600', color: colors.primary, marginTop: 4 },
  flightTerminal: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  flightArrow: { alignItems: 'center', justifyContent: 'center', paddingTop: 4, paddingHorizontal: spacing.sm },
  flightArrowIcon: { fontSize: 18, color: colors.textLight },
  flightDuration: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  flightMeta: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  flightMetaText: { ...typography.caption, color: colors.textLight },
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
