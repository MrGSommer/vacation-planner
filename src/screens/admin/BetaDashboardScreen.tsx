import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Card } from '../../components/common';
import {
  adminGetAllFeedback, adminUpdateFeedbackStatus, FeedbackWithUser,
  adminGetBetaStats, BetaStats,
  getBetaTasks, createBetaTask, updateBetaTask, deleteBetaTask, BetaTask,
} from '../../api/betaDashboard';
import { adminGetSupportStats, adminGetSupportInsights, adminGetRecentConversations, adminGetEchoStats, EchoStats } from '../../api/support';
import { SupportInsight, SupportConversation } from '../../types/database';
import { BetaFeedback } from '../../api/feedback';
import { getDisplayName } from '../../utils/profileHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { RootStackParamList } from '../../types/navigation';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'BetaDashboard'> };

type Tab = 'feedback' | 'stats' | 'tasks' | 'insights';

const feedbackTypeLabels: Record<string, string> = { bug: 'Bug', feature: 'Feature', feedback: 'Feedback', question: 'Frage' };
const feedbackTypeColors: Record<string, string> = { bug: colors.error, feature: colors.accent, feedback: colors.sky, question: colors.warning };
const feedbackStatusLabels: Record<string, string> = { new: 'Neu', in_progress: 'In Bearbeitung', resolved: 'Erledigt', wont_fix: 'Abgelehnt' };
const feedbackStatuses: BetaFeedback['status'][] = ['new', 'in_progress', 'resolved', 'wont_fix'];

