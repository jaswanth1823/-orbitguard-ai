// ============================================================
// OrbitGuard AI — AI Provider
// Supports: IBM Granite via watsonx.ai (production)
//           Demo AI (deterministic fallback, no credentials needed)
//
// SECURITY: Credentials are read from server-side process.env only.
//           They are never included in any response or log output.
// ============================================================

import type { Anomaly, OrbitalPosition, Spacecraft, TelemetryReading, MissionBrief, GraniteAssessment, AIChatMessage } from './types';

export type AIProvider = 'watsonx' | 'demo';

export interface AIProviderConfig {
  provider: AIProvider;
  model?: string;
}

export interface CopilotQueryContext {
  question: string;
  spacecraft?: Spacecraft[];
  anomalies?: Anomaly[];
  latestTelemetry?: TelemetryReading[];
  /** Recent telemetry history per spacecraft (last 1h, 12 readings) for trend computation */
  telemetryHistory?: Record<string, TelemetryReading[]>;
  conversationHistory?: AIChatMessage[];
  /** Real-time orbital positions (N2YO live) or simulated positions, plus the source label */
  orbitalData?: {
    positions: OrbitalPosition[];
    data_source: 'n2yo' | 'simulated' | 'fallback';
  };
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  confidence: number;
  reasoning?: string;
  sources?: string[];
  /** Parsed structured sections — present when Granite returns valid JSON */
  structured?: import('./types').CopilotAnalysis;
}

// ── Configuration validation ─────────────────────────────────────────────────

export interface WatsonxConfig {
  apiKey: string;
  projectId: string;
  baseUrl: string;
  modelId: string;
}

/** Reads and validates all four required env vars. Returns null if any is missing. */
function getWatsonxConfig(): WatsonxConfig | null {
  const apiKey = process.env.WATSONX_API_KEY;
  const projectId = process.env.WATSONX_PROJECT_ID;
  const baseUrl = process.env.WATSONX_URL;
  const modelId = process.env.GRANITE_MODEL_ID;

  if (!apiKey || apiKey.trim().length < 10) return null;
  if (!projectId || projectId.trim().length < 5) return null;
  if (!baseUrl || !baseUrl.startsWith('https://')) return null;
  if (!modelId || modelId.trim().length < 3) return null;

  return {
    apiKey: apiKey.trim(),
    projectId: projectId.trim(),
    baseUrl: baseUrl.replace(/\/$/, ''), // strip trailing slash
    modelId: modelId.trim(),
  };
}

export function getActiveProvider(): AIProvider {
  return getWatsonxConfig() !== null ? 'watsonx' : 'demo';
}

/** Safe config summary — never includes the API key. */
export function getConfigStatus() {
  const cfg = getWatsonxConfig();
  return {
    provider: cfg ? 'watsonx' : 'demo',
    configured: cfg !== null,
    apiKey: process.env.WATSONX_API_KEY ? 'configured' : 'missing',
    projectId: process.env.WATSONX_PROJECT_ID ? 'configured' : 'missing',
    url: process.env.WATSONX_URL || null,
    modelId: process.env.GRANITE_MODEL_ID || null,
  };
}

// ── IAM token cache (server process lifetime) ─────────────────────────────────
// Token TTL from IBM IAM is 3600 s. We refresh 5 min before expiry.

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let _tokenCache: TokenCache | null = null;

async function getIAMToken(apiKey: string): Promise<string> {
  const now = Date.now();
  const refreshBuffer = 5 * 60 * 1000; // 5 min

  if (_tokenCache && _tokenCache.expiresAt - refreshBuffer > now) {
    return _tokenCache.token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // Key is not logged — only the HTTP status is surfaced in errors
      body: new URLSearchParams({
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: apiKey,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Intentionally opaque: do not log status or headers that could hint at the key
    throw new WatsonxError('IAM authentication failed. Check WATSONX_API_KEY.', 'auth');
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  _tokenCache = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return _tokenCache.token;
}

// Reset token cache (used by test-connection endpoint and for test isolation)
export function resetTokenCache(): void {
  _tokenCache = null;
}

// ── Typed error class ─────────────────────────────────────────────────────────

type WatsonxErrorKind =
  | 'auth'           // bad API key
  | 'project'        // bad / unauthorized project ID
  | 'model'          // model not found or not accessible
  | 'rate_limit'     // 429
  | 'timeout'        // AbortError or network timeout
  | 'api_error'      // other 4xx/5xx from watsonx
  | 'parse_error'    // unexpected response shape
  | 'unknown';

class WatsonxError extends Error {
  kind: WatsonxErrorKind;
  constructor(message: string, kind: WatsonxErrorKind) {
    super(message);
    this.name = 'WatsonxError';
    this.kind = kind;
  }
}

function classifyWatsonxStatus(status: number): WatsonxErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'model';
  if (status === 400) return 'project'; // often a bad project_id
  if (status === 429) return 'rate_limit';
  return 'api_error';
}

// ── Core watsonx.ai inference call ───────────────────────────────────────────

interface WatsonxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callWatsonx(
  messages: WatsonxMessage[],
  cfg: WatsonxConfig,
  maxTokens = 900,
): Promise<string> {
  const token = await getIAMToken(cfg.apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000); // 30 s

  let res: Response;
  try {
    res = await fetch(
      `${cfg.baseUrl}/ml/v1/text/chat?version=2024-05-13`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model_id: cfg.modelId,
          project_id: cfg.projectId,
          messages,
          parameters: {
            // IBM watsonx minimum is 1; keep a safe floor of 20 so small
            // test calls don't trigger a 400 from the API.
            max_new_tokens: Math.max(maxTokens, 20),
            temperature: 0.2,
            top_p: 0.9,
            repetition_penalty: 1.05,
          },
        }),
        signal: controller.signal,
      },
    );
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WatsonxError('Request to watsonx.ai timed out after 30 seconds.', 'timeout');
    }
    throw new WatsonxError('Network error contacting watsonx.ai.', 'timeout');
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const kind = classifyWatsonxStatus(res.status);
    // Human-readable messages — no raw API key or token in output
    const friendly: Record<WatsonxErrorKind, string> = {
      auth: 'Authentication failed. Verify WATSONX_API_KEY and WATSONX_PROJECT_ID.',
      project: 'Project not found or access denied. Verify WATSONX_PROJECT_ID.',
      model: `Model not found or not accessible. Verify GRANITE_MODEL_ID (${cfg.modelId}).`,
      rate_limit: 'Rate limit reached. Please retry in a moment.',
      api_error: `watsonx.ai returned an error (HTTP ${res.status}).`,
      timeout: 'Request timed out.',
      parse_error: 'Unexpected response from watsonx.ai.',
      unknown: 'An unknown error occurred calling watsonx.ai.',
    };
    throw new WatsonxError(friendly[kind], kind);
  }

  // IBM watsonx native chat endpoint (ml/v1/text/chat) returns:
  //   { results: [{ generated_text: "..." }] }
  // The OpenAI-compat endpoint (/openai/v1/chat/completions) returns:
  //   { choices: [{ message: { content: "..." } }] }
  // Handle both shapes so the code works regardless of endpoint routing.
  const data = await res.json() as {
    results?: Array<{ generated_text?: string }>;
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text =
    data.results?.[0]?.generated_text?.trim() ||
    data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new WatsonxError('watsonx.ai returned an empty response.', 'parse_error');
  }
  return text;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const ORBITGUARD_SYSTEM_PROMPT = `You are OrbitGuard AI, a mission decision-support assistant for spacecraft operations.

RULES — follow these strictly:
1. Base every answer ONLY on the mission context provided in this conversation. Never invent telemetry values, spacecraft names, anomaly readings, or mission data.
2. If a piece of information is not present in the supplied context, explicitly state "Information not available in current mission data."
3. Use precise numerical values from the context when referencing telemetry (e.g., "battery voltage is 24.1 V, below nominal range of 27.0–29.5 V").
4. Always distinguish observed facts (from telemetry/anomaly data) from AI-generated interpretation.
5. Prioritize safety and mission reliability in all recommendations.
6. Clearly state that recommendations are decision support only and must be verified by mission operators before action.
7. Do not claim that any action has been performed or will be performed.
8. Include the spacecraft name and subsystem when they are known.
9. Format responses with clear sections using the required JSON structure.
10. Be concise and actionable. Avoid filler text.`;

