// ============================================================
// Deterministic seed data for OrbitGuard AI
// Generates 24h+ of realistic spacecraft telemetry
// ============================================================

import type {
  Spacecraft,
  TelemetryReading,
  Anomaly,
  AnomalySeverity,
} from './types';

// --------------- Deterministic PRNG (seeded) ---------------
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  gauss(mean: number, std: number): number {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }
}

// --------------- Base spacecraft definitions ---------------
export const SPACECRAFT_DEFINITIONS: Omit<Spacecraft, 'health_score' | 'risk_level' | 'last_telemetry_at' | 'active_anomalies' | 'subsystems'>[] = [
  {
    id: 'ORBIT-01',
    name: 'ORBIT-01',
    mission: 'Earth Observation Alpha',
    launch_date: '2023-03-15T00:00:00Z',
    operator: 'OrbitGuard Operations',
    orbit_type: 'LEO (Low Earth Orbit)',
    status: 'critical',
    description: 'Primary Earth observation satellite. Currently experiencing power system anomaly with increasing power consumption and battery degradation.',
  },
  {
    id: 'ORBIT-02',
    name: 'ORBIT-02',
    mission: 'Climate Monitoring Beta',
    launch_date: '2023-06-22T00:00:00Z',
    operator: 'OrbitGuard Operations',
    orbit_type: 'SSO (Sun-Synchronous)',
    status: 'warning',
    description: 'Climate monitoring satellite with minor thermal variation outside nominal parameters.',
  },
  {
    id: 'ORBIT-03',
    name: 'ORBIT-03',
    mission: 'Communications Relay Gamma',
    launch_date: '2022-11-08T00:00:00Z',
    operator: 'OrbitGuard Operations',
    orbit_type: 'MEO (Medium Earth Orbit)',
    status: 'nominal',
    description: 'Communications relay satellite. All systems nominal.',
  },
  {
    id: 'ORBIT-04',
    name: 'ORBIT-04',
    mission: 'Science Platform Delta',
    launch_date: '2024-01-19T00:00:00Z',
    operator: 'OrbitGuard Operations',
    orbit_type: 'GEO (Geostationary)',
    status: 'nominal',
    description: 'Scientific research platform in geostationary orbit. Systems operating within expected parameters.',
  },
  {
    id: 'ORBIT-05',
    name: 'ORBIT-05',
    mission: 'Deep Space Survey Epsilon',
    launch_date: '2023-09-30T00:00:00Z',
    operator: 'OrbitGuard Operations',
    orbit_type: 'HEO (High Elliptical)',
    status: 'warning',
    description: 'Deep space survey satellite. Signal strength degradation detected at apoapsis passages.',
  },
];

// --------------- Telemetry generation helpers ---------------

/** Nominal parameter ranges per spacecraft */
const NOMINAL_RANGES: Record<string, {
  battery_voltage: [number, number];
  power_consumption: [number, number];
  temperature_internal: [number, number];
  temperature_external: [number, number];
  signal_strength: [number, number];
  altitude: [number, number];
  velocity: [number, number];
  solar_panel_output: [number, number];
  attitude_error: [number, number];
  memory_usage: [number, number];
}> = {
  'ORBIT-01': {
    battery_voltage: [27.0, 29.5],
    power_consumption: [180, 210],
    temperature_internal: [18, 25],
    temperature_external: [-40, 60],
    signal_strength: [-85, -70],
    altitude: [498, 502],
    velocity: [7.61, 7.63],
    solar_panel_output: [240, 260],
    attitude_error: [0.01, 0.15],
    memory_usage: [45, 65],
  },
  'ORBIT-02': {
    battery_voltage: [26.5, 29.0],
    power_consumption: [150, 175],
    temperature_internal: [15, 28],
    temperature_external: [-50, 70],
    signal_strength: [-90, -72],
    altitude: [600, 620],
    velocity: [7.55, 7.57],
    solar_panel_output: [200, 230],
    attitude_error: [0.01, 0.12],
    memory_usage: [30, 55],
  },
  'ORBIT-03': {
    battery_voltage: [27.5, 30.0],
    power_consumption: [200, 230],
    temperature_internal: [20, 26],
    temperature_external: [-30, 55],
    signal_strength: [-75, -62],
    altitude: [8047, 8053],
    velocity: [6.31, 6.33],
    solar_panel_output: [260, 290],
    attitude_error: [0.01, 0.10],
    memory_usage: [55, 75],
  },
  'ORBIT-04': {
    battery_voltage: [28.0, 30.5],
    power_consumption: [420, 460],
    temperature_internal: [22, 28],
    temperature_external: [-25, 50],
    signal_strength: [-68, -55],
    altitude: [35785, 35788],
    velocity: [3.073, 3.075],
    solar_panel_output: [480, 520],
    attitude_error: [0.005, 0.08],
    memory_usage: [60, 80],
  },
  'ORBIT-05': {
    battery_voltage: [26.0, 28.5],
    power_consumption: [160, 185],
    temperature_internal: [10, 22],
    temperature_external: [-70, 45],
    signal_strength: [-105, -80],
    altitude: [4800, 52000],
    velocity: [1.5, 10.2],
    solar_panel_output: [180, 220],
    attitude_error: [0.02, 0.20],
    memory_usage: [35, 60],
  },
};

