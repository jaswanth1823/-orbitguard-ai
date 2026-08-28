'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Anomaly } from '@/lib/types';
import { LoadingState, ErrorState } from '@/components/ui/LoadingState';
import { SeverityBadge } from '@/components/ui/Badge';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { formatRelativeTime } from '@/lib/utils';
import {
  AlertTriangle,
  Filter,
  Clock,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Brain,
  Loader2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type TypeFilter = 'all' | 'power_system' | 'thermal' | 'communications' | 'orbit_deviation';

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ── AI explanation state per anomaly ─────────────────────────────────────────

interface ExplanationState {
  status: 'idle' | 'loading' | 'done' | 'error';
  content: string | null;
  provider: 'watsonx' | 'demo' | null;
  confidence: number | null;
  errorMsg: string | null;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
// Renders the structured markdown returned by explainAnomaly() into
// readable styled sections without any additional packages.

function renderExplanationMarkdown(md: string): string {
  return md
    // Bold section headers → styled divs
    .replace(
      /^\*\*(.*?)\*\*$/gm,
      '<div class="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mt-4 mb-1.5 first:mt-0">$1</div>',
    )
    // Inline bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100 font-semibold">$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="font-mono text-xs bg-[#1a2a42] px-1 py-0.5 rounded text-blue-300">$1</code>')
    // Italic / note lines
    .replace(/^\*(.*?)\*$/gm, '<p class="text-[10px] text-slate-500 italic mt-2">$1</p>')
    // Bullet points
    .replace(
      /^[•·]\s+(.+)$/gm,
      '<div class="flex gap-2 mb-1"><span class="text-blue-500 flex-shrink-0 mt-0.5">▸</span><span>$1</span></div>',
    )
    // Blank lines → spacing
    .replace(/\n\n+/g, '<div class="mb-2"></div>')
    .replace(/\n/g, '<br/>');
}

// ── AI Analysis panel (rendered inside expanded anomaly) ──────────────────────

interface AIAnalysisPanelProps {
  anomalyId: string;
  state: ExplanationState;
  onGenerate: (id: string) => void;
}

function AIAnalysisPanel({ anomalyId, state, onGenerate }: AIAnalysisPanelProps) {
  const isWatsonx = state.provider === 'watsonx';

  if (state.status === 'idle') {
    return (
      <div className="border border-[#1e2d4a] rounded-lg p-4 bg-[#080d1a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-medium text-slate-300">AI Analysis</span>
            <span className="text-[10px] text-slate-500">· powered by IBM Granite</span>
          </div>
          <button
            onClick={() => onGenerate(anomalyId)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600/20 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Generate Analysis
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Generate an AI-powered explanation covering cause, severity, affected subsystem, and recommended action.
        </p>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="border border-[#1e2d4a] rounded-lg p-4 bg-[#080d1a]">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
          <span className="text-xs text-slate-400">
            {isWatsonx !== false ? 'IBM Granite is analysing this anomaly…' : 'Generating analysis…'}
          </span>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="border border-red-500/20 rounded-lg p-4 bg-red-500/5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-red-400">{state.errorMsg ?? 'Analysis failed'}</span>
          <button
            onClick={() => onGenerate(anomalyId)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // status === 'done'
  return (
    <div className="border border-blue-500/15 rounded-lg bg-[#080d1a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a]">
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">AI Analysis</span>
          {/* Provider badge */}
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
            isWatsonx
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
              : 'bg-slate-700/50 text-slate-400 border border-slate-600/40'
          }`}>
            {isWatsonx ? 'IBM Granite' : 'Demo AI'}
          </span>
          {state.confidence !== null && (
            <span className="text-[9px] text-slate-500">
              {(state.confidence * 100).toFixed(0)}% confidence
            </span>
          )}
        </div>
        <button
          onClick={() => onGenerate(anomalyId)}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-[#1a2a42]"
          title="Regenerate analysis"
        >
          <RefreshCw className="w-3 h-3" />
          Regenerate
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <div
          className="text-xs text-slate-300 leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: renderExplanationMarkdown(state.content ?? ''),
          }}
        />
      </div>
    </div>
  );
}

// ── Main Anomalies page ───────────────────────────────────────────────────────

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // AI explanation state: anomaly ID → ExplanationState
  const [explanations, setExplanations] = useState<Map<string, ExplanationState>>(new Map());

  const fetchData = async () => {
    try {
      setError(null);
      const res = await fetch('/api/anomalies');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAnomalies(json.anomalies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load anomalies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Generate AI explanation for one anomaly ─────────────────────────────────

  const generateExplanation = useCallback(async (anomalyId: string) => {
    // Mark as loading (override any prior state)
    setExplanations(prev => new Map(prev).set(anomalyId, {
      status: 'loading', content: null, provider: null, confidence: null, errorMsg: null,
    }));

    try {
      const res = await fetch(`/api/anomalies/${encodeURIComponent(anomalyId)}/explain`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();

      setExplanations(prev => new Map(prev).set(anomalyId, {
        status:     'done',
        content:    json.explanation,
        provider:   json.provider,
        confidence: json.confidence,
        errorMsg:   null,
      }));
    } catch (err) {
      setExplanations(prev => new Map(prev).set(anomalyId, {
        status:     'error',
        content:    null,
        provider:   null,
        confidence: null,
        errorMsg:   err instanceof Error ? err.message : 'Analysis failed',
      }));
    }
  }, []);

  // Auto-fetch when a card is expanded (only if no explanation yet)
  const handleExpand = useCallback((id: string) => {
    const isExpanding = expandedId !== id;
    setExpandedId(isExpanding ? id : null);

    if (isExpanding) {
      const existing = explanations.get(id);
      // Auto-fetch only on first expand — user can manually regenerate after
      if (!existing || existing.status === 'idle') {
        // Start in idle so the panel shows the "Generate" button rather than
        // auto-firing immediately — lets user choose when to call the AI.
        if (!existing) {
          setExplanations(prev => new Map(prev).set(id, {
            status: 'idle', content: null, provider: null, confidence: null, errorMsg: null,
          }));
        }
      }
    }
  }, [expandedId, explanations]);

  const filtered = useMemo(() => {
    let result = [...anomalies];
    if (severityFilter !== 'all') result = result.filter(a => a.severity === severityFilter);
    if (typeFilter !== 'all') result = result.filter(a => a.anomaly_type === typeFilter);
    return result.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  }, [anomalies, severityFilter, typeFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: anomalies.length,
    critical: anomalies.filter(a => a.severity === 'critical').length,
    high: anomalies.filter(a => a.severity === 'high').length,
    medium: anomalies.filter(a => a.severity === 'medium').length,
    low: anomalies.filter(a => a.severity === 'low').length,
    byType: anomalies.reduce((acc, a) => {
      acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  }), [anomalies]);

  if (loading) return (
    <AppShell title="Anomaly Engine" subtitle="Spacecraft anomaly detection">
      <LoadingState message="Loading anomaly data..." />
    </AppShell>
  );

  if (error) return (
    <AppShell title="Anomaly Engine">
      <ErrorState message={error} onRetry={fetchData} />
    </AppShell>
  );

  return (
    <AppShell
      title="Anomaly Engine"
      subtitle={`${anomalies.length} active anomalies detected`}
    >
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-slate-300', bg: 'bg-[#0f1a2e] border-[#1e2d4a]' },
          { label: 'Critical', value: stats.critical, color: 'text-red-400',    bg: 'bg-red-400/5 border-red-400/20' },
          { label: 'High',     value: stats.high,     color: 'text-orange-400', bg: 'bg-orange-400/5 border-orange-400/20' },
          { label: 'Medium',   value: stats.medium,   color: 'text-amber-400',  bg: 'bg-amber-400/5 border-amber-400/20' },
          { label: 'Low',      value: stats.low,      color: 'text-blue-400',   bg: 'bg-blue-400/5 border-blue-400/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border rounded-xl p-4`}>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Filters sidebar */}
        <div className="space-y-4">
          {/* Severity filter */}
          <Card>
            <CardHeader title="Filter" icon={<Filter className="w-4 h-4 text-slate-400" />} />
            <CardBody className="space-y-4">
              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Severity</div>
                <div className="space-y-1">
                  {(['all', 'critical', 'high', 'medium', 'low'] as SeverityFilter[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSeverityFilter(s)}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                        severityFilter === s
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-[#111d35]'
                      }`}
                    >
                      <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                      <span className="text-slate-500">
                        {s === 'all' ? stats.total : stats[s as keyof typeof stats] as number || 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Type</div>
                <div className="space-y-1">
                  {(['all', 'power_system', 'thermal', 'communications', 'orbit_deviation'] as TypeFilter[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                        typeFilter === t
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-[#111d35]'
                      }`}
                    >
                      <span>{t === 'all' ? 'All Types' : t.replace('_', ' ')}</span>
                      <span className="text-slate-500">
                        {t === 'all' ? stats.total : stats.byType[t] || 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Type distribution */}
          <Card>
            <CardHeader title="Distribution" icon={<BarChart2 className="w-4 h-4 text-blue-400" />} />
            <CardBody className="space-y-3">
              {Object.entries(stats.byType).map(([type, count]) => (
                <div key={type}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">{type.replace('_', ' ')}</span>
                    <span className="text-slate-300 font-mono">{count}</span>
                  </div>
                  <div className="h-1.5 bg-[#1a2a42] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(count / stats.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        {/* Anomaly list */}
        <div className="xl:col-span-3 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">
              Showing <span className="text-slate-200 font-medium">{filtered.length}</span> anomalies
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl py-16 text-center">
              <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No anomalies match selected filters</p>
            </div>
          ) : (
            filtered.map(anomaly => {
              const isExpanded = expandedId === anomaly.id;
              const aiState: ExplanationState = explanations.get(anomaly.id) ?? {
                status: 'idle', content: null, provider: null, confidence: null, errorMsg: null,
              };

              return (
                <div
                  key={anomaly.id}
                  className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => handleExpand(anomaly.id)}
                    className="w-full text-left p-4 hover:bg-[#111d35] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Severity indicator */}
                      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                        anomaly.severity === 'critical' ? 'bg-red-400' :
                        anomaly.severity === 'high'     ? 'bg-orange-400' :
                        anomaly.severity === 'medium'   ? 'bg-amber-400' : 'bg-blue-400'
                      }`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-sm font-mono font-bold text-slate-100">
                            {anomaly.spacecraft_name}
                          </span>
                          <SeverityBadge severity={anomaly.severity} />
                          <span className="text-xs text-slate-400 bg-[#1a2a42] px-2 py-0.5 rounded">
                            {anomaly.anomaly_type.replace('_', ' ')}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                          {anomaly.explanation}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(anomaly.timestamp)}
                          </span>
                          <span>·</span>
                          <span>Param: <span className="font-mono text-slate-400">{anomaly.parameter}</span></span>
                          <span>·</span>
                          <span>Confidence: <span className="text-slate-300">{(anomaly.confidence * 100).toFixed(0)}%</span></span>
                        </div>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-[#1e2d4a] p-4 space-y-4 bg-[#0a1220]">
                      {/* Telemetry values */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg p-3">
                          <div className="text-[10px] text-slate-500 mb-1">Observed Value</div>
                          <div className="text-sm font-mono font-bold text-red-400">
                            {anomaly.observed_value.toFixed(3)}
                          </div>
                        </div>
                        <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg p-3">
                          <div className="text-[10px] text-slate-500 mb-1">Expected Min</div>
                          <div className="text-sm font-mono font-bold text-emerald-400">
                            {anomaly.expected_range[0].toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg p-3">
                          <div className="text-[10px] text-slate-500 mb-1">Expected Max</div>
                          <div className="text-sm font-mono font-bold text-emerald-400">
                            {anomaly.expected_range[1].toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Full explanation */}
                      <div>
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          Technical Explanation
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{anomaly.explanation}</p>
                      </div>

                      {/* Recommended action */}
                      <div className="bg-blue-600/5 border border-blue-500/20 rounded-lg p-3">
                        <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">
                          Recommended Action
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{anomaly.recommended_action}</p>
                      </div>

                      {/* Related parameters */}
                      {anomaly.related_parameters && anomaly.related_parameters.length > 0 && (
                        <div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Related Parameters
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {anomaly.related_parameters.map(p => (
                              <span key={p} className="text-[11px] bg-[#1a2a42] border border-[#2a3d5e] text-slate-300 px-2 py-0.5 rounded font-mono">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── AI Analysis ───────────────────────────────────────── */}
                      <AIAnalysisPanel
                        anomalyId={anomaly.id}
                        state={aiState}
                        onGenerate={generateExplanation}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