// ── Context builders (shared by watsonx and demo paths) ──────────────────────

export function buildMissionContext(
  spacecraft: Spacecraft[],
  anomalies: Anomaly[],
  telemetry: TelemetryReading[],
  orbitalData?: CopilotQueryContext['orbitalData'],
): string {
  const critical = spacecraft.filter(s => s.status === 'critical');
  const warnings = spacecraft.filter(s => s.status === 'warning');
  const criticalAnomalies = anomalies.filter(
    a => a.severity === 'critical' || a.severity === 'high',
  );

  // Determine whether this is live spacecraft telemetry or a simulation
  const isLiveOrbit = orbitalData?.data_source === 'n2yo';
  const dataSourceLabel = isLiveOrbit
    ? 'LIVE SPACECRAFT TELEMETRY (ISS NORAD 25544)'
    : 'SIMULATION';

  const lines: string[] = [
    '=== ORBITGUARD MISSION CONTEXT ===',
    `DATA SOURCE: ${dataSourceLabel}`,
    '',
    'FLEET SUMMARY:',
    `  Total spacecraft: ${spacecraft.length}`,
    `  Critical: ${critical.length}  |  Warning: ${warnings.length}  |  Nominal: ${spacecraft.filter(s => s.status === 'nominal').length}`,
    `  Active anomalies: ${anomalies.length} (${criticalAnomalies.length} high/critical severity)`,
    '',
    'SPACECRAFT STATUS:',
  ];

  for (const sc of spacecraft) {
    lines.push(
      `  ${sc.name}: status=${sc.status.toUpperCase()}  health=${sc.health_score}%  risk=${sc.risk_level}  active_anomalies=${sc.active_anomalies}`,
    );
    if (sc.subsystems?.length) {
      const sorted = [...sc.subsystems].sort((a, b) => a.score - b.score);
      const worst = sorted[0];
      lines.push(`    Weakest subsystem: ${worst.name} (${worst.score}%)`);
      for (const sub of sc.subsystems) {
        lines.push(`    Subsystem [${sub.name}]: score=${sub.score}%  status=${sub.status}${sub.details ? '  details="' + sub.details + '"' : ''}`);
      }
    }
  }

  if (anomalies.length > 0) {
    lines.push('', 'ACTIVE ANOMALIES:');
    for (const a of anomalies) {
      lines.push(
        `  [${a.severity.toUpperCase()}] ${a.spacecraft_name} — ${a.anomaly_type.replace(/_/g, ' ')}`,
        `    Parameter: ${a.parameter}  |  Observed: ${a.observed_value}  |  Expected: ${a.expected_range[0]}–${a.expected_range[1]}`,
        `    Confidence: ${(a.confidence * 100).toFixed(0)}%`,
        `    Detail: ${a.explanation}`,
        `    Recommended: ${a.recommended_action}`,
        a.related_parameters?.length
          ? `    Related parameters: ${a.related_parameters.join(', ')}`
          : '',
      );
    }
  }

  if (telemetry.length > 0) {
    lines.push('', 'LATEST TELEMETRY (one reading per spacecraft):');
    for (const t of telemetry) {
      lines.push(
        `  ${t.spacecraft_id}:`,
        `    battery_voltage=${t.battery_voltage.toFixed(2)}V  power_consumption=${t.power_consumption.toFixed(1)}W`,
        `    temperature_internal=${t.temperature_internal.toFixed(1)}°C  temperature_external=${t.temperature_external.toFixed(1)}°C`,
        `    signal_strength=${t.signal_strength.toFixed(1)}dBm  altitude=${t.altitude.toFixed(1)}km  velocity=${t.velocity.toFixed(3)}km/s`,
        `    solar_panel_output=${t.solar_panel_output.toFixed(1)}W  attitude_error=${t.attitude_error.toFixed(4)}°  memory_usage=${t.memory_usage.toFixed(1)}%`,
        `    timestamp=${t.timestamp}`,
      );
    }
  }

  // Real orbital parameters block — only emitted when positions are available
  if (orbitalData?.positions?.length) {
    lines.push('', 'ORBITAL PARAMETERS:');
    for (const pos of orbitalData.positions) {
      const eclipseLabel =
        pos.visibility === 'eclipsed' ? 'IN ECLIPSE' :
        pos.visibility === 'daylight' ? 'DAYLIGHT' :
        pos.visibility === 'visible'  ? 'VISIBLE (night pass)' : 'UNKNOWN';
      lines.push(
        `  ${pos.name} (NORAD ${pos.norad_id}):`,
        `    Altitude: ${pos.altitude_km.toFixed(1)} km  |  Velocity: ${pos.velocity_km_s.toFixed(3)} km/s`,
        `    Lat: ${pos.latitude.toFixed(4)}°  Lon: ${pos.longitude.toFixed(4)}°`,
        `    Eclipse Phase: ${eclipseLabel}`,
        `    Data: ${pos.is_live ? 'LIVE (N2YO real-time)' : 'SIMULATED'}  |  Fix: ${pos.timestamp}`,
      );
    }
  }

  lines.push('', '=== END MISSION CONTEXT ===');
  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Computes human-readable telemetry trend strings from a short history window.
 * Returns up to 6 trend observations grounded in the actual data.
 */
function computeTelemetryTrends(
  spacecraftId: string,
  history: TelemetryReading[],
): string[] {
  if (history.length < 3) return ['Insufficient history to compute trends.'];

  const first = history[0];
  const last = history[history.length - 1];
  const trends: string[] = [];
  const n = history.length;

  // Battery voltage trend
  const bvDelta = last.battery_voltage - first.battery_voltage;
  const bvAvg = history.reduce((s, r) => s + r.battery_voltage, 0) / n;
  if (Math.abs(bvDelta) > 0.1) {
    trends.push(
      `${spacecraftId} battery_voltage: ${bvDelta > 0 ? '+' : ''}${bvDelta.toFixed(2)}V over ${n} readings (avg ${bvAvg.toFixed(2)}V, latest ${last.battery_voltage.toFixed(2)}V)`,
    );
  }

  // Power consumption trend
  const pcDelta = last.power_consumption - first.power_consumption;
  const pcAvg = history.reduce((s, r) => s + r.power_consumption, 0) / n;
  if (Math.abs(pcDelta) > 2) {
    trends.push(
      `${spacecraftId} power_consumption: ${pcDelta > 0 ? '+' : ''}${pcDelta.toFixed(1)}W over ${n} readings (avg ${pcAvg.toFixed(1)}W, latest ${last.power_consumption.toFixed(1)}W)`,
    );
  }

  // Internal temperature trend
  const tiDelta = last.temperature_internal - first.temperature_internal;
  if (Math.abs(tiDelta) > 0.3) {
    trends.push(
      `${spacecraftId} temperature_internal: ${tiDelta > 0 ? '+' : ''}${tiDelta.toFixed(1)}°C over ${n} readings (latest ${last.temperature_internal.toFixed(1)}°C)`,
    );
  }

  // Signal strength trend
  const ssDelta = last.signal_strength - first.signal_strength;
  if (Math.abs(ssDelta) > 1) {
    trends.push(
      `${spacecraftId} signal_strength: ${ssDelta > 0 ? '+' : ''}${ssDelta.toFixed(1)}dBm over ${n} readings (latest ${last.signal_strength.toFixed(1)}dBm)`,
    );
  }

  // Solar panel output trend
  const spDelta = last.solar_panel_output - first.solar_panel_output;
  if (Math.abs(spDelta) > 2) {
    trends.push(
      `${spacecraftId} solar_panel_output: ${spDelta > 0 ? '+' : ''}${spDelta.toFixed(1)}W over ${n} readings (latest ${last.solar_panel_output.toFixed(1)}W)`,
    );
  }

  if (trends.length === 0) {
    trends.push(`${spacecraftId}: All monitored parameters stable across ${n} readings.`);
  }
  return trends;
}

/**
 * Builds the full structured context block for the Copilot — includes
 * mission context, per-spacecraft subsystem details, and telemetry trends.
 */
function buildCopilotContext(ctx: CopilotQueryContext): string {
  const missionCtx = buildMissionContext(
    ctx.spacecraft ?? [],
    ctx.anomalies ?? [],
    ctx.latestTelemetry ?? [],
    ctx.orbitalData,
  );

  const lines: string[] = [missionCtx, ''];

  // Append per-spacecraft telemetry trends when history is available
  if (ctx.telemetryHistory && Object.keys(ctx.telemetryHistory).length > 0) {
    lines.push('TELEMETRY TRENDS (recent history, 5-minute intervals):');
    for (const [scId, history] of Object.entries(ctx.telemetryHistory)) {
      const trends = computeTelemetryTrends(scId, history);
      for (const t of trends) {
        lines.push(`  ${t}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Mission Brief via Granite ─────────────────────────────────────────────────

const BRIEF_INSTRUCTION = `Using ONLY the mission context above, generate a mission briefing in the following JSON format.
Do not add any fields not listed. Do not invent data. If a field has no applicable content, use an empty array [].

{
  "summary": "One-paragraph fleet status summary with key numbers.",
  "critical_issues": ["Issue string 1", "Issue string 2"],
  "spacecraft_requiring_attention": [
    {"spacecraft_id": "ORBIT-XX", "spacecraft_name": "ORBIT-XX", "reason": "brief reason", "priority": 1}
  ],
  "telemetry_trends": ["Trend description 1"],
  "recommended_actions": ["IMMEDIATE: Action 1", "HIGH: Action 2", "MEDIUM: Action 3"]
}

Return ONLY valid JSON. No markdown fences, no prose outside the JSON object.`;

async function watsonxMissionBrief(
  spacecraft: Spacecraft[],
  anomalies: Anomaly[],
  cfg: WatsonxConfig,
  latestTelemetry: TelemetryReading[] = [],
): Promise<MissionBrief> {
  const ctx = buildMissionContext(spacecraft, anomalies, latestTelemetry);
  const messages: WatsonxMessage[] = [
    { role: 'system', content: ORBITGUARD_SYSTEM_PROMPT },
    { role: 'user', content: `${ctx}\n\n${BRIEF_INSTRUCTION}` },
  ];

  const raw = await callWatsonx(messages, cfg, 900);

  // Strip optional markdown fences the model sometimes adds
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  const parsed = JSON.parse(jsonText) as Partial<MissionBrief>;

  return {
    generated_at: new Date().toISOString(),
    overall_status:
      spacecraft.some(s => s.status === 'critical') ? 'critical' :
      spacecraft.some(s => s.status === 'warning') ? 'warning' : 'nominal',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    critical_issues: Array.isArray(parsed.critical_issues) ? parsed.critical_issues : [],
    spacecraft_requiring_attention: Array.isArray(parsed.spacecraft_requiring_attention)
      ? parsed.spacecraft_requiring_attention
      : [],
    telemetry_trends: Array.isArray(parsed.telemetry_trends) ? parsed.telemetry_trends : [],
    recommended_actions: Array.isArray(parsed.recommended_actions)
      ? parsed.recommended_actions
      : [],
    confidence: 0.92,
    data_source: 'watsonx',
  };
}

// ── Mission Copilot via Granite — structured analysis ─────────────────────────

const COPILOT_ANALYSIS_INSTRUCTION = `Using ONLY the mission context provided above, answer the operator's question by producing a structured operational analysis in the following JSON format. Do not add any fields not listed. Do not invent telemetry values, spacecraft names, or readings.

{
  "situation": "One to two sentences describing the current situation directly relevant to the question, using spacecraft name and specific numeric values from the telemetry data.",
  "evidence": [
    "Specific observed value 1 (e.g., 'ORBIT-01 battery_voltage: 24.1V, nominal range 27.0–29.5V')",
    "Specific observed value 2",
    "Trend observation if available (e.g., 'battery_voltage dropped 2.4V over last 12 readings')"
  ],
  "risk": "One to two sentences on the operational risk and potential mission impact if this situation is not addressed.",
  "next_step": "The single most important recommended action for operators to take right now. Prefix with urgency: IMMEDIATE / HIGH / MEDIUM / MONITOR.",
  "confidence": 0.0
}

Rules:
- confidence must be a number between 0.0 and 1.0 representing your analysis confidence given the available data
- evidence must be a JSON array of strings, each citing specific parameter name and value from the context
- If data required to answer the question is not present in the context, set situation to "Information not available in current mission data." and evidence to []
- Return ONLY valid JSON. No markdown fences, no prose outside the JSON object.`;

interface CopilotAnalysisRaw {
  situation: string;
  evidence: string[];
  risk: string;
  next_step: string;
  confidence: number;
}

async function watsonxCopilot(
  ctx: CopilotQueryContext,
  cfg: WatsonxConfig,
): Promise<{ text: string; structured: CopilotAnalysisRaw | null; sources: string[] }> {
  const fullContext = buildCopilotContext(ctx);

  const userContent = `${fullContext}\n\nMission Operator Question: ${ctx.question}\n\n${COPILOT_ANALYSIS_INSTRUCTION}`;

  const messages: WatsonxMessage[] = [
    { role: 'system', content: ORBITGUARD_SYSTEM_PROMPT },
  ];

  // Inject last few conversation turns for continuity (oldest → newest)
  if (ctx.conversationHistory && ctx.conversationHistory.length > 0) {
    const history = ctx.conversationHistory
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6); // last 3 exchanges
    messages.push(...history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })));
  }

  messages.push({ role: 'user', content: userContent });

  const raw = await callWatsonx(messages, cfg, 1000);

  // Determine what data was used
  const sources: string[] = ['IBM Granite via watsonx.ai', 'live spacecraft telemetry'];
  if ((ctx.anomalies ?? []).length > 0) sources.push('anomaly detection engine');
  if (ctx.telemetryHistory && Object.keys(ctx.telemetryHistory).length > 0) sources.push('telemetry trend analysis');

  // Parse structured JSON response
  let structured: CopilotAnalysisRaw | null = null;
  try {
    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(jsonText) as Partial<CopilotAnalysisRaw>;
    if (
      typeof parsed.situation === 'string' &&
      Array.isArray(parsed.evidence) &&
      typeof parsed.risk === 'string' &&
      typeof parsed.next_step === 'string' &&
      typeof parsed.confidence === 'number'
    ) {
      structured = {
        situation: parsed.situation,
        evidence: parsed.evidence.filter((e): e is string => typeof e === 'string'),
        risk: parsed.risk,
        next_step: parsed.next_step,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
      };
    }
  } catch {
    // Non-JSON response from model — use raw text as situation fallback
    structured = null;
  }

  // Produce human-readable text whether or not JSON parsed
  const text = structured
    ? formatStructuredAnalysis(structured)
    : raw; // use Granite's raw output as fallback prose

  return { text, structured, sources };
}

/** Converts a parsed CopilotAnalysisRaw into formatted markdown text for display. */
function formatStructuredAnalysis(s: CopilotAnalysisRaw): string {
  const urgency = s.next_step.startsWith('IMMEDIATE') ? '🔴'
    : s.next_step.startsWith('HIGH') ? '🟠'
    : s.next_step.startsWith('MEDIUM') ? '🟡'
    : '🔵';

  const evidenceLines = s.evidence.length > 0
    ? s.evidence.map(e => `• ${e}`).join('\n')
    : '• No specific telemetry data available for this query.';

  return `**SITUATION**
${s.situation}

**EVIDENCE**
${evidenceLines}

**RISK**
${s.risk}

**RECOMMENDED NEXT STEP** ${urgency}
${s.next_step}

**CONFIDENCE:** ${(s.confidence * 100).toFixed(0)}%`;
}

// ── Anomaly explanation via Granite ──────────────────────────────────────────

const ANOMALY_EXPLAIN_INSTRUCTION = `Using ONLY the anomaly data and telemetry context above, provide a structured explanation.

Format your response exactly as follows:

**ANOMALY SUMMARY**
One sentence describing what was detected.

**WHAT CHANGED**
• Specific parameter changes with numeric values from the telemetry.

**WHY IT MATTERS**
• Subsystem impact and operational risk.

**EVIDENCE FROM TELEMETRY**
• List the specific observed values vs expected ranges.

**AFFECTED SUBSYSTEM**
State the subsystem name and its current health status.

**SEVERITY ASSESSMENT**
Explain why the severity is classified as it is (use the confidence value).

**RECOMMENDED INVESTIGATION**
• Concrete next steps for mission operators to verify and address the anomaly.
• Note: These are decision-support recommendations. Operators must verify before acting.

Use ONLY data from the supplied context. State clearly if any information is unavailable.`;

export async function explainAnomaly(
  anomaly: Anomaly,
  telemetry: TelemetryReading[],
): Promise<AIResponse> {
  const cfg = getWatsonxConfig();

  if (cfg) {
    try {
      const telemetryCtx = telemetry.length > 0
        ? buildMissionContext([], [anomaly], telemetry)
        : buildMissionContext([], [anomaly], []);

      const messages: WatsonxMessage[] = [
        { role: 'system', content: ORBITGUARD_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${telemetryCtx}\n\n${ANOMALY_EXPLAIN_INSTRUCTION}`,
        },
      ];

      const response = await callWatsonx(messages, cfg, 700);
      return {
        content: response,
        provider: 'watsonx',
        confidence: anomaly.confidence,
        sources: ['watsonx.ai', 'anomaly detection engine'],
      };
    } catch (err) {
      // Fall through to demo
      console.error(
        '[OrbitGuard] watsonx anomaly explanation failed, using demo:',
        err instanceof WatsonxError ? err.message : 'Unknown error',
      );
    }
  }

  // Demo fallback: build explanation from structured anomaly data
  const demoContent = buildDemoAnomalyExplanation(anomaly, telemetry);
  return {
    content: demoContent,
    provider: 'demo',
    confidence: anomaly.confidence,
    sources: ['anomaly detection engine', 'simulated telemetry'],
  };
}

function buildDemoAnomalyExplanation(anomaly: Anomaly, telemetry: TelemetryReading[]): string {
  const latest = telemetry[telemetry.length - 1];
  return `**ANOMALY SUMMARY**
${anomaly.explanation}

**WHAT CHANGED**
• Parameter: \`${anomaly.parameter}\`
• Observed value: **${anomaly.observed_value}**
• Expected range: ${anomaly.expected_range[0]} – ${anomaly.expected_range[1]}
• Deviation: ${(anomaly.observed_value - ((anomaly.expected_range[0] + anomaly.expected_range[1]) / 2)).toFixed(2)} from midpoint${
  anomaly.related_parameters?.length
    ? `\n• Related parameters also affected: ${anomaly.related_parameters.join(', ')}`
    : ''
}

**WHY IT MATTERS**
• Anomaly type: ${anomaly.anomaly_type.replace(/_/g, ' ')}
• Severity: **${anomaly.severity.toUpperCase()}** — this classification reflects the magnitude of deviation from nominal operating parameters.

**EVIDENCE FROM TELEMETRY**
${latest ? `• Battery voltage: ${latest.battery_voltage.toFixed(2)} V
• Power consumption: ${latest.power_consumption.toFixed(1)} W
• Internal temperature: ${latest.temperature_internal.toFixed(1)} °C
• Signal strength: ${latest.signal_strength.toFixed(1)} dBm` : '• No telemetry snapshot available.'}

**SEVERITY ASSESSMENT**
Detection confidence: **${(anomaly.confidence * 100).toFixed(0)}%**. ${
  anomaly.confidence > 0.85
    ? 'High confidence — the pattern is consistent across multiple readings.'
    : 'Moderate confidence — continue monitoring to confirm the trend.'
}

**RECOMMENDED INVESTIGATION**
${anomaly.recommended_action}

*Note: These are decision-support recommendations generated in Demo Mode. Mission operators should verify all findings before taking action.*`;
}

// ── Demo AI fallback ──────────────────────────────────────────────────────────

function demoMissionCopilotResponse(context: CopilotQueryContext): string {
  const { question, spacecraft = [], anomalies = [], latestTelemetry = [] } = context;
  const q = question.toLowerCase();

  const orbit01 = spacecraft.find(s => s.id === 'ORBIT-01');
  const orbit01Anomalies = anomalies.filter(a => a.spacecraft_id === 'ORBIT-01');
  const orbit01Telemetry = latestTelemetry.find(t => t.spacecraft_id === 'ORBIT-01');

  if (q.includes('orbit-01') || q.includes('orbit01')) {
    if (q.includes('risk') || q.includes('critical') || q.includes('why') || q.includes('wrong')) {
      const primaryAnomaly = orbit01Anomalies.find(a => a.anomaly_type === 'power_system');
      return `**ORBIT-01 Status Analysis**

ORBIT-01 is currently classified as **${orbit01?.status?.toUpperCase() ?? 'CRITICAL'}** with a health score of **${orbit01?.health_score ?? 'N/A'}%**.

**Root Cause: Power System Anomaly**
${primaryAnomaly ? primaryAnomaly.explanation : 'A correlated power system fault has been detected.'}

**Current Telemetry Readings:**
${orbit01Telemetry ? `• Battery Voltage: ${orbit01Telemetry.battery_voltage.toFixed(1)} V (nominal: 27.0–29.5 V)
• Power Consumption: ${orbit01Telemetry.power_consumption.toFixed(0)} W (nominal: 180–210 W)
• Internal Temperature: ${orbit01Telemetry.temperature_internal.toFixed(1)} °C
• Solar Panel Output: ${orbit01Telemetry.solar_panel_output.toFixed(0)} W` : 'Telemetry data not available.'}

**Confidence:** ${primaryAnomaly ? (primaryAnomaly.confidence * 100).toFixed(0) : 87}%

**Recommended Action:** ${primaryAnomaly?.recommended_action ?? 'Run power subsystem diagnostic immediately.'}

*Note: Running in Demo Mode. Configure IBM Granite credentials for live AI analysis.*`;
    }
  }

  if (
    q.includes('which spacecraft') ||
    q.includes('investigate first') ||
    q.includes('priority') ||
    q.includes('attention')
  ) {
    const prioritized = spacecraft
      .filter(s => s.status !== 'nominal')
      .sort((a, b) => a.health_score - b.health_score);

    let response = `**Investigation Priority Order:**\n\n`;
    prioritized.forEach((sc, i) => {
      const scAnomalies = anomalies.filter(a => a.spacecraft_id === sc.id);
      response += `**${i + 1}. ${sc.name}** — ${sc.status.toUpperCase()} (Health: ${sc.health_score}%)\n`;
      if (scAnomalies.length > 0) {
        response += `   → ${scAnomalies[0].explanation.substring(0, 120)}…\n`;
      }
      response += `   Recommended: ${scAnomalies[0]?.recommended_action?.substring(0, 100) ?? 'Standard diagnostic'}\n\n`;
    });
    if (prioritized.length === 0) {
      response += 'All spacecraft are currently operating nominally. No immediate investigation required.';
    }
    return response;
  }

  if (q.includes('anomaly') || q.includes('anomalies')) {
    if (anomalies.length === 0) {
      return 'No active anomalies detected across the fleet at this time. All systems operating within nominal parameters.';
    }
    let response = `**Active Anomaly Summary** (${anomalies.length} total)\n\n`;
    const sorted = [...anomalies].sort((a, b) => {
      const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return sev[a.severity] - sev[b.severity];
    });
    for (const a of sorted.slice(0, 5)) {
      response += `**[${a.severity.toUpperCase()}] ${a.spacecraft_name}** — ${a.anomaly_type.replace(/_/g, ' ')}\n`;
      response += `${a.explanation.substring(0, 200)}\n`;
      response += `*Confidence: ${(a.confidence * 100).toFixed(0)}% | Action: ${a.recommended_action.substring(0, 100)}*\n\n`;
    }
    return response;
  }

  if (q.includes('health') || q.includes('subsystem')) {
    let response = `**Fleet Health Overview:**\n\n`;
    for (const sc of spacecraft) {
      const indicator = sc.health_score >= 80 ? '🟢' : sc.health_score >= 60 ? '🟡' : '🔴';
      response += `**${sc.name}** ${indicator} ${sc.health_score}% (${sc.status})\n`;
      if (sc.subsystems?.length) {
        const worst = [...sc.subsystems].sort((a, b) => a.score - b.score)[0];
        response += `   Lowest subsystem: ${worst.name} at ${worst.score}%\n`;
      }
    }
    return response;
  }

  if (q.includes('last 30') || q.includes('recent') || q.includes('changed')) {
    const orbit01Anoms = anomalies.filter(a => a.spacecraft_id === 'ORBIT-01');
    return `**Recent Mission Events (Last 30 Minutes):**

**ORBIT-01 [CRITICAL]:**
• Battery voltage has continued declining — currently ${orbit01Telemetry?.battery_voltage.toFixed(1) ?? 'N/A'} V
• Power consumption elevated at ${orbit01Telemetry?.power_consumption.toFixed(0) ?? 'N/A'} W
• ${orbit01Anoms.length > 0 ? orbit01Anoms[0].anomaly_type.replace(/_/g, ' ') + ' anomaly remains active' : 'No new anomalies'}

**ORBIT-02 [WARNING]:**
• Thermal readings showing normal orbital cycling variation

**ORBIT-03, ORBIT-04 [NOMINAL]:**
• No significant changes — systems operating within parameters

**ORBIT-05 [WARNING]:**
• Signal strength variation consistent with apoapsis orbital geometry`;
  }

  if (q.includes('simple') || q.includes('explain') || q.includes('layman')) {
    return `**Simple Explanation of Current Situation:**

The most urgent issue is with **ORBIT-01**. Think of it like a laptop battery problem — the spacecraft is using more power than it should be, while its "battery" is draining faster than normal. At the same time, the spacecraft is running hotter than usual, which suggests the extra power use is generating heat.

The anomaly detection system caught this because these three things — higher power use, lower battery voltage, and higher temperature — all happened together at the same time, which is a pattern that typically points to a power regulation problem rather than random sensor noise.

**What needs to happen:** Engineers should run diagnostics on the power management system and consider temporarily switching off non-essential instruments to reduce the load and let the battery recover.

*Note: Running in Demo Mode — configure IBM Granite credentials for live AI analysis.*`;
  }

  // Default
  const missionCtx = buildMissionContext(spacecraft, anomalies, latestTelemetry);
  return `**Mission Status Summary**

${missionCtx}

I can help you analyze specific spacecraft, explain anomalies, review telemetry trends, or recommend investigation priorities. Try asking:
• "Why is ORBIT-01 at high risk?"
• "Which spacecraft should we investigate first?"
• "Explain the current anomaly in simple terms"
• "What changed in the last 30 minutes?"

*Note: Running in Demo Mode — configure IBM Granite credentials for live AI analysis.*`;
}

function demoMissionBrief(spacecraft: Spacecraft[], anomalies: Anomaly[]): MissionBrief {
  const critical = spacecraft.filter(s => s.status === 'critical');
  const warnings = spacecraft.filter(s => s.status === 'warning');
  const criticalAnomalies = anomalies.filter(
    a => a.severity === 'critical' || a.severity === 'high',
  );

  const overallStatus =
    critical.length > 0 ? 'critical' : warnings.length > 0 ? 'warning' : 'nominal';

  const prioritized = [...spacecraft]
    .filter(s => s.status !== 'nominal')
    .sort((a, b) => a.health_score - b.health_score)
    .map((sc, i) => ({
      spacecraft_id: sc.id,
      spacecraft_name: sc.name,
      reason:
        anomalies
          .filter(a => a.spacecraft_id === sc.id)
          .map(a => a.anomaly_type.replace(/_/g, ' '))
          .join(', ') || `${sc.status} status`,
      priority: i + 1,
    }));

  return {
    generated_at: new Date().toISOString(),
    overall_status: overallStatus,
    summary: `OrbitGuard AI mission briefing (Demo Mode) as of ${new Date().toUTCString()}. Fleet: ${critical.length} critical, ${warnings.length} warning, ${spacecraft.filter(s => s.status === 'nominal').length} nominal. ${criticalAnomalies.length} high-severity anomalies require attention.`,
    critical_issues: criticalAnomalies.map(
      a => `[${a.spacecraft_name}] ${a.anomaly_type.replace(/_/g, ' ')}: ${a.explanation.substring(0, 200)}`,
    ),
    spacecraft_requiring_attention: prioritized,
    telemetry_trends: [
      'ORBIT-01: Battery voltage declining at approximately 0.6 V/hour over past 8 hours',
      'ORBIT-01: Power consumption 35–40% above baseline with correlated thermal elevation',
      'ORBIT-02: Thermal regulation showing increased variation — within safe limits',
      'ORBIT-05: Signal strength degradation during apoapsis passages — nominal for orbit geometry',
      'ORBIT-03, ORBIT-04: All parameters within nominal ranges, no trends of concern',
    ],
    recommended_actions: [
      'IMMEDIATE: Run ORBIT-01 power subsystem diagnostic and prepare power-save contingency',
      'HIGH: Schedule ORBIT-01 priority downlink to retrieve detailed subsystem logs',
      'MEDIUM: Review ORBIT-02 thermal control cycling patterns over next two orbital periods',
      'LOW: Adjust ORBIT-05 ground station tracking parameters for apoapsis signal optimization',
      'MONITOR: Continue standard monitoring for ORBIT-03 and ORBIT-04',
    ],
    confidence: 0.88,
    data_source: 'demo',
  };
}

// ── Granite Mission Assessment ────────────────────────────────────────────────

/**
 * Prompt that asks Granite for a focused, structured mission assessment grounded
 * in the real telemetry and anomaly data supplied in the context block.
 */
const ASSESSMENT_INSTRUCTION = `Using ONLY the mission context above — including the spacecraft telemetry readings and active anomalies — generate a structured mission assessment in the following JSON format.
Do not add fields not listed. Do not invent data. Base every value on numbers present in the context.

{
  "overall_status": "nominal | warning | critical | offline | maintenance",
  "primary_risk": "One to two sentences describing the single most critical operational risk right now, citing the spacecraft name, parameter name, and numeric value from the telemetry.",
  "evidence": [
    "Specific observation 1 — cite parameter name and numeric value (e.g., 'ORBIT-01 battery_voltage: 24.1 V, nominal 27.0–29.5 V')",
    "Specific observation 2",
    "Telemetry trend if available (e.g., 'battery_voltage declined 1.8 V over last 12 readings')"
  ],
  "recommended_action": "The single most important action for operators right now. Prefix with IMMEDIATE / HIGH / MEDIUM / MONITOR.",
  "confidence": 0.0
}

Rules:
- overall_status must be exactly one of: nominal, warning, critical, offline, maintenance
- evidence must contain at least one entry grounded in the telemetry numbers from the context
- confidence must be a number 0.0–1.0
- Return ONLY valid JSON. No markdown fences, no prose outside the JSON object.`;

interface AssessmentRaw {
  overall_status: string;
  primary_risk: string;
  evidence: string[];
  recommended_action: string;
  confidence: number;
}

const VALID_STATUSES = new Set(['nominal', 'warning', 'critical', 'offline', 'maintenance']);

function validateAssessmentRaw(p: Partial<AssessmentRaw>): p is AssessmentRaw {
  return (
    typeof p.overall_status === 'string' && VALID_STATUSES.has(p.overall_status) &&
    typeof p.primary_risk === 'string' && p.primary_risk.length > 0 &&
    Array.isArray(p.evidence) &&
    typeof p.recommended_action === 'string' && p.recommended_action.length > 0 &&
    typeof p.confidence === 'number'
  );
}

async function watsonxAssessment(
  spacecraft: Spacecraft[],
  anomalies: Anomaly[],
  latestTelemetry: TelemetryReading[],
  cfg: WatsonxConfig,
): Promise<GraniteAssessment> {
  const ctx = buildMissionContext(spacecraft, anomalies, latestTelemetry);
  const messages: WatsonxMessage[] = [
    { role: 'system', content: ORBITGUARD_SYSTEM_PROMPT },
    { role: 'user', content: `${ctx}\n\n${ASSESSMENT_INSTRUCTION}` },
  ];

  const raw = await callWatsonx(messages, cfg, 600);
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const parsed = JSON.parse(jsonText) as Partial<AssessmentRaw>;

  if (!validateAssessmentRaw(parsed)) {
    throw new WatsonxError('Assessment response failed validation.', 'parse_error');
  }

  return {
    generated_at: new Date().toISOString(),
    provider: 'watsonx',
    overall_status: parsed.overall_status as GraniteAssessment['overall_status'],
    primary_risk: parsed.primary_risk,
    evidence: parsed.evidence.filter((e): e is string => typeof e === 'string'),
    recommended_action: parsed.recommended_action,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
  };
}

function demoAssessment(
  spacecraft: Spacecraft[],
  anomalies: Anomaly[],
  latestTelemetry: TelemetryReading[],
): GraniteAssessment {
  const critical = spacecraft.filter(s => s.status === 'critical');
  const warnings = spacecraft.filter(s => s.status === 'warning');
  const overallStatus =
    critical.length > 0 ? 'critical' :
    warnings.length > 0 ? 'warning' : 'nominal';

  const highestAnomaly = [...anomalies].sort((a, b) => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return rank[a.severity] - rank[b.severity];
  })[0];

  const primaryRisk = highestAnomaly
    ? `${highestAnomaly.spacecraft_name} has a ${highestAnomaly.severity} ${highestAnomaly.anomaly_type.replace(/_/g, ' ')} anomaly: ${highestAnomaly.explanation.substring(0, 180)}`
    : critical.length > 0
      ? `${critical[0].name} is in critical status with health score ${critical[0].health_score}%.`
      : warnings.length > 0
        ? `${warnings[0].name} is in warning status with health score ${warnings[0].health_score}%.`
        : 'Fleet is operating nominally. No significant risks detected.';

  const evidence: string[] = [];
  for (const t of latestTelemetry.slice(0, 3)) {
    evidence.push(
      `${t.spacecraft_id}: battery_voltage=${t.battery_voltage.toFixed(2)}V, power_consumption=${t.power_consumption.toFixed(1)}W, temperature_internal=${t.temperature_internal.toFixed(1)}°C, solar_panel_output=${t.solar_panel_output.toFixed(1)}W`,
    );
  }
  if (highestAnomaly) {
    evidence.push(
      `Anomaly: ${highestAnomaly.spacecraft_name} ${highestAnomaly.parameter}=${highestAnomaly.observed_value} (expected ${highestAnomaly.expected_range[0]}–${highestAnomaly.expected_range[1]})`,
    );
  }
  if (evidence.length === 0) {
    evidence.push('No telemetry readings available for this assessment.');
  }

  const recommendedAction = highestAnomaly
    ? `${highestAnomaly.severity === 'critical' || highestAnomaly.severity === 'high' ? 'IMMEDIATE' : 'HIGH'}: ${highestAnomaly.recommended_action}`
    : 'MONITOR: Continue standard monitoring across all spacecraft.';

  return {
    generated_at: new Date().toISOString(),
    provider: 'demo',
    overall_status: overallStatus as GraniteAssessment['overall_status'],
    primary_risk: primaryRisk,
    evidence,
    recommended_action: recommendedAction,
    confidence: 0.82,
  };
}

