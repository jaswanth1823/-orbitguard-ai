'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import {
  Database,
  Brain,
  Radio,
  Shield,
  Check,
  AlertCircle,
  ExternalLink,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AIHealthResponse {
  provider: 'watsonx' | 'demo';
  configured: boolean;
  fields: {
    api_key: 'configured' | 'missing';
    project_id: 'configured' | 'missing';
    url: string;
    model_id: string;
  };
  active_provider: string;
}

interface TestResult {
  status: 'connected' | 'failed';
  message: string;
  model: string | null;
  error_kind?: string;
}

// ── AI Status Panel ────────────────────────────────────────────────────────────

function AIStatusPanel() {
  const [health, setHealth] = useState<AIHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/ai/health');
      const data: AIHealthResponse = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/test', { method: 'POST' });
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ status: 'failed', message: 'Could not reach the server.', model: null });
    } finally {
      setTesting(false);
    }
  };

  const isConnected = health?.provider === 'watsonx' && health.configured;
  const isDemo = !isConnected;

  return (
    <Card>
      <CardHeader
        title="AI Engine"
        subtitle={isConnected ? 'IBM Granite via watsonx.ai' : 'Demo Mode — no credentials configured'}
        icon={<Brain className="w-4 h-4 text-blue-400" />}
        actions={
          <button
            onClick={fetchHealth}
            disabled={healthLoading}
            aria-label="Refresh AI status"
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', healthLoading && 'animate-spin')} />
          </button>
        }
      />
      <CardBody className="space-y-5">
        {/* Provider badge */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold',
            isConnected
              ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
              : 'bg-amber-400/10 border-amber-400/30 text-amber-400',
          )}>
            {isConnected
              ? <Wifi className="w-4 h-4" />
              : <WifiOff className="w-4 h-4" />}
            {isConnected ? 'IBM Granite (watsonx.ai)' : 'Demo Mode'}
          </div>
          {isDemo && (
            <p className="text-xs text-slate-500">
              Configure all four environment variables to enable IBM Granite.
            </p>
          )}
        </div>

        {/* Field-by-field status */}
        {healthLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading configuration status…
          </div>
        ) : health ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                label: 'API Key',
                envVar: 'WATSONX_API_KEY',
                value: health.fields.api_key,
                isSet: health.fields.api_key === 'configured',
                // Never show the value — only configured/missing
                display: health.fields.api_key === 'configured' ? '●●●●●●●●●●●● (set)' : 'Not set',
              },
              {
                label: 'Project ID',
                envVar: 'WATSONX_PROJECT_ID',
                value: health.fields.project_id,
                isSet: health.fields.project_id === 'configured',
                display: health.fields.project_id === 'configured' ? 'Configured' : 'Not set',
              },
              {
                label: 'Service URL',
                envVar: 'WATSONX_URL',
                value: health.fields.url,
                isSet: health.fields.url !== 'missing',
                display: health.fields.url !== 'missing' ? health.fields.url : 'Not set',
              },
              {
                label: 'Model ID',
                envVar: 'GRANITE_MODEL_ID',
                value: health.fields.model_id,
                isSet: health.fields.model_id !== 'missing',
                display: health.fields.model_id !== 'missing' ? health.fields.model_id : 'Not set',
              },
            ].map(({ label, envVar, isSet, display }) => (
              <div key={envVar} className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
                  <code className="text-[10px] text-blue-300 font-mono bg-[#0f1a2e] px-1.5 py-0.5 rounded">
                    {envVar}
                  </code>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    isSet ? 'bg-emerald-400' : 'bg-red-400',
                  )} />
                  <span className={cn(
                    'text-xs font-mono truncate',
                    isSet ? 'text-slate-300' : 'text-red-400',
                  )}>
                    {display}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Could not load AI status.</p>
        )}

        {/* Test Connection */}
        <div className="pt-1 border-t border-[#1e2d4a] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-200">Test Connection</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Sends a minimal request to verify credentials end-to-end.
              </div>
            </div>
            <button
              onClick={testConnection}
              disabled={testing}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors border',
                testing
                  ? 'opacity-60 cursor-not-allowed bg-[#0f1a2e] border-[#1e2d4a] text-slate-400'
                  : 'bg-blue-600/20 border-blue-500/30 text-blue-400 hover:bg-blue-600/30',
              )}
            >
              {testing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…</>
              ) : (
                <><Wifi className="w-3.5 h-3.5" /> Test Connection</>
              )}
            </button>
          </div>

          {testResult && (
            <div className={cn(
              'flex items-start gap-2.5 rounded-lg p-3 border text-xs',
              testResult.status === 'connected'
                ? 'bg-emerald-400/5 border-emerald-400/20 text-emerald-300'
                : 'bg-red-400/5 border-red-400/20 text-red-300',
            )}>
              {testResult.status === 'connected'
                ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <div>
                <div className="font-medium">
                  {testResult.status === 'connected' ? 'Connected successfully' : 'Connection failed'}
                </div>
                <div className="mt-0.5 text-[11px] opacity-80">{testResult.message}</div>
                {testResult.model && (
                  <div className="mt-0.5 text-[11px] opacity-70 font-mono">
                    Model: {testResult.model}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Settings field sections (unchanged structure) ─────────────────────────────

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: 'text' | 'password' | 'select' | 'toggle';
  placeholder?: string;
  options?: string[];
  env_var?: string;
}

interface SettingSection {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  fields: SettingField[];
}

const CONFIG_SECTIONS: SettingSection[] = [
  {
    title: 'IBM watsonx AI',
    subtitle: 'Set credentials via environment variables — do not enter them here in production',
    icon: Brain,
    fields: [
      {
        key: 'watsonx_api_key',
        label: 'API Key',
        description: 'IBM Cloud API key — set via WATSONX_API_KEY in .env.local (never committed)',
        type: 'password',
        placeholder: 'Set WATSONX_API_KEY in .env.local',
        env_var: 'WATSONX_API_KEY',
      },
      {
        key: 'watsonx_project_id',
        label: 'Project ID',
        description: 'watsonx.ai project identifier',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        env_var: 'WATSONX_PROJECT_ID',
      },
      {
        key: 'watsonx_url',
        label: 'Service URL',
        description: 'Regional watsonx.ai endpoint',
        type: 'select',
        options: [
          'https://us-south.ml.cloud.ibm.com',
          'https://eu-de.ml.cloud.ibm.com',
          'https://eu-gb.ml.cloud.ibm.com',
          'https://au-syd.ml.cloud.ibm.com',
          'https://jp-tok.ml.cloud.ibm.com',
        ],
        env_var: 'WATSONX_URL',
      },
      {
        key: 'granite_model',
        label: 'Granite Model',
        description: 'IBM Granite model variant',
        type: 'select',
        options: [
          'ibm/granite-3-8b-instruct',
          'ibm/granite-3-2b-instruct',
          'ibm/granite-13b-instruct-v2',
        ],
        env_var: 'GRANITE_MODEL_ID',
      },
    ],
  },
  {
    title: 'Database',
    subtitle: 'PostgreSQL or Supabase connection',
    icon: Database,
    fields: [
      {
        key: 'database_url',
        label: 'Database URL',
        description: 'PostgreSQL connection string',
        type: 'password',
        placeholder: 'postgresql://user:password@host:5432/orbitguard',
        env_var: 'DATABASE_URL',
      },
    ],
  },
  {
    title: 'Space Data APIs',
    subtitle: 'External space data providers',
    icon: Radio,
    fields: [
      {
        key: 'n2yo_api_key',
        label: 'N2YO API Key',
        description: 'For real-time TLE satellite tracking data',
        type: 'password',
        placeholder: 'Enter N2YO API key',
        env_var: 'N2YO_API_KEY',
      },
      {
        key: 'data_mode',
        label: 'Data Mode',
        description: 'Whether to use live or simulated telemetry',
        type: 'select',
        options: ['demo', 'auto', 'live'],
        env_var: 'NEXT_PUBLIC_DATA_MODE',
      },
    ],
  },
  {
    title: 'Vector Database',
    subtitle: 'Document search for AI context retrieval',
    icon: Shield,
    fields: [
      {
        key: 'vector_db_type',
        label: 'Vector DB Provider',
        description: 'Backend for semantic document search',
        type: 'select',
        options: ['pgvector', 'pinecone', 'weaviate'],
        env_var: 'VECTOR_DB_TYPE',
      },
      {
        key: 'pinecone_api_key',
        label: 'Pinecone API Key',
        description: 'Required if using Pinecone as vector backend',
        type: 'password',
        placeholder: 'Enter Pinecone API key',
        env_var: 'PINECONE_API_KEY',
      },
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  const handleSave = (section: string) => {
    setSaved(prev => ({ ...prev, [section]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [section]: false })), 2000);
  };

  const toggleShow = (key: string) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <AppShell
      title="Settings"
      subtitle="Configure OrbitGuard AI credentials and integrations"
    >
      {/* Info banner */}
      <div className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-4 mb-6 flex gap-3">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-blue-300">Credentials are managed via environment variables only.</strong>{' '}
          Set them in <code className="bg-[#0f1a2e] px-1 rounded">.env.local</code> (never committed to git).
          Values entered in the form fields below are for reference only and are not sent to the server.{' '}
          <a
            href="https://cloud.ibm.com/apidocs/watsonx-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
          >
            IBM watsonx docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Live AI status panel — fetches from server */}
      <div className="mb-6">
        <AIStatusPanel />
      </div>

      {/* Environment variable reference sections */}
      <div className="space-y-5">
        {CONFIG_SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <Card key={section.title}>
              <CardHeader
                title={section.title}
                subtitle={section.subtitle}
                icon={<Icon className="w-4 h-4 text-blue-400" />}
                actions={
                  <button
                    onClick={() => handleSave(section.title)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all border',
                      saved[section.title]
                        ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
                        : 'bg-blue-600/20 border-blue-500/30 text-blue-400 hover:bg-blue-600/30',
                    )}
                  >
                    {saved[section.title] ? (
                      <><Check className="w-3 h-3" /> Noted</>
                    ) : (
                      'Reference'
                    )}
                  </button>
                }
              />
              <CardBody className="space-y-5">
                {section.fields.map(field => (
                  <div key={field.key}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <label className="text-sm font-medium text-slate-200">
                          {field.label}
                        </label>
                        <p className="text-xs text-slate-500 mt-0.5">{field.description}</p>
                      </div>
                      {field.env_var && (
                        <code className="text-[10px] bg-[#0a1120] border border-[#1e2d4a] text-blue-300 px-2 py-0.5 rounded font-mono flex-shrink-0">
                          {field.env_var}
                        </code>
                      )}
                    </div>
                    {field.type === 'select' ? (
                      <select
                        value={values[field.key] || ''}
                        onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-300 text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500/50 transition-colors"
                      >
                        <option value="">Select option…</option>
                        {field.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          type={field.type === 'password' && !showValues[field.key] ? 'password' : 'text'}
                          value={values[field.key] || ''}
                          onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-300 text-sm rounded-lg px-3 py-2 pr-16 outline-none focus:border-blue-500/50 transition-colors font-mono"
                        />
                        {field.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => toggleShow(field.key)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            {showValues[field.key] ? 'HIDE' : 'SHOW'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
