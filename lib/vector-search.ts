// ============================================================
// Vector Search Architecture for OrbitGuard AI
// Supports pgvector, Pinecone, or Weaviate
// ============================================================

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    document_type: 'manual' | 'procedure' | 'documentation' | 'emergency' | 'interpretation';
    spacecraft_id?: string;
    subsystem?: string;
    tags?: string[];
    version?: string;
  };
}

export interface VectorSearchOptions {
  query: string;
  topK?: number;
  filter?: {
    document_type?: string;
    spacecraft_id?: string;
    subsystem?: string;
  };
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;
}

// --------------- Document corpus ---------------
// This corpus will be vectorized when a vector DB is configured.
// In demo mode, it serves as a static knowledge base for keyword search.
export const SPACE_DOCUMENT_CORPUS: VectorDocument[] = [
  {
    id: 'manual-power-001',
    content: `POWER SUBSYSTEM OPERATIONS MANUAL — Section 4: Battery Management
    
    Battery Voltage Nominal Range: 27.0V – 29.5V
    Low Voltage Warning: < 26.0V
    Critical Low Voltage: < 24.0V
    
    The spacecraft employs a Lithium-Ion battery array with a nominal capacity of 120Wh.
    The charge controller regulates charging current based on solar panel output and load demand.
    
    Anomaly Response Procedure for Battery Voltage Drop:
    1. Identify power consumers contributing to excess load
    2. Switch non-essential payloads to standby mode
    3. Verify solar panel orientation and output efficiency
    4. Run battery charge controller diagnostic
    5. If voltage < 25V: activate emergency power-save mode
    6. If voltage < 23V: initiate safe mode and contact mission control`,
    metadata: {
      source: 'Power Subsystem Operations Manual v3.2',
      document_type: 'manual',
      subsystem: 'power',
      tags: ['battery', 'voltage', 'charging', 'anomaly'],
    },
  },
  {
    id: 'proc-power-anomaly-001',
    content: `EMERGENCY PROCEDURE EP-PWR-001: Power System Anomaly Response
    
    Trigger Conditions:
    - Battery voltage below 26V for > 10 minutes
    - Power consumption > 150% of nominal baseline
    - Solar panel output < 60% of expected value
    
    Immediate Actions (within 5 minutes):
    1. Alert mission control operations team
    2. Suspend all non-essential payload operations
    3. Enable power budget monitoring mode
    4. Document anomaly start time and initial readings
    
    Diagnostic Sequence:
    1. Verify battery health indicators (cell voltages, temperature)
    2. Test solar panel array output per panel
    3. Check power distribution unit (PDU) status
    4. Review load profile: identify anomalous consumers
    5. Perform charge controller reset if automated checks pass
    
    Recovery Actions:
    - If solar panels: verify attitude pointing for sun angle
    - If battery: initiate reconditioning cycle
    - If load: isolate and test individual subsystems`,
    metadata: {
      source: 'Emergency Procedures Handbook EP-Series',
      document_type: 'emergency',
      subsystem: 'power',
      tags: ['emergency', 'power', 'battery', 'recovery'],
    },
  },
  {
    id: 'interp-battery-001',
    content: `TELEMETRY INTERPRETATION GUIDE — Battery Voltage Readings
    
    Interpreting Battery Voltage Trends:
    
    Gradual decline over hours: Indicates increasing load or reduced solar input.
    The rate of decline is key: > 0.5V/hour warrants investigation.
    
    Sudden drop: Could indicate battery cell failure or sudden load spike.
    Check power_consumption simultaneously.
    
    Correlated Pattern — Power System Fault:
    If battery_voltage decreasing AND power_consumption increasing simultaneously,
    this is the classic signature of a power regulation fault. The spacecraft is
    consuming more power than it is generating/storing.
    
    Additionally, temperature_internal will rise as power dissipation increases.
    Monitor solar_panel_output: if output is normal but consumption is high,
    the fault is downstream (load or distribution). If output is low, check
    solar panel health and attitude pointing.`,
    metadata: {
      source: 'Telemetry Interpretation Guide v2.1',
      document_type: 'interpretation',
      subsystem: 'power',
      tags: ['battery', 'telemetry', 'interpretation', 'correlated'],
    },
  },
  {
    id: 'manual-thermal-001',
    content: `THERMAL CONTROL SUBSYSTEM MANUAL — Section 2: Temperature Management
    
    Internal Temperature Nominal Range: 18°C – 25°C (operational)
    Upper Warning: > 30°C
    Critical Upper: > 40°C
    Lower Warning: < 10°C
    
    The passive thermal control system uses multi-layer insulation (MLI) and
    surface coatings to manage heat. Active heaters protect cold-sensitive components.
    
    Orbital temperature cycling is normal: internal temperatures may vary ±5°C
    across the orbital period as the spacecraft transitions between eclipse and sunlight.
    
    Elevated temperature in conjunction with high power consumption indicates
    increased heat dissipation from electronic components. This is a secondary
    effect requiring the root cause (power issue) to be resolved first.`,
    metadata: {
      source: 'Thermal Control Subsystem Manual v1.8',
      document_type: 'manual',
      subsystem: 'thermal',
      tags: ['thermal', 'temperature', 'orbital', 'management'],
    },
  },
  {
    id: 'proc-comms-degradation-001',
    content: `STANDARD PROCEDURE SP-COM-003: Signal Strength Degradation
    
    Signal Strength Nominal Range: -85 dBm to -70 dBm (varies by altitude/geometry)
    
    Causes of Signal Degradation:
    1. Increased path loss at higher altitudes (expected at apoapsis for elliptical orbits)
    2. Antenna pointing misalignment
    3. Ground station tracking error
    4. RF chain component degradation
    5. Atmospheric conditions (tropospheric scintillation)
    
    Diagnostic Steps:
    1. Verify expected geometry: calculate predicted signal strength from orbital parameters
    2. Compare actual vs predicted: if worse than predicted, investigate hardware
    3. Check antenna pointing telemetry
    4. Request station tracking verification from ground network
    5. Compare signal levels across multiple ground stations if available`,
    metadata: {
      source: 'Communications Procedures Manual SP-Series',
      document_type: 'procedure',
      subsystem: 'communications',
      tags: ['signal', 'communications', 'antenna', 'degradation'],
    },
  },
  {
    id: 'interp-orbit-001',
    content: `TELEMETRY INTERPRETATION GUIDE — Orbital Parameters
    
    Altitude Interpretation:
    LEO satellites (400-600km): normal variation < 2km due to atmospheric drag
    MEO satellites (8000km): variation < 10km expected
    GEO satellites (35786km): variation < 5km expected
    
    Altitude decay: A continuous decline in altitude indicates atmospheric drag
    exceeding planned drag makeup maneuvers. Station-keeping budget should be reviewed.
    
    Velocity correlation: Altitude and velocity are inversely related in circular orbits.
    For ORBIT-01 at 500km LEO, orbital velocity ≈ 7.62 km/s.
    A 1km altitude drop corresponds to ~0.001 km/s velocity increase.
    
    Maneuver signatures: A sudden altitude change with corresponding velocity change
    indicates a propulsion event. Check if a scheduled maneuver explains the reading.`,
    metadata: {
      source: 'Telemetry Interpretation Guide v2.1',
      document_type: 'interpretation',
      subsystem: 'orbit',
      tags: ['altitude', 'orbit', 'velocity', 'LEO'],
    },
  },
];

