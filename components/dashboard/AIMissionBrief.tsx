'use client';

import { useState, useEffect } from 'react';
import { Spacecraft, Anomaly, MissionBrief } from '@/lib/types';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingState';
import { Brain, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface AIMissionBriefProps {
  spacecraft: Spacecraft[];
  anomalies: Anomaly[];
}

// spacecraft and anomalies are passed for future direct use; brief is fetched via API
export function AIMissionBrief({ spacecraft: _sc, anomalies: _an }: AIMissionBriefProps) {
  const [brief, setBrief] = useState<MissionBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchBrief = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/mission-intelligence');
      if (!res.ok) throw new Error();
      const json = await res.json();
      setBrief(json.brief);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBrief(); }, []);

  const statusColor =
    brief?.overall_status === 'critical' ? 'text-red-400 bg-red-400/10 border-red-400/30' :
    brief?.overall_status === 'warning' ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' :
    'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';

  return (
    <Card>
      <CardHeader
        title="AI Mission Brief"
        subtitle={brief?.data_source === 'watsonx' ? 'IBM Granite' : 'Demo AI'}
        icon={<Brain className="w-4 h-4 text-blue-400" />}
        actions={
          <button
            onClick={fetchBrief}
            disabled={loading}
            className="p-1.5 rounded hover:bg-[#111d35] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            title="Regenerate brief"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      <CardBody className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-3 py-4">
            <LoadingSpinner size="sm" />
            <span className="text-xs text-slate-400">Generating mission brief...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs text-red-400 py-2">
            <AlertCircle className="w-4 h-4" />
            <span>Unable to generate brief</span>
          </div>
        ) : brief ? (
          <>
            {/* Status badge */}
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium ${statusColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${brief.overall_status === 'critical' ? 'status-indicator-critical' : ''}`} />
              FLEET STATUS: {brief.overall_status.toUpperCase()}
            </div>

            {/* Summary */}
            <p className="text-xs text-slate-300 leading-relaxed">
              {brief.summary}
            </p>

            {/* Critical issues */}
            {brief.critical_issues.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">
                  Critical Issues
                </div>
                <ul className="space-y-1.5">
                  {brief.critical_issues.slice(0, 2).map((issue, i) => (
                    <li key={i} className="text-[11px] text-slate-300 flex gap-2 leading-relaxed">
                      <span className="text-red-400 flex-shrink-0 mt-0.5">▸</span>
                      {issue.length > 140 ? issue.slice(0, 140) + '…' : issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top action */}
            {brief.recommended_actions.length > 0 && (
              <div className="bg-blue-600/5 border border-blue-500/20 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">
                  Priority Action
                </div>
                <div className="text-[11px] text-slate-300 leading-relaxed">
                  {brief.recommended_actions[0]}
                </div>
              </div>
            )}

            {/* Confidence */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-[#1e2d4a]">
              <span>AI Confidence: {(brief.confidence * 100).toFixed(0)}%</span>
              <Link
                href="/mission-intelligence"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
              >
                Full briefing <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