/**
 * Generate telemetry for a single spacecraft over the past `hours` hours.
 * Readings are generated every 5 minutes (12/hour).
 */
export function generateTelemetryHistory(
  spacecraftId: string,
  hoursBack: number = 25,
  seedOffset: number = 0
): TelemetryReading[] {
  const ranges = NOMINAL_RANGES[spacecraftId];
  if (!ranges) return [];

  const rng = new SeededRandom(spacecraftId.charCodeAt(0) * 1000 + seedOffset);
  const now = new Date();
  const readings: TelemetryReading[] = [];
  const intervalMinutes = 5;
  const totalReadings = (hoursBack * 60) / intervalMinutes;

  // ORBIT-01 anomaly progression: starts at 8 hours ago, worsens over time
  const orbit01AnomalyStart = (hoursBack - 8) * (60 / intervalMinutes);

  for (let i = 0; i < totalReadings; i++) {
    const timestamp = new Date(now.getTime() - (totalReadings - i) * intervalMinutes * 60 * 1000);

    let bv = rng.gauss(
      (ranges.battery_voltage[0] + ranges.battery_voltage[1]) / 2,
      (ranges.battery_voltage[1] - ranges.battery_voltage[0]) / 8
    );
    let pc = rng.gauss(
      (ranges.power_consumption[0] + ranges.power_consumption[1]) / 2,
      (ranges.power_consumption[1] - ranges.power_consumption[0]) / 8
    );
    let ti = rng.gauss(
      (ranges.temperature_internal[0] + ranges.temperature_internal[1]) / 2,
      (ranges.temperature_internal[1] - ranges.temperature_internal[0]) / 8
    );
    let te = rng.gauss(
      (ranges.temperature_external[0] + ranges.temperature_external[1]) / 2,
      (ranges.temperature_external[1] - ranges.temperature_external[0]) / 6
    );
    let ss = rng.gauss(
      (ranges.signal_strength[0] + ranges.signal_strength[1]) / 2,
      (ranges.signal_strength[1] - ranges.signal_strength[0]) / 8
    );
    let alt = rng.gauss(
      (ranges.altitude[0] + ranges.altitude[1]) / 2,
      (ranges.altitude[1] - ranges.altitude[0]) / 12
    );
    let vel = rng.gauss(
      (ranges.velocity[0] + ranges.velocity[1]) / 2,
      (ranges.velocity[1] - ranges.velocity[0]) / 10
    );
    let spo = rng.gauss(
      (ranges.solar_panel_output[0] + ranges.solar_panel_output[1]) / 2,
      (ranges.solar_panel_output[1] - ranges.solar_panel_output[0]) / 8
    );
    let ae = Math.abs(rng.gauss(
      (ranges.attitude_error[0] + ranges.attitude_error[1]) / 2,
      (ranges.attitude_error[1] - ranges.attitude_error[0]) / 6
    ));
    let mu = rng.gauss(
      (ranges.memory_usage[0] + ranges.memory_usage[1]) / 2,
      (ranges.memory_usage[1] - ranges.memory_usage[0]) / 8
    );

    // ---- ORBIT-01: Power system anomaly (correlated degradation) ----
    if (spacecraftId === 'ORBIT-01' && i >= orbit01AnomalyStart) {
      const anomalyProgress = (i - orbit01AnomalyStart) / (totalReadings - orbit01AnomalyStart);
      // Battery drains
      bv = bv - anomalyProgress * 4.5;
      // Power consumption increases
      pc = pc + anomalyProgress * 85;
      // Thermal load increases
      ti = ti + anomalyProgress * 12;
      // Solar panel output drops slightly
      spo = spo - anomalyProgress * 30;
    }

    // ---- ORBIT-02: Mild thermal variation ----
    if (spacecraftId === 'ORBIT-02') {
      const orbitPhase = (i * intervalMinutes * Math.PI) / 95; // 95-min orbital period
      ti = ti + Math.sin(orbitPhase) * 4;
      te = te + Math.cos(orbitPhase) * 15;
    }

    // ---- ORBIT-05: Signal degradation at apoapsis ----
    if (spacecraftId === 'ORBIT-05') {
      const orbitPhase = (i * intervalMinutes) / (12 * 60); // 12-hour orbit
      const apoapsis = Math.sin(orbitPhase * 2 * Math.PI);
      if (apoapsis > 0.7) {
        ss = ss - (apoapsis - 0.7) * 25;
        alt = alt + apoapsis * 40000;
        vel = vel - apoapsis * 8;
      }
    }

    readings.push({
      id: `${spacecraftId}-${i}`,
      spacecraft_id: spacecraftId,
      timestamp: timestamp.toISOString(),
      battery_voltage: Math.max(18, Math.min(35, bv)),
      power_consumption: Math.max(50, pc),
      temperature_internal: ti,
      temperature_external: te,
      signal_strength: Math.max(-130, Math.min(-40, ss)),
      altitude: Math.max(100, alt),
      velocity: Math.max(1.0, vel),
      solar_panel_output: Math.max(0, spo),
      attitude_error: Math.max(0, Math.min(2, ae)),
      memory_usage: Math.max(0, Math.min(100, mu)),
    });
  }

  return readings;
}

