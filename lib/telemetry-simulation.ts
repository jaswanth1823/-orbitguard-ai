// ============================================================
// OrbitGuard AI — Satellite Telemetry & Physics Simulation Engine
//
// Models a single satellite with 1-second tick resolution.
// Subsystems simulated:
//   • Orbital cycle   — 90 s period (60 s sunlight / 30 s eclipse)
//   • Battery / EPS   — SoC 20–100 %, voltage 24–32 V, current ±A
//   • Thermal         — core avionics, solar array, payload
//   • Power (EPS)     — solar generation, bus load, bus voltage
//
// Failure modes (injected on demand):
//   • thermal_runaway     — heater fails; core temp climbs past 55 °C
//   • solar_occlusion     — array misalignment; solar gen drops 80 %
//   • battery_degradation — impedance surge; rapid SoC + voltage drop
//   • payload_surge       — current spike; consumption exceeds 400 W
//
// Server-process singleton — one engine per Next.js worker.
// ============================================================

import { EventEmitter } from 'events';

// ── Types ─────────────────────────────────────────────────────────────────────

/** All active anomaly modes (multiple can co-exist) */
export type AnomalyMode =
  | 'thermal_runaway'
  | 'solar_occlusion'
  | 'battery_degradation'
  | 'payload_surge';

/** Orbital phase */
export type OrbitalPhase = 'sunlight' | 'eclipse';

/** Full simulation snapshot broadcast every tick */
export interface SimTelemetry {
  // ── Metadata ──
  tick: number;                     // monotonic counter
  timestamp: string;               // ISO-8601 UTC
  /** Whether this reading came from real ISS telemetry or the physics engine */
  data_source: 'simulation' | 'live';

  // ── Orbital cycle ──
  orbital_phase: OrbitalPhase;
  orbital_progress_pct: number;    // 0–100 % through 90-s period
  time_in_phase_s: number;         // seconds elapsed in current phase
  remaining_in_phase_s: number;    // seconds until phase transition

  // ── Battery / EPS ──
  battery_soc_pct: number;         // 20–100 %
  battery_voltage_v: number;       // 24.0–32.0 V
  battery_current_a: number;       // +4 A charging … -6 A discharging
  battery_temp_c: number;          // -10 °C to +45 °C

  // ── Thermal ──
  core_temp_c: number;             // 15–35 °C nominal (55 °C = runaway)
  solar_array_temp_c: number;      // -80 °C eclipse, +110 °C sunlight
  payload_temp_c: number;          // 20–40 °C nominal

  // ── Power (EPS) ──
  solar_generation_w: number;      // 0 W eclipse, 450 W sunlight
  power_consumption_w: number;     // 220 W base (400+ W surge)
  eps_bus_voltage_v: number;       // 28.0 V ± 0.5 V nominal

  // ── Active anomalies ──
  active_anomalies: AnomalyMode[];
  /** Descriptions for currently active anomalies only — empty when no anomalies are active */
  anomaly_descriptions: Partial<Record<AnomalyMode, string>>;

  // ── Live ISS fields (only present when data_source === 'live') ──
  iss_latitude?: number;           // decimal degrees
  iss_longitude?: number;          // decimal degrees
  iss_altitude_km?: number;        // km
  iss_velocity_kph?: number;       // km/h
  iss_solar_lat?: number;          // sub-solar point latitude
  iss_solar_lng?: number;          // sub-solar point longitude
  iss_footprint_km?: number;       // visibility footprint diameter km
}

/** Runtime state of the simulation engine */
export interface SimulationState {
  running: boolean;
  spacecraft_id: string;
  tick: number;
  latest: SimTelemetry | null;
  active_anomalies: AnomalyMode[];
}

// ── Physics constants ─────────────────────────────────────────────────────────

const ORBITAL_PERIOD_S = 90;
const SUNLIGHT_DURATION_S = 60;
const ECLIPSE_DURATION_S = 30;   // = ORBITAL_PERIOD_S - SUNLIGHT_DURATION_S

const SOLAR_GEN_NOMINAL_W = 450;   // W in full sunlight
const SOLAR_GEN_ECLIPSE_W = 0;     // W in eclipse
const BASE_CONSUMPTION_W = 220;    // W steady-state bus load

const BATTERY_CAPACITY_AH = 40;    // Ah
const BATTERY_FULL_V = 32.0;       // V at 100 % SoC
const BATTERY_LOW_V = 24.0;        // V at 20 % SoC (hard floor)
const BATTERY_SOC_MIN = 20;        // % floor
const BATTERY_SOC_MAX = 100;       // % ceiling
const CHARGE_RATE_A = 4.0;         // A when net-positive (sun + margin)
const DISCHARGE_RATE_A = -6.0;     // A max discharge (eclipse)