// --------------- Simple keyword search (demo mode) ---------------
export function keywordSearch(
  query: string,
  topK: number = 5,
  filter?: VectorSearchOptions['filter']
): VectorSearchResult[] {
  const q = query.toLowerCase();
  const keywords = q.split(/\s+/).filter(w => w.length > 3);

  let corpus = SPACE_DOCUMENT_CORPUS;
  if (filter?.document_type) {
    corpus = corpus.filter(d => d.metadata.document_type === filter.document_type);
  }
  if (filter?.subsystem) {
    corpus = corpus.filter(d => d.metadata.subsystem === filter.subsystem);
  }

  const scored = corpus.map(doc => {
    const text = (doc.content + ' ' + (doc.metadata.tags || []).join(' ')).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const matches = (text.match(new RegExp(kw, 'g')) || []).length;
      score += matches;
    }
    return { document: doc, score };
  });

  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// --------------- Vector DB provider abstraction ---------------
export type VectorDBType = 'pgvector' | 'pinecone' | 'weaviate' | 'demo';

export interface VectorDBProvider {
  search(options: VectorSearchOptions): Promise<VectorSearchResult[]>;
  upsert(documents: VectorDocument[]): Promise<void>;
  type: VectorDBType;
}

class DemoVectorProvider implements VectorDBProvider {
  type: VectorDBType = 'demo';

  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    return keywordSearch(options.query, options.topK || 5, options.filter);
  }

  async upsert(_documents: VectorDocument[]): Promise<void> {
    // No-op in demo mode
    console.log(`Demo vector provider: would upsert ${_documents.length} documents`);
  }
}

class PgVectorProvider implements VectorDBProvider {
  type: VectorDBType = 'pgvector';

  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    // Full implementation requires pgvector extension + embedding model
    // Falling back to keyword search for demo
    console.warn('pgvector not configured — using keyword fallback');
    return keywordSearch(options.query, options.topK || 5, options.filter);
  }

  async upsert(_documents: VectorDocument[]): Promise<void> {
    // Implementation: INSERT INTO documents (id, content, embedding, metadata)
    // with ON CONFLICT DO UPDATE
    console.log('pgvector upsert: implementation pending database connection');
  }
}

// --------------- Factory ---------------
let _vectorProvider: VectorDBProvider | null = null;

export function getVectorProvider(): VectorDBProvider {
  if (_vectorProvider) return _vectorProvider;

  const type = (process.env.VECTOR_DB_TYPE || 'demo') as VectorDBType;
  switch (type) {
    case 'pgvector':
      _vectorProvider = new PgVectorProvider();
      break;
    default:
      _vectorProvider = new DemoVectorProvider();
  }
  return _vectorProvider;
}

export async function searchDocuments(query: string, options?: Partial<VectorSearchOptions>): Promise<VectorSearchResult[]> {
  const provider = getVectorProvider();
  return provider.search({ query, topK: 5, ...options });
}