// --------------- Pre-generated telemetry (cached) ---------------
let _telemetryCache: Map<string, TelemetryReading[]> | null = null;

export function getAllTelemetry(): Map<string, TelemetryReading[]> {
  if (_telemetryCache) return _telemetryCache;

  _telemetryCache = new Map();
  for (const sc of SPACECRAFT_DEFINITIONS) {
    _telemetryCache.set(sc.id, generateTelemetryHistory(sc.id, 25));
  }
  return _telemetryCache;
}

export function getLatestTelemetry(spacecraftId: string): TelemetryReading | null {
  const all = getAllTelemetry();
  const readings = all.get(spacecraftId);
  if (!readings || readings.length === 0) return null;
  return readings[readings.length - 1];
}

export function getTelemetryInRange(spacecraftId: string, hoursBack: number): TelemetryReading[] {
  const all = getAllTelemetry();
  const readings = all.get(spacecraftId) || [];
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  return readings.filter(r => new Date(r.timestamp) >= cutoff);
}

// --------------- Health score calculation ---------------
export function calculateHealthScore(spacecraftId: string): {
  overall: number;
  battery: number;
  thermal: number;
  communications: number;
  orbit: number;
  power: number;
  attitude: number;
} {
  const latest = getLatestTelemetry(spacecraftId);
  const ranges = NOMINAL_RANGES[spacecraftId];

  if (!latest || !ranges) {
    return { overall: 50, battery: 50, thermal: 50, communications: 50, orbit: 50, power: 50, attitude: 50 };
  }

  // Battery health: score based on voltage
  const bvMid = (ranges.battery_voltage[0] + ranges.battery_voltage[1]) / 2;
  const bvRange = ranges.battery_voltage[1] - ranges.battery_voltage[0];
  const batteryScore = Math.max(0, Math.min(100,
    100 - Math.max(0, (bvMid - latest.battery_voltage) / bvRange) * 200
  ));

  // Thermal health
  const tiMid = (ranges.temperature_internal[0] + ranges.temperature_internal[1]) / 2;
  const tiRange = ranges.temperature_internal[1] - ranges.temperature_internal[0];
  const thermalDev = Math.abs(latest.temperature_internal - tiMid) / (tiRange * 0.5);
  const thermalScore = Math.max(0, Math.min(100, 100 - thermalDev * 40));

  // Communications health
  const commsScore = Math.max(0, Math.min(100,
    50 + (latest.signal_strength - ranges.signal_strength[0]) /
    (ranges.signal_strength[1] - ranges.signal_strength[0]) * 50
  ));

  // Orbit health (altitude deviation)
  const altMid = (ranges.altitude[0] + ranges.altitude[1]) / 2;
  const altRange = Math.max(1, ranges.altitude[1] - ranges.altitude[0]);
  const altDev = Math.abs(latest.altitude - altMid) / (altRange * 2);
  const orbitScore = Math.max(0, Math.min(100, 100 - altDev * 30));

  // Power health
  const pcMid = (ranges.power_consumption[0] + ranges.power_consumption[1]) / 2;
  const pcRange = ranges.power_consumption[1] - ranges.power_consumption[0];
  const powerDev = Math.max(0, (latest.power_consumption - pcMid) / (pcRange * 0.5));
  const powerScore = Math.max(0, Math.min(100, 100 - powerDev * 35));

  // Attitude health
  const aeNominal = (ranges.attitude_error[0] + ranges.attitude_error[1]) / 2;
  const attitudeDev = Math.max(0, (latest.attitude_error - aeNominal) / aeNominal);
  const attitudeScore = Math.max(0, Math.min(100, 100 - attitudeDev * 25));

  // Weighted overall
  const overall = Math.round(
    batteryScore * 0.25 +
    thermalScore * 0.15 +
    commsScore * 0.20 +
    orbitScore * 0.15 +
    powerScore * 0.15 +
    attitudeScore * 0.10
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    battery: Math.round(batteryScore),
    thermal: Math.round(thermalScore),
    communications: Math.round(commsScore),
    orbit: Math.round(orbitScore),
    power: Math.round(powerScore),
    attitude: Math.round(attitudeScore),
  };
}