const CORE_NOMINAL_C = 25;         // °C avionics nominal
const SOLAR_ARRAY_SUN_C = 85;      // °C array in full sun
const SOLAR_ARRAY_ECL_C = -60;     // °C array in eclipse
const PAYLOAD_NOMINAL_C = 30;      // °C payload nominal

const BUS_NOMINAL_V = 28.0;        // V
const BUS_RIPPLE_V = 0.5;          // V peak ripple amplitude

// Anomaly effect parameters
const THERMAL_RUNAWAY_RATE_C_PER_S = 0.08;   // °C/s heater fault climb
const THERMAL_RUNAWAY_TARGET_C = 65;          // °C ceiling under fault
const SOLAR_OCCLUSION_FACTOR = 0.20;          // 20 % of nominal generation
const BATTERY_DEGRADE_SOC_RATE = 0.04;        // %/s SoC bleed
const BATTERY_DEGRADE_V_RATE = 0.003;         // V/s voltage sag (additional)
const PAYLOAD_SURGE_W = 200;                  // W extra above base load

// Thermal time constants (1-second RC-style first-order lag)
const CORE_TC = 120;         // s — slow core thermal mass
const SOLAR_ARRAY_TC = 15;   // s — fast array response to sun/shadow

// ── Small Gaussian noise helper ───────────────────────────────────────────────

function gauss(sigma: number): number {
  // Box-Muller
  const u = Math.random();
  const v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u + 1e-15)) * Math.cos(2 * Math.PI * v);
}

// ── Simulation engine ─────────────────────────────────────────────────────────

class TelemetrySimulationEngine extends EventEmitter {
  private _running = false;
  private _interval: ReturnType<typeof setInterval> | null = null;
  private _tick = 0;
  private _spacecraftId: string;

  // Active failure modes — plain array, deduped in triggerAnomaly
  private _anomalies: AnomalyMode[] = [];

  // Physics integrator state
  private _socPct: number;
  private _battVoltage: number;
  private _coreTemp: number;
  private _solarArrayTemp: number;
  private _payloadTemp: number;
  private _epsBusVoltage: number;

  // Latest published snapshot
  private _latest: SimTelemetry | null = null;

  // SSE subscriber callbacks — plain array, deduped in subscribe
  private _subscribers: Array<(t: SimTelemetry) => void> = [];