const taskStatusLabels: Record<string, string> = { open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt' };
const taskStatusFlow: Record<string, BetaTask['status']> = { open: 'in_progress', in_progress: 'done', done: 'open' };
const priorityColors: Record<string, string> = { low: colors.textLight, medium: colors.warning, high: colors.error };

const pct = (part: number, total: number) => total > 0 ? `${Math.round((part / total) * 100)}%` : '–';
const formatMs = (ms: number) => ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

export const BetaDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('feedback');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Feedback state
  const [feedbacks, setFeedbacks] = useState<FeedbackWithUser[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<BetaFeedback['status'] | 'all'>('all');
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);

  // Stats state
  const [stats, setStats] = useState<BetaStats | null>(null);

  // Tasks state
  const [tasks, setTasks] = useState<BetaTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [hideDone, setHideDone] = useState(false);

  // Insights state
  const [insightStats, setInsightStats] = useState<{
    total: number; resolved: number; resolution_rate: number;
    by_category: Record<string, number>;
    top_questions: { question: string; count: number }[];
    improvements: string[];
  } | null>(null);
  const [recentConversations, setRecentConversations] = useState<SupportConversation[]>([]);
  const [expandedConv, setExpandedConv] = useState<string | null>(null);
  const [echoStats, setEchoStats] = useState<EchoStats | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [fb, s, t, is, rc, es] = await Promise.all([
        adminGetAllFeedback(),
        adminGetBetaStats(),
        getBetaTasks(),
        adminGetSupportStats().catch(() => null),
        adminGetRecentConversations(20).catch(() => []),
        adminGetEchoStats().catch(() => null),
      ]);
      setFeedbacks(fb);
      setStats(s);
      setTasks(t);
      if (is) setInsightStats(is);
      setRecentConversations(rc);
      if (es) setEchoStats(es);
    } catch (e) {
      console.error('Beta dashboard load error:', e);
    }
  }, []);

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleFeedbackStatusChange = async (id: string, status: BetaFeedback['status']) => {
    try {
      await adminUpdateFeedbackStatus(id, status);
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status } : f));
    } catch (e) {
      console.error('Status update error:', e);
    }
  };

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    try {
      const task = await createBetaTask(title);
      setTasks(prev => [task, ...prev]);
      setNewTaskTitle('');
    } catch (e) {
      console.error('Task create error:', e);
    }
  };

  const handleToggleTaskStatus = async (task: BetaTask) => {
    const nextStatus = taskStatusFlow[task.status];
    try {
      const updated = await updateBetaTask(task.id, { status: nextStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch (e) {
      console.error('Task update error:', e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteBetaTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error('Task delete error:', e);
    }
  };

  // Computed
  const filteredFeedbacks = feedbackFilter === 'all' ? feedbacks : feedbacks.filter(f => f.status === feedbackFilter);
  const feedbackCounts = {
    new: feedbacks.filter(f => f.status === 'new').length,
    in_progress: feedbacks.filter(f => f.status === 'in_progress').length,
    resolved: feedbacks.filter(f => f.status === 'resolved').length,
  };

  const visibleTasks = hideDone ? tasks.filter(t => t.status !== 'done') : tasks;
  const openTasks = tasks.filter(t => t.status !== 'done').length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const renderStatsRow = (label: string, value: string | number, color?: string) => (
    <View style={styles.statsRow} key={label}>
      <Text style={styles.statsLabel}>{label}</Text>
      <Text style={[styles.statsValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );

  return (
    <AdminGuard>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Profile' } as any)} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'} Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Beta-Dashboard</Text>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {(['feedback', 'stats', 'tasks', 'insights'] as Tab[]).map(t => (
            <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'feedback' ? `Feedback (${feedbacks.length})` : t === 'stats' ? 'Performance' : t === 'tasks' ? `Tasks (${openTasks})` : 'Insights'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        ) : tab === 'feedback' ? (
          /* ===== FEEDBACK TAB ===== */
          <>
            <Text style={styles.feedbackCounts}>
              {feedbackCounts.new} Neu · {feedbackCounts.in_progress} In Bearbeitung · {feedbackCounts.resolved} Erledigt
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
              <TouchableOpacity
                style={[styles.filterChip, feedbackFilter === 'all' && styles.filterChipActive]}
                onPress={() => setFeedbackFilter('all')}
              >
                <Text style={[styles.filterChipText, feedbackFilter === 'all' && styles.filterChipTextActive]}>Alle</Text>
              </TouchableOpacity>
              {feedbackStatuses.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterChip, feedbackFilter === s && styles.filterChipActive]}
                  onPress={() => setFeedbackFilter(feedbackFilter === s ? 'all' : s)}
                >
                  <Text style={[styles.filterChipText, feedbackFilter === s && styles.filterChipTextActive]}>
                    {feedbackStatusLabels[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredFeedbacks.length === 0 ? (
              <Text style={styles.emptyText}>Kein Feedback gefunden</Text>
            ) : (
              filteredFeedbacks.map(fb => (
                <Card key={fb.id} style={styles.feedbackCard}>
                  <TouchableOpacity onPress={() => setExpandedFeedback(expandedFeedback === fb.id ? null : fb.id)}>
                    <View style={styles.feedbackHeader}>
                      <View style={[styles.typeBadge, { backgroundColor: feedbackTypeColors[fb.type] + '20' }]}>
                        <Text style={[styles.typeBadgeText, { color: feedbackTypeColors[fb.type] }]}>{feedbackTypeLabels[fb.type]}</Text>
                      </View>
                      <Text style={styles.feedbackTitle} numberOfLines={expandedFeedback === fb.id ? undefined : 1}>{fb.title}</Text>
                    </View>
                    <View style={styles.feedbackMeta}>
                      <Text style={styles.feedbackMetaText}>{getDisplayName(fb.profile)}</Text>
                      <Text style={styles.feedbackMetaDot}>·</Text>
                      <Text style={styles.feedbackMetaText}>{formatDate(fb.created_at)}</Text>
                      {fb.device_info && (
                        <>
                          <Text style={styles.feedbackMetaDot}>·</Text>
                          <Text style={styles.feedbackMetaText} numberOfLines={1}>{fb.device_info}</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>

                  {expandedFeedback === fb.id && (
                    <>
                      <Text style={styles.feedbackDescription}>{fb.description}</Text>
                      {fb.screen_name && <Text style={styles.feedbackScreen}>Screen: {fb.screen_name}</Text>}
                      {fb.app_version && <Text style={styles.feedbackScreen}>Version: {fb.app_version}</Text>}
                    </>
                  )}

                  <View style={styles.statusRow}>
                    {feedbackStatuses.map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.statusChip, fb.status === s && styles.statusChipActive]}
                        onPress={() => handleFeedbackStatusChange(fb.id, s)}
                      >
                        <Text style={[styles.statusChipText, fb.status === s && styles.statusChipTextActive]}>
                          {feedbackStatusLabels[s]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Card>
              ))
            )}
          </>
        ) : tab === 'stats' && stats ? (
          /* ===== PERFORMANCE TAB ===== */
          <>
            {/* Hero KPIs */}
            <View style={styles.kpiGrid}>
              {[
                { label: 'Benutzer', value: stats.total_users, color: colors.primary },
                { label: 'Premium', value: stats.premium_users, color: colors.secondary },
                { label: 'Conversion', value: `${stats.conversion_rate}%`, color: colors.success },
                { label: 'Reisen', value: stats.total_trips, color: colors.accent },
              ].map(kpi => (
                <Card key={kpi.label} style={styles.kpiCard}>
                  <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </Card>
              ))}
            </View>

            {/* Growth — "Hat die App Zukunft?" */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Wachstum</Text>
              <Text style={styles.sectionHint}>Registrierungen & Conversion</Text>
              {renderStatsRow('Heute', stats.signups_today)}
              {renderStatsRow('Letzte 7 Tage', stats.signups_7d)}
              {renderStatsRow('Letzte 30 Tage', stats.signups_30d)}
              <View style={styles.divider} />
              {renderStatsRow('Free → Premium', `${stats.conversion_rate}%`, colors.success)}
              {renderStatsRow('Trialing', stats.trialing_users, colors.accent)}
            </Card>

            {/* Engagement — "Kommen die User zurück?" */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Engagement</Text>
              <Text style={styles.sectionHint}>Aktive User (basierend auf App-Nutzung)</Text>
              {renderStatsRow('DAU (heute)', stats.dau)}
              {renderStatsRow('WAU (7 Tage)', stats.wau)}
              {renderStatsRow('MAU (30 Tage)', stats.mau)}
              <View style={styles.divider} />
              {renderStatsRow('DAU/MAU Ratio', stats.mau > 0 ? `${Math.round((stats.dau / stats.mau) * 100)}%` : '–', colors.primary)}
              <Text style={styles.insightText}>
                {stats.mau > 0 && stats.dau / stats.mau > 0.2 ? 'Gute Stickiness' : stats.mau > 0 ? 'Stickiness verbessern — Notifications / Reminders?' : 'Noch keine Daten'}
              </Text>
            </Card>

            {/* Feature Adoption — "Was nutzen die User?" */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Feature Adoption</Text>
              <Text style={styles.sectionHint}>Welche Features werden genutzt?</Text>
              {renderStatsRow('User mit Trips', `${stats.users_with_trips} / ${stats.total_users} (${pct(stats.users_with_trips, stats.total_users)})`, colors.primary)}
              {renderStatsRow('User mit Fable', `${stats.users_using_fable} / ${stats.total_users} (${pct(stats.users_using_fable, stats.total_users)})`, colors.accent)}
              <View style={styles.divider} />
              {renderStatsRow('Trips mit Programm', `${stats.total_activities > 0 ? '...' : '0'} Activities (Ø ${stats.avg_activities_per_trip}/Trip)`)}
              {renderStatsRow('Trips mit Packliste', `${stats.trips_with_packing} / ${stats.total_trips} (${pct(stats.trips_with_packing, stats.total_trips)})`)}
              {renderStatsRow('Trips mit Budget', `${stats.trips_with_budget} / ${stats.total_trips} (${pct(stats.trips_with_budget, stats.total_trips)})`)}
              {renderStatsRow('Trips mit Stops', `${stats.trips_with_stops} / ${stats.total_trips} (${pct(stats.trips_with_stops, stats.total_trips)})`)}
              {renderStatsRow('Trips mit Fotos', `${stats.trips_with_photos} / ${stats.total_trips} (${pct(stats.trips_with_photos, stats.total_trips)})`)}
            </Card>

            {/* Collaboration & Virality — "Wird die App geteilt?" */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Kollaboration & Viralität</Text>
              <Text style={styles.sectionHint}>Werden Trips geteilt? Laden User andere ein?</Text>
              {renderStatsRow('Einladungen gesendet', stats.total_invites)}
              {renderStatsRow('Einladungen akzeptiert', `${stats.accepted_invites} (${pct(stats.accepted_invites, stats.total_invites)})`, colors.success)}
              {renderStatsRow('Trips mit Kollaboration', `${stats.collab_trips} / ${stats.total_trips} (${pct(stats.collab_trips, stats.total_trips)})`)}
              <Text style={styles.insightText}>
                {stats.total_invites > 0 && stats.accepted_invites / stats.total_invites > 0.3
                  ? 'Gute Invite-Conversion — Viraler Loop funktioniert'
                  : stats.total_invites > 0
                  ? 'Invite-Acceptance niedrig — UX beim Einladungs-Flow prüfen'
                  : 'Noch keine Einladungen — Sharing prominenter platzieren?'}
              </Text>
            </Card>

            {/* AI / Fable — "Ist das AI-Feature der Differentiator?" */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Fable (AI)</Text>
              <Text style={styles.sectionHint}>Ist Fable der Grund, warum User bleiben?</Text>
              {renderStatsRow('Aufrufe heute', stats.ai_calls_today)}
              {renderStatsRow('Aufrufe 7 Tage', stats.ai_calls_7d)}
              {renderStatsRow('Aufrufe 30 Tage', stats.ai_calls_30d)}
              {renderStatsRow('Unique User (7d)', stats.ai_unique_users_7d)}
              <View style={styles.divider} />
              {renderStatsRow('Ø Antwortzeit', formatMs(stats.ai_avg_response_ms))}
              {renderStatsRow('Credits verbraucht (total)', stats.total_credits_consumed)}
              <View style={styles.divider} />
              <Text style={styles.subsectionTitle}>Task-Verteilung</Text>
              {renderStatsRow('Gespräche', stats.ai_conversations)}
              {renderStatsRow('Plan-Generierungen', stats.ai_plan_generations)}
              {renderStatsRow('Web-Suchen', stats.ai_web_searches)}
              {renderStatsRow('Agent-Aufrufe', stats.ai_agent_calls)}
              <Text style={styles.insightText}>
                {stats.ai_plan_generations > 0 && stats.ai_conversations / Math.max(stats.ai_plan_generations, 1) > 3
                  ? 'User chatten viel, generieren wenig Pläne — Conversion zu Plans verbessern?'
                  : stats.ai_plan_generations > 0
                  ? 'Gute Balance zwischen Chat und Plan-Generierung'
                  : 'Noch keine Plan-Generierungen'}
              </Text>
            </Card>

            {/* Content Depth — "Wie tief nutzen User die App?" */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Content-Tiefe</Text>
              <Text style={styles.sectionHint}>Wie intensiv wird geplant?</Text>
              {renderStatsRow('Trips erstellt (7d)', stats.trips_7d)}
              {renderStatsRow('Activities total', stats.total_activities)}
              {renderStatsRow('Ø Activities/Trip', stats.avg_activities_per_trip)}
              {renderStatsRow('Packing Items total', stats.total_packing_items)}
              {renderStatsRow('Fotos total', stats.total_photos)}
              <Text style={styles.insightText}>
                {stats.avg_activities_per_trip >= 3
                  ? 'User planen detailliert — hohes Commitment'
                  : stats.total_trips > 0
                  ? 'Wenig Inhalte pro Trip — Onboarding/Templates verbessern?'
                  : 'Noch keine Trips'}
              </Text>
            </Card>

            {/* Health */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Stabilität</Text>
              {renderStatsRow('Fehler heute', stats.errors_today, stats.errors_today > 10 ? colors.error : undefined)}
              {renderStatsRow('Fehler 7 Tage', stats.errors_7d)}
              {renderStatsRow('Kritische (7d)', stats.critical_errors_7d, stats.critical_errors_7d > 0 ? colors.error : colors.success)}
              {stats.top_error_components.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.subsectionTitle}>Top Fehlerquellen</Text>
                  {stats.top_error_components.map(e => renderStatsRow(e.component, e.count, colors.error))}
                </>
              )}
            </Card>

            {/* Feedback Summary */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Feedback</Text>
              {renderStatsRow('Total', stats.feedback_total)}
              {renderStatsRow('Offen', stats.feedback_open, stats.feedback_open > 5 ? colors.warning : undefined)}
              {renderStatsRow('Offene Bugs', stats.feedback_bugs, stats.feedback_bugs > 0 ? colors.error : colors.success)}
            </Card>
          </>
        ) : tab === 'stats' ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        ) : /* ===== TASKS TAB ===== */
          tab === 'tasks' ? (
          <>
            <View style={styles.addTaskRow}>
              <TextInput
                style={styles.addTaskInput}
                placeholder="Neuer Task..."
                placeholderTextColor={colors.textLight}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                onSubmitEditing={handleAddTask}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.addTaskBtn} onPress={handleAddTask}>
                <Text style={styles.addTaskBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.hideDoneRow} onPress={() => setHideDone(v => !v)}>
              <Text style={styles.hideDoneText}>
                {hideDone ? 'Erledigte anzeigen' : 'Erledigte ausblenden'} ({doneTasks})
              </Text>
            </TouchableOpacity>

            {visibleTasks.length === 0 ? (
              <Text style={styles.emptyText}>Keine Tasks</Text>
            ) : (
              visibleTasks.map(task => (
                <Card key={task.id} style={{ ...styles.taskCard, ...(task.status === 'done' ? styles.taskDone : {}) }}>
                  <View style={styles.taskRow}>
                    <TouchableOpacity style={styles.taskToggle} onPress={() => handleToggleTaskStatus(task)}>
                      <View style={[styles.taskCheckbox, task.status === 'done' && styles.taskCheckboxDone]}>
                        {task.status === 'done' && <Text style={styles.taskCheckmark}>{'✓'}</Text>}
                        {task.status === 'in_progress' && <Text style={styles.taskInProgressDot}>{'●'}</Text>}
                      </View>
                    </TouchableOpacity>
                    <View style={styles.taskContent}>
                      <View style={styles.taskTitleRow}>
                        <Text style={[styles.taskTitle, task.status === 'done' && styles.taskTitleDone]}>{task.title}</Text>
                        <View style={[styles.priorityBadge, { backgroundColor: priorityColors[task.priority] + '20' }]}>
                          <Text style={[styles.priorityText, { color: priorityColors[task.priority] }]}>{task.priority}</Text>
                        </View>
                      </View>
                      {task.description && <Text style={styles.taskDesc}>{task.description}</Text>}
                      <Text style={styles.taskMeta}>{taskStatusLabels[task.status]} · {formatDate(task.created_at)}</Text>
                    </View>
                    <TouchableOpacity style={styles.taskDeleteBtn} onPress={() => handleDeleteTask(task.id)}>
                      <Text style={styles.taskDeleteText}>{'×'}</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))
            )}
          </>
        ) : tab === 'insights' ? (
          /* ===== INSIGHTS TAB ===== */
          insightStats ? (
          <>
            {/* Echo-Bot Stats */}
            {echoStats && (
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Echo-Bot</Text>
                <Text style={styles.sectionHint}>Support-Chatbot Nutzung & Lösungsrate</Text>
                <View style={styles.kpiGrid}>
                  {[
                    { label: 'Gespräche', value: echoStats.total_conversations, color: colors.primary },
                    { label: 'Unique User', value: echoStats.unique_users, color: colors.secondary },
                    { label: 'Bot-Lösungsrate', value: `${echoStats.bot_resolution_rate}%`, color: colors.success },
                  ].map(kpi => (
                    <Card key={kpi.label} style={styles.kpiCard}>
                      <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                      <Text style={styles.kpiLabel}>{kpi.label}</Text>
                    </Card>
                  ))}
                </View>
                {renderStatsRow('Heute', echoStats.conversations_today)}
                {renderStatsRow('Letzte 7 Tage', echoStats.conversations_7d)}
                {renderStatsRow('Eskaliert', echoStats.escalated, echoStats.escalated > 0 ? colors.warning : undefined)}
                {renderStatsRow('Ø Nachrichten/Gespräch', echoStats.avg_messages_per_conv)}
                <Text style={styles.insightText}>
                  {echoStats.bot_resolution_rate >= 70
                    ? 'Starke Bot-Lösungsrate — Echo löst die meisten Anfragen selbst'
                    : echoStats.bot_resolution_rate >= 40
                    ? 'Moderate Lösungsrate — Knowledge-Base erweitern für bessere Ergebnisse'
                    : echoStats.total_conversations > 0
                    ? 'Niedrige Lösungsrate — Prompts und FAQ-Abdeckung verbessern'
                    : 'Noch keine Gespräche'}
                </Text>
              </Card>
            )}

            {/* KPI Row */}
            <View style={styles.kpiGrid}>
              {[
                { label: 'Gespräche', value: insightStats.total, color: colors.primary },
                { label: 'Lösungsrate', value: `${insightStats.resolution_rate}%`, color: colors.success },
                { label: 'Top-Kategorie', value: Object.entries(insightStats.by_category).sort(([,a],[,b]) => b - a)[0]?.[0] || '–', color: colors.accent },
              ].map(kpi => (
                <Card key={kpi.label} style={styles.kpiCard}>
                  <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </Card>
              ))}
            </View>

            {/* Category Distribution */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Kategorie-Verteilung</Text>
              {Object.entries(insightStats.by_category)
                .sort(([,a],[,b]) => b - a)
                .map(([cat, count]) => (
                  <View key={cat} style={styles.statsRow}>
                    <Text style={styles.statsLabel}>{cat}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <View style={{ width: Math.min(count / Math.max(insightStats.total, 1) * 100, 100), height: 8, backgroundColor: colors.primary + '40', borderRadius: 4 }} />
                      <Text style={styles.statsValue}>{count}</Text>
                    </View>
                  </View>
                ))}
            </Card>

            {/* Top Questions */}
            {insightStats.top_questions.length > 0 && (
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Häufigste Fragen</Text>
                {insightStats.top_questions.map((q, i) => (
                  <View key={i} style={styles.statsRow}>
                    <Text style={[styles.statsLabel, { flex: 3 }]} numberOfLines={2}>{q.question}</Text>
                    <Text style={styles.statsValue}>{q.count}x</Text>
                  </View>
                ))}
              </Card>
            )}

            {/* Suggested Improvements */}
            {insightStats.improvements.length > 0 && (
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>AI-Verbesserungsvorschläge</Text>
                {insightStats.improvements.slice(0, 10).map((imp, i) => (
                  <Text key={i} style={[styles.insightText, { marginTop: i > 0 ? spacing.sm : 0 }]}>
                    {imp}
                  </Text>
                ))}
              </Card>
            )}

            {/* Recent Conversations */}
            {recentConversations.length > 0 && (
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Letzte Gespräche</Text>
                {recentConversations.map(conv => (
                  <TouchableOpacity
                    key={conv.id}
                    style={[styles.feedbackCard, { marginBottom: spacing.sm }]}
                    onPress={() => setExpandedConv(expandedConv === conv.id ? null : conv.id)}
                  >
                    <View style={styles.feedbackHeader}>
                      <View style={[styles.typeBadge, {
                        backgroundColor: conv.status === 'resolved' ? colors.success + '20'
                          : conv.status === 'escalated' ? colors.error + '20' : colors.accent + '20'
                      }]}>
                        <Text style={[styles.typeBadgeText, {
                          color: conv.status === 'resolved' ? colors.success
                            : conv.status === 'escalated' ? colors.error : colors.accent
                        }]}>
                          {conv.status === 'resolved' ? 'Gelöst' : conv.status === 'escalated' ? 'Eskaliert' : 'Aktiv'}
                        </Text>
                      </View>
                      <Text style={styles.feedbackMetaText}>{formatDate(conv.created_at)}</Text>
                    </View>
                    {Array.isArray(conv.messages) && conv.messages.length > 0 && (
                      <Text style={styles.feedbackTitle} numberOfLines={expandedConv === conv.id ? undefined : 2}>
                        {(conv.messages.find((m: any) => m.role === 'user') as any)?.content || '–'}
                      </Text>
                    )}
                    {expandedConv === conv.id && Array.isArray(conv.messages) && (
                      <View style={{ marginTop: spacing.sm }}>
                        {conv.messages.map((msg: any, i: number) => (
                          <Text key={i} style={[styles.feedbackDescription, { fontWeight: msg.role === 'user' ? '600' : '400' }]}>
                            {msg.role === 'user' ? 'User' : 'Bot'}: {msg.content}
                          </Text>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </Card>
            )}
          </>
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          )
        ) : null}
      </ScrollView>
    </AdminGuard>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 900, alignSelf: 'center', width: '100%', paddingBottom: 100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  backBtn: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h1 },

  tabBar: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: borderRadius.md, padding: 3, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: borderRadius.md - 2 },
  tabActive: { backgroundColor: '#FFFFFF', ...shadows.sm },
  tabText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: colors.text, fontWeight: '600' },

  // Feedback
  feedbackCounts: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },
  filterRow: { marginBottom: spacing.lg, maxHeight: 40 },
  filterRowContent: { gap: spacing.xs },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { ...typography.caption, fontWeight: '500', color: colors.textSecondary },
  filterChipTextActive: { color: '#FFFFFF' },
  feedbackCard: { marginBottom: spacing.md },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  typeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  typeBadgeText: { ...typography.caption, fontWeight: '600' },
  feedbackTitle: { ...typography.body, fontWeight: '500', flex: 1 },
  feedbackMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  feedbackMetaText: { ...typography.caption, color: colors.textLight },
  feedbackMetaDot: { ...typography.caption, color: colors.textLight },
  feedbackDescription: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  feedbackScreen: { ...typography.caption, color: colors.textLight },
  statusRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' },
  statusChip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border },
  statusChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  statusChipText: { ...typography.caption, color: colors.textLight },
  statusChipTextActive: { color: colors.primary, fontWeight: '600' },

  // Stats
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  kpiCard: { flex: 1, minWidth: 140, alignItems: 'center', paddingVertical: spacing.lg },
  kpiValue: { fontSize: 28, fontWeight: '700' },
  kpiLabel: { ...typography.bodySmall, marginTop: spacing.xs },
  sectionCard: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, marginBottom: 2 },
  sectionHint: { ...typography.caption, color: colors.textLight, marginBottom: spacing.md },
  subsectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xs },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  statsLabel: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  statsValue: { ...typography.bodySmall, fontWeight: '600', textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  insightText: { ...typography.caption, color: colors.accent, fontStyle: 'italic', marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },

  // Tasks
  addTaskRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  addTaskInput: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.body, borderWidth: 1, borderColor: colors.border },
  addTaskBtn: { width: 44, height: 44, borderRadius: borderRadius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addTaskBtnText: { fontSize: 24, color: '#FFFFFF', fontWeight: '300', marginTop: -1 },
  hideDoneRow: { marginBottom: spacing.md },
  hideDoneText: { ...typography.bodySmall, color: colors.primary, fontWeight: '500' },
  taskCard: { marginBottom: spacing.sm },
  taskDone: { opacity: 0.5 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  taskToggle: { paddingTop: 2 },
  taskCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  taskCheckboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  taskCheckmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  taskInProgressDot: { color: colors.warning, fontSize: 10 },
  taskContent: { flex: 1 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  taskTitle: { ...typography.body, fontWeight: '500', flex: 1 },
  taskTitleDone: { textDecorationLine: 'line-through', color: colors.textLight },
  priorityBadge: { paddingHorizontal: spacing.xs, paddingVertical: 1, borderRadius: borderRadius.sm },
  priorityText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  taskDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  taskMeta: { ...typography.caption, color: colors.textLight, marginTop: 2 },
  taskDeleteBtn: { padding: spacing.xs },
  taskDeleteText: { fontSize: 18, color: colors.textLight, fontWeight: '300' },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
});