// --------------- Anomaly detection ---------------
export function detectAnomalies(spacecraftId: string): Anomaly[] {
  const readings = getTelemetryInRange(spacecraftId, 25);
  if (readings.length < 20) return [];

  const anomalies: Anomaly[] = [];
  const ranges = NOMINAL_RANGES[spacecraftId];
  if (!ranges) return [];

  const latest = readings[readings.length - 1];
  const windowSize = 12; // 1 hour of readings
  const recentReadings = readings.slice(-windowSize);

  // Calculate rolling stats
  const avgBV = recentReadings.reduce((s, r) => s + r.battery_voltage, 0) / recentReadings.length;
  const avgPC = recentReadings.reduce((s, r) => s + r.power_consumption, 0) / recentReadings.length;
  const avgTI = recentReadings.reduce((s, r) => s + r.temperature_internal, 0) / recentReadings.length;
  const avgSS = recentReadings.reduce((s, r) => s + r.signal_strength, 0) / recentReadings.length;

  const nominalBV = (ranges.battery_voltage[0] + ranges.battery_voltage[1]) / 2;
  const nominalPC = (ranges.power_consumption[0] + ranges.power_consumption[1]) / 2;
  const nominalTI = (ranges.temperature_internal[0] + ranges.temperature_internal[1]) / 2;
  const nominalSS = (ranges.signal_strength[0] + ranges.signal_strength[1]) / 2;

  // ---- ORBIT-01: Power system anomaly ----
  if (spacecraftId === 'ORBIT-01') {
    const bvDrop = nominalBV - avgBV;
    const pcIncrease = avgPC - nominalPC;

    if (bvDrop > 1.5 || pcIncrease > 30) {
      const severity: AnomalySeverity = (bvDrop > 3 || pcIncrease > 60) ? 'critical' :
        (bvDrop > 2 || pcIncrease > 45) ? 'high' : 'medium';

      anomalies.push({
        id: `${spacecraftId}-power-anomaly-01`,
        spacecraft_id: spacecraftId,
        spacecraft_name: spacecraftId,
        anomaly_type: 'power_system',
        severity,
        parameter: 'battery_voltage',
        observed_value: parseFloat(avgBV.toFixed(2)),
        expected_range: [ranges.battery_voltage[0], ranges.battery_voltage[1]],
        confidence: Math.min(0.97, 0.6 + bvDrop * 0.12),
        timestamp: latest.timestamp,
        explanation: `Correlated power system anomaly detected: battery voltage has dropped ${bvDrop.toFixed(1)}V below nominal while power consumption has increased ${pcIncrease.toFixed(0)}W above baseline. This pattern is consistent with a power regulation fault or increased load demand. Thermal load is also elevated by ${(avgTI - nominalTI).toFixed(1)}°C.`,
        recommended_action: 'Reduce non-essential payload operations. Run power subsystem diagnostic. Check solar panel efficiency and battery charge controller status. Prepare contingency power-save mode.',
        related_parameters: ['power_consumption', 'temperature_internal', 'solar_panel_output'],
        is_active: true,
      });

      // Secondary thermal anomaly
      if (avgTI - nominalTI > 5) {
        anomalies.push({
          id: `${spacecraftId}-thermal-secondary-01`,
          spacecraft_id: spacecraftId,
          spacecraft_name: spacecraftId,
          anomaly_type: 'thermal',
          severity: 'medium',
          parameter: 'temperature_internal',
          observed_value: parseFloat(avgTI.toFixed(1)),
          expected_range: [ranges.temperature_internal[0], ranges.temperature_internal[1]],
          confidence: 0.81,
          timestamp: latest.timestamp,
          explanation: `Internal temperature elevated ${(avgTI - nominalTI).toFixed(1)}°C above nominal. Likely secondary effect of increased power consumption from primary power system fault. Heat dissipation appears insufficient for current load.`,
          recommended_action: 'Monitor thermal trend. If temperature continues rising, activate supplemental cooling protocol and reduce power loads.',
          related_parameters: ['power_consumption', 'battery_voltage'],
          is_active: true,
        });
      }
    }
  }

  // ---- ORBIT-02: Thermal anomaly ----
  if (spacecraftId === 'ORBIT-02') {
    const tiDev = Math.abs(avgTI - nominalTI);
    if (tiDev > 6) {
      anomalies.push({
        id: `${spacecraftId}-thermal-anomaly-01`,
        spacecraft_id: spacecraftId,
        spacecraft_name: spacecraftId,
        anomaly_type: 'thermal',
        severity: 'medium',
        parameter: 'temperature_internal',
        observed_value: parseFloat(avgTI.toFixed(1)),
        expected_range: [ranges.temperature_internal[0], ranges.temperature_internal[1]],
        confidence: 0.74,
        timestamp: latest.timestamp,
        explanation: `Internal temperature showing increased orbital variation. Current deviation of ${tiDev.toFixed(1)}°C from nominal suggests possible thermal control degradation or enhanced solar input at current orbital geometry.`,
        recommended_action: 'Review thermal control subsystem logs. Check heater/cooler cycling patterns. Monitor over next two orbital periods.',
        related_parameters: ['temperature_external'],
        is_active: true,
      });
    }
  }

  // ---- ORBIT-05: Signal degradation ----
  if (spacecraftId === 'ORBIT-05') {
    const ssDrop = avgSS - nominalSS;
    if (ssDrop < -8) {
      anomalies.push({
        id: `${spacecraftId}-comms-anomaly-01`,
        spacecraft_id: spacecraftId,
        spacecraft_name: spacecraftId,
        anomaly_type: 'communications',
        severity: 'medium',
        parameter: 'signal_strength',
        observed_value: parseFloat(avgSS.toFixed(1)),
        expected_range: [ranges.signal_strength[0], ranges.signal_strength[1]],
        confidence: 0.79,
        timestamp: latest.timestamp,
        explanation: `Signal strength degradation of ${Math.abs(ssDrop).toFixed(1)} dBm detected during apoapsis passages. This pattern is consistent with increased path loss at maximum orbital distance. Ground station antenna pointing may need adjustment.`,
        recommended_action: 'Verify ground station tracking accuracy. Check antenna pointing parameters. Consider scheduling critical data downlinks during perigee passes.',
        related_parameters: ['altitude'],
        is_active: true,
      });
    }
  }

  return anomalies;
}