  constructor(spacecraftId: string) {
    super();
    this._spacecraftId = spacecraftId;

    // Start at a realistic mid-orbit state
    this._socPct = 72;
    this._battVoltage = this._socToVoltage(72);
    this._coreTemp = CORE_NOMINAL_C;
    this._solarArrayTemp = (SOLAR_ARRAY_SUN_C + SOLAR_ARRAY_ECL_C) / 2;
    this._payloadTemp = PAYLOAD_NOMINAL_C;
    this._epsBusVoltage = BUS_NOMINAL_V;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get running() { return this._running; }
  get spacecraftId() { return this._spacecraftId; }
  get tick() { return this._tick; }
  get latest() { return this._latest; }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._interval = setInterval(() => this._step(), 1000);
    // Emit an initial snapshot immediately so subscribers don't wait 1 s
    this._step();
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /** Inject a failure mode. Safe to call when already active. */
  triggerAnomaly(mode: AnomalyMode): void {
    if (!this._anomalies.includes(mode)) this._anomalies.push(mode);
  }

  /** Resolve a previously injected failure mode. */
  resolveAnomaly(mode: AnomalyMode): void {
    this._anomalies = this._anomalies.filter(m => m !== mode);
  }

  resolveAllAnomalies(): void {
    this._anomalies = [];
  }

  /** Subscribe to live telemetry ticks. Returns unsubscribe fn. */
  subscribe(cb: (t: SimTelemetry) => void): () => void {
    if (!this._subscribers.includes(cb)) this._subscribers.push(cb);
    // Send last-known state immediately if available
    if (this._latest) cb(this._latest);
    return () => {
      this._subscribers = this._subscribers.filter(s => s !== cb);
    };
  }

  getState(): SimulationState {
    return {
      running: this._running,
      spacecraft_id: this._spacecraftId,
      tick: this._tick,
      latest: this._latest,
      active_anomalies: this._anomalies.slice(),
    };
  }

  // ── Physics step (called every 1 s) ─────────────────────────────────────────

  private _step(): void {
    this._tick += 1;
    const dt = 1; // seconds per tick

    // ── 1. Orbital mechanics ─────────────────────────────────────────────────

    const posInPeriod = (this._tick * dt) % ORBITAL_PERIOD_S;
    const inSunlight = posInPeriod < SUNLIGHT_DURATION_S;
    const phase: OrbitalPhase = inSunlight ? 'sunlight' : 'eclipse';
    const timeInPhase = inSunlight ? posInPeriod : posInPeriod - SUNLIGHT_DURATION_S;
    const phaseDuration = inSunlight ? SUNLIGHT_DURATION_S : ECLIPSE_DURATION_S;
    const remainingInPhase = phaseDuration - timeInPhase;
    const orbitalProgressPct = (posInPeriod / ORBITAL_PERIOD_S) * 100;

    // ── 2. Solar power generation ─────────────────────────────────────────────

    let solarGen = inSunlight ? SOLAR_GEN_NOMINAL_W : SOLAR_GEN_ECLIPSE_W;

    if (this._anomalies.includes('solar_occlusion')) {
      // Array misalignment — only 20 % of nominal even in sunlight
      solarGen *= SOLAR_OCCLUSION_FACTOR;
    }
    solarGen += gauss(3); // small sensor noise
    solarGen = Math.max(0, solarGen);

    // ── 3. Power consumption ──────────────────────────────────────────────────

    let consumption = BASE_CONSUMPTION_W;

    if (this._anomalies.includes('payload_surge')) {
      consumption += PAYLOAD_SURGE_W;
    }
    consumption += gauss(4);
    consumption = Math.max(50, consumption);

    // ── 4. Battery current and SoC ────────────────────────────────────────────

    const netPower = solarGen - consumption; // W surplus / deficit
    // Convert net power to battery current: I = P / V_bat
    let battCurrent = netPower / Math.max(this._battVoltage, 24);

    // Clamp to charge / discharge limits
    battCurrent = Math.max(DISCHARGE_RATE_A, Math.min(CHARGE_RATE_A, battCurrent));

    // SoC integration (1 s tick): ΔSoC = I * dt / (capacity * 36) expressed in %/s
    // capacity in Ah → Ah = A·h → for 1-s tick: ΔAh = I / 3600
    let deltaSocPct = (battCurrent / BATTERY_CAPACITY_AH) * (1 / 3600) * 100;

    if (this._anomalies.includes('battery_degradation')) {
      // Impedance surge: additional SoC bleed + voltage sag
      deltaSocPct -= BATTERY_DEGRADE_SOC_RATE;
      this._battVoltage -= BATTERY_DEGRADE_V_RATE;
    }

    this._socPct = Math.max(BATTERY_SOC_MIN, Math.min(BATTERY_SOC_MAX, this._socPct + deltaSocPct));

    // Voltage derived from SoC (linear approximation)
    const targetVoltage = this._socToVoltage(this._socPct);
    // Smooth toward target (fast RC: 5 s)
    this._battVoltage += (targetVoltage - this._battVoltage) * (dt / 5);
    // Degrade mode applies additional sag already above — re-floor
    this._battVoltage = Math.max(BATTERY_LOW_V, Math.min(BATTERY_FULL_V, this._battVoltage));

    const battVoltageNoise = gauss(0.02);
    const battTempBase = inSunlight ? 22 : 5;
    const battTemp = battTempBase + (this._socPct - 50) * 0.1 + gauss(0.5);

    // ── 5. Thermal — solar array ──────────────────────────────────────────────

    const targetArrayTemp = inSunlight ? SOLAR_ARRAY_SUN_C : SOLAR_ARRAY_ECL_C;
    this._solarArrayTemp += (targetArrayTemp - this._solarArrayTemp) * (dt / SOLAR_ARRAY_TC);
    const arrayTemp = this._solarArrayTemp + gauss(1.5);

    // ── 6. Thermal — core avionics ────────────────────────────────────────────

    // Base core temperature is driven by power dissipation and solar heating
    const thermalLoad = consumption / BASE_CONSUMPTION_W; // relative load
    const targetCoreTemp = CORE_NOMINAL_C + (thermalLoad - 1) * 10 + (inSunlight ? 3 : -3);

    if (this._anomalies.includes('thermal_runaway')) {
      // Heater failure — core climbs relentlessly
      if (this._coreTemp < THERMAL_RUNAWAY_TARGET_C) {
        this._coreTemp += THERMAL_RUNAWAY_RATE_C_PER_S * dt;
      }
    } else {
      // Normal first-order thermal regulation
      this._coreTemp += (targetCoreTemp - this._coreTemp) * (dt / CORE_TC);
    }
    const coreTemp = this._coreTemp + gauss(0.3);

    // ── 7. Payload temperature ────────────────────────────────────────────────

    const targetPayloadTemp = PAYLOAD_NOMINAL_C + (this._anomalies.includes('payload_surge') ? 8 : 0)
      + (inSunlight ? 4 : -4);
    this._payloadTemp += (targetPayloadTemp - this._payloadTemp) * (dt / 60);
    const payloadTemp = this._payloadTemp + gauss(0.4);

    // ── 8. EPS bus voltage ────────────────────────────────────────────────────

    // Bus stays near 28 V but ripples slightly with load changes
    const loadFactor = consumption / BASE_CONSUMPTION_W;
    const targetBus = BUS_NOMINAL_V - (loadFactor - 1) * 0.3;
    this._epsBusVoltage += (targetBus - this._epsBusVoltage) * (dt / 3);
    const busRipple = Math.sin(this._tick * 0.5) * 0.03; // small 60Hz-like ripple simulation
    const epsBusVoltage = Math.max(27.0, Math.min(29.5,
      this._epsBusVoltage + BUS_RIPPLE_V * busRipple + gauss(0.01)
    ));

    // ── 9. Assemble snapshot ─────────────────────────────────────────────────

    const descriptions: Record<AnomalyMode, string> = {
      thermal_runaway:     'Heater controller failure — core avionics temperature climbing uncontrolled',
      solar_occlusion:     'Solar array misalignment — generation reduced to 20 % of nominal',
      battery_degradation: 'Battery impedance surge — accelerated SoC and voltage discharge',
      payload_surge:       'Payload current spike — power consumption exceeding 400 W threshold',
    };

    const snapshot: SimTelemetry = {
      tick: this._tick,
      timestamp: new Date().toISOString(),
      data_source: 'simulation',

      orbital_phase: phase,
      orbital_progress_pct: Math.round(orbitalProgressPct * 10) / 10,
      time_in_phase_s: Math.round(timeInPhase),
      remaining_in_phase_s: Math.round(remainingInPhase),

      battery_soc_pct: Math.round(this._socPct * 10) / 10,
      battery_voltage_v: Math.round((this._battVoltage + battVoltageNoise) * 100) / 100,
      battery_current_a: Math.round(battCurrent * 100) / 100,
      battery_temp_c: Math.round(battTemp * 10) / 10,

      core_temp_c: Math.round(coreTemp * 10) / 10,
      solar_array_temp_c: Math.round(arrayTemp * 10) / 10,
      payload_temp_c: Math.round(payloadTemp * 10) / 10,

      solar_generation_w: Math.round(solarGen * 10) / 10,
      power_consumption_w: Math.round(consumption * 10) / 10,
      eps_bus_voltage_v: Math.round(epsBusVoltage * 1000) / 1000,

      active_anomalies: Array.from(this._anomalies) as AnomalyMode[],
      anomaly_descriptions: Object.fromEntries(
        Array.from(this._anomalies).map(m => [m, descriptions[m]])
      ) as Record<AnomalyMode, string>,
    };

    this._latest = snapshot;
    this.emit('tick', snapshot);
    this._subscribers.forEach(cb => {
      try { cb(snapshot); } catch { /* never crash the loop */ }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Linear SoC → voltage mapping (24 V at 20 % SoC, 32 V at 100 % SoC) */
  private _socToVoltage(socPct: number): number {
    const t = (socPct - BATTERY_SOC_MIN) / (BATTERY_SOC_MAX - BATTERY_SOC_MIN);
    return BATTERY_LOW_V + t * (BATTERY_FULL_V - BATTERY_LOW_V);
  }
}

// ── Module-level singleton registry (one engine per spacecraft_id) ─────────────
// Next.js keeps module state across requests in a long-lived server process.

// Plain object registry avoids Map iteration issues entirely
const _engines: Record<string, TelemetrySimulationEngine> = {};

/**
 * Returns (and lazily creates) the simulation engine for a given spacecraft.
 * The engine is NOT started automatically — call engine.start() explicitly.
 */
export function getSimulationEngine(spacecraftId: string): TelemetrySimulationEngine {
  if (!_engines[spacecraftId]) {
    _engines[spacecraftId] = new TelemetrySimulationEngine(spacecraftId);
  }
  return _engines[spacecraftId];
}

/** List all spacecraft IDs that currently have an active engine. */
export function listActiveEngines(): string[] {
  return Object.keys(_engines).filter(id => _engines[id].running);
}

// Re-export types so consumers can import from a single place
export type { SimTelemetry as TelemetrySimSnapshot };
