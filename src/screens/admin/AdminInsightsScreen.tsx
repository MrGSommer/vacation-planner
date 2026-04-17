import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Card } from '../../components/common';
import {
  adminGetLiveSnapshot,
  adminGetFunnelStats,
  adminListInsightsReports,
  adminGenerateInsightsReport,
  adminGetFableTopUsers,
  adminGetRecentViolations,
  adminGetSuspendedUsers,
  adminSetFableSuspension,
  adminGetSubscriptionStats,
} from '../../api/analytics';
import { adminGetRevenueStats } from '../../api/admin';
import { colors, spacing, borderRadius, typography } from '../../utils/theme';
import type {
  LiveSnapshot, FunnelStats, InsightsReport,
  FableTopUser, RateLimitViolation, SuspendedUser,
  SubscriptionStats,
} from '../../types/analytics';
import type { RevenueStats } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminInsights'> };

const REFRESH_INTERVAL_MS = 30_000;

export const AdminInsightsScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [funnel, setFunnel] = useState<FunnelStats | null>(null);
  const [reports, setReports] = useState<InsightsReport[]>([]);
  const [topUsers, setTopUsers] = useState<FableTopUser[]>([]);
  const [violations, setViolations] = useState<RateLimitViolation[]>([]);
  const [suspended, setSuspended] = useState<SuspendedUser[]>([]);
  const [subStats, setSubStats] = useState<SubscriptionStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFocus, setReportFocus] = useState<'full'|'funnel'|'retention'|'monetization'|'engagement'>('full');
  const [reportError, setReportError] = useState<string | null>(null);
  const [suspendBusy, setSuspendBusy] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [snap, fun, reps, top, vios, susp, sStats] = await Promise.all([
        adminGetLiveSnapshot(),
        adminGetFunnelStats(),
        adminListInsightsReports(10),
        adminGetFableTopUsers(7),
        adminGetRecentViolations(24),
        adminGetSuspendedUsers(),
        adminGetSubscriptionStats(),
      ]);
      setSnapshot(snap);
      setFunnel(fun);
      setReports(reps);
      setTopUsers(top);
      setViolations(vios);
      setSuspended(susp);
      setSubStats(sStats);
      // Revenue from Stripe API — load async, don't block render
      adminGetRevenueStats().then(setRevenue).catch((e) => console.error('Revenue stats error:', e));
    } catch (e) {
      console.error('Insights load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadFable = useCallback(async () => {
    try {
      const [top, vios, susp] = await Promise.all([
        adminGetFableTopUsers(7),
        adminGetRecentViolations(24),
        adminGetSuspendedUsers(),
      ]);
      setTopUsers(top);
      setViolations(vios);
      setSuspended(susp);
    } catch (e) {
      console.error('Fable reload error:', e);
    }
  }, []);

  const handleSuspend = useCallback(async (userId: string, hours: number | null) => {
    setSuspendBusy(userId);
    try {
      const until = hours === null ? null : new Date(Date.now() + hours * 3600_000);
      await adminSetFableSuspension(userId, until, hours === null ? undefined : `manual: ${hours}h via AdminInsights`);
      await reloadFable();
    } catch (e) {
      console.error('Suspension change failed:', e);
    } finally {
      setSuspendBusy(null);
    }
  }, [reloadFable]);

  // Fast-refresh live snapshot only
  const refreshLive = useCallback(async () => {
    try {
      const snap = await adminGetLiveSnapshot();
      setSnapshot(snap);
    } catch {}
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const id = setInterval(refreshLive, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshLive]);

  const handleGenerateReport = async () => {
    setReportLoading(true);
    setReportError(null);
    try {
      const report = await adminGenerateInsightsReport({ focus: reportFocus });
      setReports((prev) => [report, ...prev].slice(0, 10));
    } catch (e: any) {
      setReportError(e?.message || 'Fehler beim Generieren');
    } finally {
      setReportLoading(false);
    }
  };

  const fmtPct = (n: number) => `${Math.round(n * 1000) / 10}%`;

  return (
    <AdminGuard>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Profile' } as any)} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Insights & Analytics</Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Lade Daten…</Text>
          </View>
        ) : (
          <>
            {/* ----- Live Dashboard ----- */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Live-Dashboard</Text>
                <Text style={styles.liveLabel}>● aktualisiert alle 30s</Text>
              </View>
              <View style={styles.tileGrid}>
                <Tile label="Aktive Sessions" value={snapshot?.active_sessions_last_30min ?? 0} sub="letzte 30 min" color={colors.primary} />
                <Tile label="Events" value={snapshot?.events_last_24h ?? 0} sub="letzte 24 h" color={colors.accent} />
                <Tile label="Signups heute" value={snapshot?.new_signups_today ?? 0} color={colors.success} />
                <Tile label="Käufe heute" value={snapshot?.purchases_today ?? 0} color={colors.secondary} />
                <Tile label="Fehler" value={snapshot?.errors_last_1h ?? 0} sub="letzte 1 h" color={colors.error} />
              </View>

              {snapshot && snapshot.top_current_paths.length > 0 && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Top-Pfade (letzte Stunde)</Text>
                  {snapshot.top_current_paths.map((p, idx) => (
                    <View key={idx} style={styles.pathRow}>
                      <Text style={styles.pathName} numberOfLines={1}>{p.path}</Text>
                      <Text style={styles.pathCount}>{p.count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {/* ----- Funnel ----- */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Funnel — letzte 30 Tage</Text>
                {funnel && !funnel.data_sufficient && (
                  <Text style={styles.warning}>⚠ zu wenig Daten (N&lt;{funnel.min_sample_threshold})</Text>
                )}
              </View>
              {funnel?.stages.map((s) => (
                <View key={s.stage} style={styles.funnelRow}>
                  <Text style={styles.funnelStage}>{stageLabel(s.stage)}</Text>
                  <View style={styles.funnelBarWrap}>
                    <View style={[styles.funnelBar, { width: `${Math.min(100, (s.count / Math.max(1, funnel.stages[0].count)) * 100)}%` }]} />
                  </View>
                  <Text style={styles.funnelCount}>{s.count}</Text>
                  <View style={[styles.sampleBadge, !s.data_sufficient && styles.sampleBadgeWeak]}>
                    <Text style={[styles.sampleBadgeText, !s.data_sufficient && styles.sampleBadgeTextWeak]}>
                      N={s.sample_size}
                    </Text>
                  </View>
                </View>
              ))}
              {funnel && (
                <Text style={styles.overallText}>Visitor→Paid: {fmtPct(funnel.overall_visitor_to_paid)}</Text>
              )}
            </Card>

            {/* ----- Revenue & Abonnements ----- */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Revenue & Abonnements</Text>

              {/* Revenue tiles (from Stripe API) */}
              <View style={styles.tileGrid}>
                <Tile label="MRR" value={revenue ? formatCHF(revenue.mrr) : '…'} color={colors.secondary} isText />
                <Tile label="Umsatz (Netto)" value={revenue ? formatCHF(revenue.total_revenue_net) : '…'} color={colors.success} isText />
                <Tile label="Aktive Abos" value={revenue?.active_subscriptions ?? '…'} color={colors.primary} isText={!revenue} />
                <Tile label="Stripe-Gebühren" value={revenue ? formatCHF(revenue.total_fees) : '…'} color={colors.error} isText />
              </View>

              {/* Subscription tier breakdown */}
              {subStats && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Abo-Verteilung ({subStats.tier_breakdown.total} User)</Text>
                  <View style={styles.tierGrid}>
                    <TierPill label="Free" count={subStats.tier_breakdown.free_users} color={colors.textSecondary} />
                    <TierPill label="Premium" count={subStats.tier_breakdown.premium_active} color={colors.secondary} />
                    <TierPill label="Trialing" count={subStats.tier_breakdown.trialing} color={colors.accent} />
                    <TierPill label="Past Due" count={subStats.tier_breakdown.past_due} color={colors.warning} />
                    <TierPill label="Canceled" count={subStats.tier_breakdown.canceled} color={colors.error} />
                    <TierPill label="Free + Credits" count={subStats.tier_breakdown.free_with_credits} color={colors.sky} />
                  </View>
                </View>
              )}

              {/* Monetization events summary */}
              {subStats && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Monetarisierung</Text>
                  <View style={styles.monetGrid}>
                    <View style={styles.monetCol}>
                      <Text style={styles.monetPeriod}>7 Tage</Text>
                      <Text style={styles.monetRow}>+{subStats.events_7d.purchases_7d} Abos</Text>
                      <Text style={styles.monetRow}>-{subStats.events_7d.cancellations_7d} Kündigungen</Text>
                      <Text style={styles.monetRow}>{subStats.events_7d.inspirations_7d} Inspirationen</Text>
                    </View>
                    <View style={styles.monetCol}>
                      <Text style={styles.monetPeriod}>30 Tage</Text>
                      <Text style={styles.monetRow}>+{subStats.events_30d.purchases_30d} Abos</Text>
                      <Text style={styles.monetRow}>-{subStats.events_30d.cancellations_30d} Kündigungen</Text>
                      <Text style={styles.monetRow}>{subStats.events_30d.inspirations_30d} Inspirationen</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Paywall trigger breakdown */}
              {subStats && subStats.paywall.shown_30d > 0 && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Paywall-Trigger (30 Tage · {subStats.paywall.shown_30d}x gezeigt)</Text>
                  {Object.entries(subStats.paywall.trigger_breakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([trigger, count]) => (
                      <View key={trigger} style={styles.pathRow}>
                        <Text style={styles.pathName}>{triggerLabel(trigger)}</Text>
                        <Text style={styles.pathCount}>{count}</Text>
                      </View>
                    ))}
                </View>
              )}

              {/* Recent monetization events timeline */}
              {subStats && subStats.recent_events.length > 0 && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Letzte Events</Text>
                  {subStats.recent_events.slice(0, 10).map((evt, idx) => (
                    <View key={idx} style={styles.recentEventRow}>
                      <Text style={styles.recentEventIcon}>
                        {evt.event_name === 'subscription_purchased' ? '💎' :
                         evt.event_name === 'subscription_cancelled' ? '🚪' : '✨'}
                      </Text>
                      <Text style={styles.recentEventLabel} numberOfLines={1}>
                        {evt.event_name === 'subscription_purchased' ? 'Abo gekauft' :
                         evt.event_name === 'subscription_cancelled' ? 'Abo gekündigt' : 'Inspirationen gekauft'}
                        {evt.properties?.amount_chf ? ` · CHF ${evt.properties.amount_chf}` : ''}
                      </Text>
                      <Text style={styles.recentEventTime}>
                        {new Date(evt.created_at).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {/* ----- Fable-Usage & Missbrauch ----- */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Fable-Usage & Missbrauch</Text>
                {suspended.length > 0 && (
                  <Text style={styles.warning}>⚠ {suspended.length} gesperrt</Text>
                )}
              </View>

              {/* Suspended users */}
              {suspended.length > 0 && (
                <View style={styles.subBlock}>
                  <Text style={styles.subTitle}>Aktuell gesperrt</Text>
                  {suspended.map((s) => (
                    <View key={s.user_id} style={styles.suspendedRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>{s.name.trim() || '—'} · {s.email || '—'}</Text>
                        <Text style={styles.userMeta}>
                          bis {new Date(s.fable_suspended_until).toLocaleString('de-CH')} · {s.violations_7d} Violations/7d
                        </Text>
                        {s.fable_suspension_reason && (
                          <Text style={styles.userMeta} numberOfLines={1}>Grund: {s.fable_suspension_reason}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleSuspend(s.user_id, null)}
                        disabled={suspendBusy === s.user_id}
                        style={[styles.actionBtnSm, styles.unsuspendBtn]}
                      >
                        <Text style={styles.actionBtnSmText}>Entsperren</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Top users */}
              <View style={styles.subBlock}>
                <Text style={styles.subTitle}>Top-10 Fable-Nutzer (letzte 7 Tage)</Text>
                {topUsers.length === 0 ? (
                  <Text style={styles.emptyText}>Keine Aktivität</Text>
                ) : (
                  topUsers.map((u) => (
                    <View key={u.user_id} style={styles.topUserRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>
                          {u.name.trim() || '—'} · {u.email || '—'}
                          {u.is_admin ? ' 🛡' : ''}
                          {u.subscription_tier === 'premium' ? ' ✨' : ''}
                        </Text>
                        <Text style={styles.userMeta}>
                          {u.total_calls} Calls · 24h: {u.calls_24h} · 1h: {u.calls_1h}
                          {u.fable_suspended_until ? ' · gesperrt' : ''}
                        </Text>
                      </View>
                      {!u.is_admin && !u.fable_suspended_until && (
                        <TouchableOpacity
                          onPress={() => handleSuspend(u.user_id, 24)}
                          disabled={suspendBusy === u.user_id}
                          style={[styles.actionBtnSm, styles.suspendBtn]}
                        >
                          <Text style={styles.actionBtnSmText}>24h sperren</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>

              {/* Recent violations */}
              <View style={styles.subBlock}>
                <Text style={styles.subTitle}>Violations letzte 24h ({violations.length})</Text>
                {violations.length === 0 ? (
                  <Text style={styles.emptyText}>Keine Violations — sauber.</Text>
                ) : (
                  violations.slice(0, 20).map((v) => (
                    <View key={v.id} style={styles.violationRow}>
                      <Text style={styles.violationType}>
                        {v.violation_type === 'burst' ? '💥' : v.violation_type === 'minute' ? '⏱' : v.violation_type === 'hour' ? '⏲' : v.violation_type === 'day' ? '📅' : v.violation_type === 'month' ? '📆' : '⚠'} {v.violation_type}
                      </Text>
                      <Text style={styles.violationUser} numberOfLines={1}>
                        {v.name.trim() || v.email || v.user_id.slice(0, 8)}
                      </Text>
                      <Text style={styles.violationTime}>
                        {new Date(v.occurred_at).toLocaleTimeString('de-CH')}
                      </Text>
                    </View>
                  ))
                )}
                {violations.length > 20 && (
                  <Text style={styles.emptyText}>… {violations.length - 20} weitere</Text>
                )}
              </View>
            </Card>

            {/* ----- AI Report ----- */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>KI-Insight Report</Text>
              <View style={styles.focusRow}>
                {(['full','funnel','retention','monetization','engagement'] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setReportFocus(f)}
                    style={[styles.focusChip, reportFocus === f && styles.focusChipActive]}
                  >
                    <Text style={[styles.focusChipText, reportFocus === f && styles.focusChipTextActive]}>
                      {f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.generateBtn}
                onPress={handleGenerateReport}
                disabled={reportLoading}
                activeOpacity={0.8}
              >
                {reportLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.generateBtnText}>Neuen Report generieren</Text>
                )}
              </TouchableOpacity>
              {reportLoading && (
                <Text style={styles.loadingHint}>Analysiere Daten mit Fable… (~15s)</Text>
              )}
              {reportError && (
                <Text style={styles.errorText}>Fehler: {reportError}</Text>
              )}

              {reports.length === 0 ? (
                <Text style={styles.emptyText}>Noch kein Report vorhanden. Generiere den ersten oben.</Text>
              ) : (
                reports.map((r) => <ReportCard key={r.id} report={r} />)
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </AdminGuard>
  );
};

const Tile: React.FC<{ label: string; value: number | string; sub?: string; color: string; isText?: boolean }> = ({ label, value, sub, color, isText }) => (
  <View style={styles.tile}>
    <Text style={[isText || typeof value === 'string' ? styles.tileValueText : styles.tileValue, { color }]}>{value}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
    {sub && <Text style={styles.tileSub}>{sub}</Text>}
  </View>
);

const TierPill: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <View style={[styles.tierPill, { borderColor: color + '60', backgroundColor: color + '15' }]}>
    <Text style={[styles.tierPillCount, { color }]}>{count}</Text>
    <Text style={styles.tierPillLabel}>{label}</Text>
  </View>
);

const formatCHF = (cents: number) => `CHF ${(cents / 100).toFixed(2)}`;

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case 'second_trip_attempt': return 'Zweite Reise';
    case 'second_collaborator_attempt': return 'Zweiter Kollaborateur';
    case 'photo_limit_reached': return 'Foto-Limit';
    case 'stops_feature': return 'Stops-Feature';
    case 'fable_without_credits': return 'Fable (keine Credits)';
    case 'budget_feature': return 'Budget-Feature';
    default: return trigger;
  }
}

const ReportCard: React.FC<{ report: InsightsReport }> = ({ report }) => {
  const [expanded, setExpanded] = useState(false);
  const d = new Date(report.created_at);
  const dateStr = `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;

  return (
    <View style={styles.reportCard}>
      <TouchableOpacity style={styles.reportHead} onPress={() => setExpanded(!expanded)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.reportDate}>{dateStr} · {report.focus} · {report.report_type}</Text>
          {report.summary && <Text style={styles.reportSummary} numberOfLines={expanded ? undefined : 2}>{report.summary}</Text>}
        </View>
        <Text style={styles.reportToggle}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.reportBody}>
          {report.findings.length > 0 && (
            <>
              <Text style={styles.reportSectionTitle}>Findings</Text>
              {report.findings.map((f, i) => (
                <View key={i} style={styles.findingRow}>
                  <Text style={styles.findingTitle}>
                    {f.severity === 'critical' ? '🚨' : f.severity === 'warning' ? '⚠' : 'ℹ'} {f.title}
                  </Text>
                  <Text style={styles.findingDesc}>{f.description}</Text>
                  {f.evidence && <Text style={styles.findingEvidence}>Evidenz: {f.evidence}</Text>}
                </View>
              ))}
            </>
          )}

          {report.actions.length > 0 ? (
            <>
              <Text style={styles.reportSectionTitle}>Empfohlene Massnahmen</Text>
              {report.actions.map((a, i) => (
                <View key={i} style={styles.actionRow}>
                  <View style={[styles.sizeBadge, sizeStyle(a.size)]}>
                    <Text style={styles.sizeBadgeText}>{a.size}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>{a.title}</Text>
                    <Text style={styles.actionMeta}>Impact: {a.impact} · Effort: {a.effort} · Confidence: {a.confidence}</Text>
                    {a.benchmark_ref && <Text style={styles.actionBenchmark}>📊 {a.benchmark_ref}</Text>}
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.noActionText}>Keine Maßnahme empfohlen — Status quo ist in Ordnung.</Text>
          )}

          {report.data_gaps.length > 0 && (
            <View style={styles.dataGapsBox}>
              <Text style={styles.dataGapsTitle}>📉 Datenlücken</Text>
              {report.data_gaps.map((g, i) => (
                <Text key={i} style={styles.dataGapItem}>
                  • {g.metric}: N={g.current_sample} / benötigt {g.required_sample} — {g.blocker}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

function stageLabel(stage: string): string {
  switch (stage) {
    case 'visitors': return 'Besucher';
    case 'plan_generated': return 'Plan generiert';
    case 'signup_click': return 'Signup-Klick';
    case 'signups': return 'Signups';
    case 'activated': return 'Aktiviert';
    case 'purchased': return 'Purchased';
    default: return stage;
  }
}

function sizeStyle(size: 'S'|'M'|'L'|'XL') {
  switch (size) {
    case 'S': return { backgroundColor: colors.success + '20', borderColor: colors.success };
    case 'M': return { backgroundColor: colors.sky + '20', borderColor: colors.sky };
    case 'L': return { backgroundColor: colors.warning + '20', borderColor: colors.warning };
    case 'XL': return { backgroundColor: colors.error + '20', borderColor: colors.error };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 900, alignSelf: 'center', width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1 },
  loadingWrap: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },

  sectionCard: { marginBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.h3 },
  liveLabel: { ...typography.caption, color: colors.success },
  warning: { ...typography.caption, color: colors.warning, fontWeight: '600' },

  // Tiles
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flex: 1, minWidth: 130, paddingVertical: spacing.md, alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.md },
  tileValue: { fontSize: 28, fontWeight: '700' },
  tileLabel: { ...typography.bodySmall, marginTop: spacing.xs, fontWeight: '500' },
  tileSub: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  subBlock: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  subTitle: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  pathRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  pathName: { ...typography.caption, color: colors.textSecondary, flex: 1, marginRight: spacing.sm },
  pathCount: { ...typography.caption, fontWeight: '600', color: colors.text },

  tileValueText: { fontSize: 18, fontWeight: '700' },

  // Revenue & Abonnements
  tierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm, borderWidth: 1 },
  tierPillCount: { fontSize: 16, fontWeight: '700' },
  tierPillLabel: { ...typography.caption, color: colors.textSecondary },
  monetGrid: { flexDirection: 'row', gap: spacing.xl },
  monetCol: { flex: 1 },
  monetPeriod: { ...typography.bodySmall, fontWeight: '700', marginBottom: spacing.xs },
  monetRow: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  recentEventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: spacing.sm },
  recentEventIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  recentEventLabel: { ...typography.caption, flex: 1, color: colors.textSecondary },
  recentEventTime: { ...typography.caption, color: colors.textLight, fontVariant: ['tabular-nums'] },

  // Funnel
  funnelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  funnelStage: { ...typography.bodySmall, width: 120 },
  funnelBarWrap: { flex: 1, height: 16, backgroundColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  funnelBar: { height: '100%', backgroundColor: colors.primary },
  funnelCount: { ...typography.caption, fontWeight: '700', width: 48, textAlign: 'right' },
  sampleBadge: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: borderRadius.xs, backgroundColor: colors.success + '20' },
  sampleBadgeWeak: { backgroundColor: colors.warning + '20' },
  sampleBadgeText: { ...typography.caption, color: colors.success, fontWeight: '600', fontSize: 10 },
  sampleBadgeTextWeak: { color: colors.warning },
  overallText: { ...typography.body, fontWeight: '600', marginTop: spacing.md, textAlign: 'right', color: colors.text },

  // Report controls
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.sm },
  focusChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  focusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  focusChipText: { ...typography.caption, color: colors.textSecondary },
  focusChipTextActive: { color: '#FFF', fontWeight: '600' },
  generateBtn: { backgroundColor: colors.primary, paddingVertical: spacing.sm + 2, borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.sm },
  generateBtnText: { ...typography.button, color: '#FFF' },
  loadingHint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, fontStyle: 'italic' },
  errorText: { ...typography.caption, color: colors.error, marginTop: spacing.sm },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, fontStyle: 'italic' },

  // Report cards
  reportCard: { backgroundColor: colors.background, borderRadius: borderRadius.md, marginTop: spacing.md, overflow: 'hidden' },
  reportHead: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm, alignItems: 'center' },
  reportDate: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  reportSummary: { ...typography.bodySmall, marginTop: 4 },
  reportToggle: { ...typography.body, color: colors.primary },
  reportBody: { padding: spacing.md, paddingTop: 0 },
  reportSectionTitle: { ...typography.bodySmall, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs },

  findingRow: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  findingTitle: { ...typography.bodySmall, fontWeight: '600' },
  findingDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  findingEvidence: { ...typography.caption, color: colors.textLight, marginTop: 2, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-start' },
  sizeBadge: { width: 32, height: 32, borderRadius: borderRadius.xs, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sizeBadgeText: { ...typography.caption, fontWeight: '700' },
  actionTitle: { ...typography.bodySmall, fontWeight: '600' },
  actionMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  actionBenchmark: { ...typography.caption, color: colors.sky, marginTop: 2 },
  noActionText: { ...typography.bodySmall, color: colors.success, fontStyle: 'italic', marginTop: spacing.md },

  dataGapsBox: { backgroundColor: colors.warning + '15', padding: spacing.sm, borderRadius: borderRadius.sm, marginTop: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.warning },
  dataGapsTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.warning, marginBottom: spacing.xs },
  dataGapItem: { ...typography.caption, color: colors.text, marginBottom: 2 },

  // Fable abuse section
  suspendedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  topUserRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  userName: { ...typography.bodySmall, fontWeight: '600' },
  userMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  actionBtnSm: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  suspendBtn: { backgroundColor: colors.warning + '25', borderWidth: 1, borderColor: colors.warning },
  unsuspendBtn: { backgroundColor: colors.success + '25', borderWidth: 1, borderColor: colors.success },
  actionBtnSmText: { ...typography.caption, fontWeight: '600' },
  violationRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: spacing.sm },
  violationType: { ...typography.caption, fontWeight: '600', width: 80 },
  violationUser: { ...typography.caption, flex: 1, color: colors.textSecondary },
  violationTime: { ...typography.caption, color: colors.textLight, fontVariant: ['tabular-nums'] },
});