// --------------- Build full spacecraft with computed fields ---------------
let _spacecraftCache: Spacecraft[] | null = null;

export function buildSpacecraft(): Spacecraft[] {
  if (_spacecraftCache) return _spacecraftCache;

  _spacecraftCache = SPACECRAFT_DEFINITIONS.map(def => {
    const health = calculateHealthScore(def.id);
    const anomalies = detectAnomalies(def.id);
    const latest = getLatestTelemetry(def.id);

    const riskLevel = health.overall >= 80 ? 'low' :
      health.overall >= 60 ? 'medium' :
      health.overall >= 40 ? 'high' : 'critical';

    return {
      ...def,
      health_score: health.overall,
      risk_level: riskLevel as Spacecraft['risk_level'],
      last_telemetry_at: latest?.timestamp || new Date().toISOString(),
      active_anomalies: anomalies.filter(a => a.is_active).length,
      subsystems: [
        {
          name: 'Power & Battery',
          score: health.battery,
          status: health.battery >= 80 ? 'nominal' : health.battery >= 60 ? 'warning' : 'critical',
          last_updated: latest?.timestamp || new Date().toISOString(),
          details: `${latest?.battery_voltage.toFixed(1)}V | ${latest?.power_consumption.toFixed(0)}W consumption`,
        },
        {
          name: 'Thermal Control',
          score: health.thermal,
          status: health.thermal >= 80 ? 'nominal' : health.thermal >= 60 ? 'warning' : 'critical',
          last_updated: latest?.timestamp || new Date().toISOString(),
          details: `${latest?.temperature_internal.toFixed(1)}°C internal | ${latest?.temperature_external.toFixed(1)}°C external`,
        },
        {
          name: 'Communications',
          score: health.communications,
          status: health.communications >= 80 ? 'nominal' : health.communications >= 60 ? 'warning' : 'critical',
          last_updated: latest?.timestamp || new Date().toISOString(),
          details: `${latest?.signal_strength.toFixed(1)} dBm signal`,
        },
        {
          name: 'Orbit & Navigation',
          score: health.orbit,
          status: health.orbit >= 80 ? 'nominal' : health.orbit >= 60 ? 'warning' : 'critical',
          last_updated: latest?.timestamp || new Date().toISOString(),
          details: `${latest?.altitude.toFixed(0)} km altitude`,
        },
        {
          name: 'Solar Power',
          score: health.power,
          status: health.power >= 80 ? 'nominal' : health.power >= 60 ? 'warning' : 'critical',
          last_updated: latest?.timestamp || new Date().toISOString(),
          details: `${latest?.solar_panel_output.toFixed(0)}W output`,
        },
        {
          name: 'Attitude Control',
          score: health.attitude,
          status: health.attitude >= 80 ? 'nominal' : health.attitude >= 60 ? 'warning' : 'critical',
          last_updated: latest?.timestamp || new Date().toISOString(),
          details: `${latest?.attitude_error.toFixed(3)}° error`,
        },
      ],
    };
  });
  return _spacecraftCache;
}