export async function generateGraniteAssessment(
  spacecraft: Spacecraft[],
  anomalies: Anomaly[],
  latestTelemetry: TelemetryReading[],
): Promise<GraniteAssessment> {
  const cfg = getWatsonxConfig();
  if (cfg) {
    try {
      return await watsonxAssessment(spacecraft, anomalies, latestTelemetry, cfg);
    } catch (err) {
      console.error(
        '[OrbitGuard] watsonx assessment failed, using demo:',
        err instanceof WatsonxError ? err.message : 'Unknown error',
      );
    }
  }
  return demoAssessment(spacecraft, anomalies, latestTelemetry);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateMissionBrief(
  spacecraft: Spacecraft[],
  anomalies: Anomaly[],
  latestTelemetry: TelemetryReading[] = [],
): Promise<MissionBrief> {
  const cfg = getWatsonxConfig();
  if (cfg) {
    try {
      return await watsonxMissionBrief(spacecraft, anomalies, cfg, latestTelemetry);
    } catch (err) {
      console.error(
        '[OrbitGuard] watsonx mission brief failed, using demo:',
        err instanceof WatsonxError ? err.message : 'Unknown error',
      );
      return demoMissionBrief(spacecraft, anomalies);
    }
  }
  return demoMissionBrief(spacecraft, anomalies);
}

export async function queryCopilot(context: CopilotQueryContext): Promise<AIResponse> {
  const cfg = getWatsonxConfig();
  if (cfg) {
    try {
      const response = await watsonxCopilot(context, cfg);
      return {
        content: response.text,
        provider: 'watsonx',
        confidence: 0.90,
        sources: response.sources,
      };
    } catch (err) {
      console.error(
        '[OrbitGuard] watsonx copilot failed, using demo:',
        err instanceof WatsonxError ? err.message : 'Unknown error',
      );
      // Fall through to demo
    }
  }

  return {
    content: demoMissionCopilotResponse(context),
    provider: 'demo',
    confidence: 0.85,
    sources: ['simulated telemetry', 'anomaly detection engine'],
  };
}

/** Probe watsonx connectivity. Returns error kind on failure, null on success. */
export async function testWatsonxConnection(): Promise<{
  ok: boolean;
  provider: AIProvider;
  model: string | null;
  error?: string;
  errorKind?: WatsonxErrorKind;
}> {
  const cfg = getWatsonxConfig();
  if (!cfg) {
    return {
      ok: false,
      provider: 'demo',
      model: null,
      error: 'One or more required environment variables are missing (WATSONX_API_KEY, WATSONX_PROJECT_ID, WATSONX_URL, GRANITE_MODEL_ID).',
      errorKind: 'unknown',
    };
  }

  // Reset cached token so the test actually verifies the key
  resetTokenCache();

  try {
    const messages: WatsonxMessage[] = [
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'Respond with exactly the word: CONNECTED' },
    ];
    await callWatsonx(messages, cfg, 20); // minimum safe token count for IBM API
    return { ok: true, provider: 'watsonx', model: cfg.modelId };
  } catch (err) {
    const wx = err instanceof WatsonxError ? err : null;
    return {
      ok: false,
      provider: 'watsonx',
      model: cfg.modelId,
      error: wx?.message ?? 'Connection test failed.',
      errorKind: wx?.kind ?? 'unknown',
    };
  }
}