// --------------- Dashboard metrics ---------------
let _metricsCache: ReturnType<typeof _computeDashboardMetrics> | null = null;

function _computeDashboardMetrics() {
  const spacecraft = buildSpacecraft();
  const allAnomalies = spacecraft.flatMap(sc => detectAnomalies(sc.id));
  return {
    active_spacecraft: spacecraft.filter(s => s.status !== 'offline').length,
    healthy_spacecraft: spacecraft.filter(s => s.status === 'nominal').length,
    warning_spacecraft: spacecraft.filter(s => s.status === 'warning').length,
    critical_spacecraft: spacecraft.filter(s => s.status === 'critical').length,
    offline_spacecraft: spacecraft.filter(s => s.status === 'offline').length,
    open_anomalies: allAnomalies.filter(a => a.is_active).length,
    resolved_anomalies_24h: 2,
    total_telemetry_readings_24h: spacecraft.length * 288,
    data_source: 'simulated' as const,
    last_updated: new Date().toISOString(),
  };
}

export function getDashboardMetrics() {
  if (_metricsCache) return _metricsCache;
  _metricsCache = _computeDashboardMetrics();
  return _metricsCache;
}

export function getAllAnomalies(): Anomaly[] {
  const spacecraft = buildSpacecraft();
  return spacecraft.flatMap(sc => detectAnomalies(sc.id))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
