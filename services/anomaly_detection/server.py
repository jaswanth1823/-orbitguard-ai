#!/usr/bin/env python3
"""
OrbitGuard AI — Python Anomaly Detection Service
FastAPI service for statistical anomaly detection on spacecraft telemetry.
Implements z-score and rolling window detection with correlated pattern analysis.
"""

import json
import math
import statistics
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="OrbitGuard AI Anomaly Detection",
    description="Statistical anomaly detection for spacecraft telemetry",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Nominal parameter ranges ──────────────────────────────────────────
NOMINAL_RANGES = {
    "ORBIT-01": {
        "battery_voltage": (27.0, 29.5),
        "power_consumption": (180, 210),
        "temperature_internal": (18, 25),
        "temperature_external": (-40, 60),
        "signal_strength": (-85, -70),
        "altitude": (498, 502),
        "velocity": (7.61, 7.63),
        "solar_panel_output": (240, 260),
        "attitude_error": (0.01, 0.15),
        "memory_usage": (45, 65),
    },
    "ORBIT-02": {
        "battery_voltage": (26.5, 29.0),
        "power_consumption": (150, 175),
        "temperature_internal": (15, 28),
        "temperature_external": (-50, 70),
        "signal_strength": (-90, -72),
        "altitude": (600, 620),
        "velocity": (7.55, 7.57),
        "solar_panel_output": (200, 230),
        "attitude_error": (0.01, 0.12),
        "memory_usage": (30, 55),
    },
}

# ── Request / Response models ─────────────────────────────────────────
class TelemetryPoint(BaseModel):
    timestamp: str
    battery_voltage: float
    power_consumption: float
    temperature_internal: float
    temperature_external: float
    signal_strength: float
    altitude: float
    velocity: float
    solar_panel_output: Optional[float] = None
    attitude_error: Optional[float] = None
    memory_usage: Optional[float] = None

class AnomalyDetectionRequest(BaseModel):
    spacecraft_id: str
    telemetry: list[TelemetryPoint]
    window_size: int = 12  # readings in rolling window (default: 1 hour)

class AnomalyResult(BaseModel):
    anomaly_type: str
    severity: str
    parameter: str
    observed_value: float
    expected_range: list[float]
    confidence: float
    timestamp: str
    explanation: str
    recommended_action: str
    related_parameters: list[str] = []

class DetectionResponse(BaseModel):
    spacecraft_id: str
    anomalies: list[AnomalyResult]
    analysis_timestamp: str
    readings_analyzed: int

# ── Utility functions ─────────────────────────────────────────────────
def z_score(value: float, values: list[float]) -> float:
    """Compute z-score of value against a list of values."""
    if len(values) < 2:
        return 0.0
    mean = statistics.mean(values)
    std = statistics.stdev(values)
    if std < 1e-10:
        return 0.0
    return abs(value - mean) / std


def classify_severity(z: float, range_violation: float) -> str:
    """Classify anomaly severity based on z-score and range violation percentage."""
    if z > 4.0 or range_violation > 0.3:
        return "critical"
    elif z > 3.0 or range_violation > 0.20:
        return "high"
    elif z > 2.0 or range_violation > 0.10:
        return "medium"
    else:
        return "low"


def range_violation_pct(value: float, nominal_min: float, nominal_max: float) -> float:
    """How far outside the nominal range the value is, as a fraction of range width."""
    span = nominal_max - nominal_min
    if span < 1e-10:
        return 0.0
    if value < nominal_min:
        return (nominal_min - value) / span
    elif value > nominal_max:
        return (value - nominal_max) / span
    return 0.0


def compute_confidence(z: float, n_readings: int) -> float:
    """Confidence in anomaly detection based on z-score and sample size."""
    base = min(0.99, 0.5 + z * 0.12)
    sample_factor = min(1.0, n_readings / 24)
    return round(base * sample_factor, 3)

# ── Core detection functions ──────────────────────────────────────────
def detect_power_anomaly(
    sc_id: str,
    recent: list[TelemetryPoint],
    nominal: dict,
    timestamp: str,
) -> Optional[AnomalyResult]:
    """Detect correlated power system anomaly (battery + power consumption + thermal)."""
    bv_vals = [r.battery_voltage for r in recent]
    pc_vals = [r.power_consumption for r in recent]
    ti_vals = [r.temperature_internal for r in recent]

    avg_bv = statistics.mean(bv_vals)
    avg_pc = statistics.mean(pc_vals)
    avg_ti = statistics.mean(ti_vals)

    nom_bv = nominal["battery_voltage"]
    nom_pc = nominal["power_consumption"]
    nom_ti = nominal["temperature_internal"]

    bv_nom_mid = (nom_bv[0] + nom_bv[1]) / 2
    pc_nom_mid = (nom_pc[0] + nom_pc[1]) / 2
    ti_nom_mid = (nom_ti[0] + nom_ti[1]) / 2

    bv_drop = bv_nom_mid - avg_bv
    pc_increase = avg_pc - pc_nom_mid
    ti_increase = avg_ti - ti_nom_mid

    # Require correlated signal across at least 2 parameters
    correlated = sum([
        bv_drop > 1.0,
        pc_increase > 20,
        ti_increase > 4,
    ])

    if correlated < 2:
        return None

    bv_z = z_score(avg_bv, bv_vals)
    rv = range_violation_pct(avg_bv, nom_bv[0], nom_bv[1])
    severity = classify_severity(bv_z, rv)
    confidence = compute_confidence(bv_z, len(recent))

    related = []
    if pc_increase > 20:
        related.append("power_consumption")
    if ti_increase > 4:
        related.append("temperature_internal")

    explanation = (
        f"Correlated power system anomaly detected: battery voltage {bv_drop:.1f}V below nominal "
        f"({avg_bv:.2f}V vs {bv_nom_mid:.1f}V nominal) while power consumption is "
        f"{pc_increase:.0f}W above baseline ({avg_pc:.0f}W). "
        f"Internal temperature elevated by {ti_increase:.1f}°C. "
        f"Pattern consistent with power regulation fault or excessive load demand."
    )

    action = (
        "Reduce non-essential payload operations immediately. "
        "Run power subsystem diagnostic sequence. "
        "Check solar panel efficiency and battery charge controller status. "
        "Prepare contingency power-save mode if voltage drops below 25V."
    )

    return AnomalyResult(
        anomaly_type="power_system",
        severity=severity,
        parameter="battery_voltage",
        observed_value=round(avg_bv, 3),
        expected_range=list(nom_bv),
        confidence=confidence,
        timestamp=timestamp,
        explanation=explanation,
        recommended_action=action,
        related_parameters=related,
    )


def detect_thermal_anomaly(
    sc_id: str,
    recent: list[TelemetryPoint],
    nominal: dict,
    timestamp: str,
) -> Optional[AnomalyResult]:
    """Detect thermal anomaly (internal temperature out of range)."""
    ti_vals = [r.temperature_internal for r in recent]
    avg_ti = statistics.mean(ti_vals)
    nom_ti = nominal["temperature_internal"]
    nom_mid = (nom_ti[0] + nom_ti[1]) / 2

    dev = abs(avg_ti - nom_mid)
    z = z_score(avg_ti, ti_vals)
    rv = range_violation_pct(avg_ti, nom_ti[0], nom_ti[1])

    if dev < 5 and rv < 0.05:
        return None

    severity = classify_severity(z, rv)
    confidence = compute_confidence(z, len(recent))

    explanation = (
        f"Internal temperature deviation of {dev:.1f}°C from nominal center "
        f"({avg_ti:.1f}°C vs {nom_mid:.1f}°C). "
        f"May indicate thermal control degradation, heater malfunction, or increased power dissipation."
    )
    action = (
        "Review thermal control subsystem logs. Monitor heater/cooler cycling patterns "
        "over next two orbital periods. If trend continues, activate thermal protection protocol."
    )

    return AnomalyResult(
        anomaly_type="thermal",
        severity=severity,
        parameter="temperature_internal",
        observed_value=round(avg_ti, 2),
        expected_range=list(nom_ti),
        confidence=confidence,
        timestamp=timestamp,
        explanation=explanation,
        recommended_action=action,
        related_parameters=["temperature_external"],
    )


def detect_comms_anomaly(
    sc_id: str,
    recent: list[TelemetryPoint],
    nominal: dict,
    timestamp: str,
) -> Optional[AnomalyResult]:
    """Detect communications anomaly (signal strength degradation)."""
    ss_vals = [r.signal_strength for r in recent]
    avg_ss = statistics.mean(ss_vals)
    nom_ss = nominal["signal_strength"]
    nom_mid = (nom_ss[0] + nom_ss[1]) / 2

    drop = nom_mid - avg_ss  # positive = degradation
    z = z_score(avg_ss, ss_vals)
    rv = range_violation_pct(avg_ss, nom_ss[0], nom_ss[1])

    if drop < 8 and rv < 0.05:
        return None

    severity = classify_severity(z, rv)
    confidence = compute_confidence(z, len(recent))

    explanation = (
        f"Signal strength degradation of {drop:.1f} dBm detected "
        f"({avg_ss:.1f} dBm vs {nom_mid:.1f} dBm nominal). "
        f"May indicate antenna pointing issue, path loss increase, or RF chain degradation."
    )
    action = (
        "Verify ground station tracking accuracy. Check antenna pointing parameters. "
        "Review RF subsystem health indicators. "
        "Consider rescheduling critical downlinks to next optimal pass window."
    )

    return AnomalyResult(
        anomaly_type="communications",
        severity=severity,
        parameter="signal_strength",
        observed_value=round(avg_ss, 2),
        expected_range=list(nom_ss),
        confidence=confidence,
        timestamp=timestamp,
        explanation=explanation,
        recommended_action=action,
        related_parameters=["altitude"],
    )


def detect_orbit_anomaly(
    sc_id: str,
    recent: list[TelemetryPoint],
    nominal: dict,
    timestamp: str,
) -> Optional[AnomalyResult]:
    """Detect altitude/orbit deviation anomaly."""
    alt_vals = [r.altitude for r in recent]
    avg_alt = statistics.mean(alt_vals)
    nom_alt = nominal["altitude"]
    nom_mid = (nom_alt[0] + nom_alt[1]) / 2

    rv = range_violation_pct(avg_alt, nom_alt[0], nom_alt[1])
    z = z_score(avg_alt, alt_vals)

    if rv < 0.01 and z < 2.0:
        return None

    severity = classify_severity(z, rv)
    confidence = compute_confidence(z, len(recent))

    explanation = (
        f"Altitude deviation detected: {avg_alt:.0f} km vs nominal {nom_mid:.0f} km "
        f"({rv * 100:.1f}% outside expected range). "
        f"May indicate atmospheric drag variation, propulsion anomaly, or orbit determination error."
    )
    action = (
        "Review orbit determination data. Check if maneuver was scheduled. "
        "If unplanned, prepare station-keeping maneuver. Contact flight dynamics team."
    )

    return AnomalyResult(
        anomaly_type="orbit_deviation",
        severity=severity,
        parameter="altitude",
        observed_value=round(avg_alt, 1),
        expected_range=list(nom_alt),
        confidence=confidence,
        timestamp=timestamp,
        explanation=explanation,
        recommended_action=action,
        related_parameters=["velocity"],
    )

# ── Main endpoint ─────────────────────────────────────────────────────
@app.post("/detect", response_model=DetectionResponse)
async def detect_anomalies(request: AnomalyDetectionRequest):
    """
    Run anomaly detection on telemetry data.
    Analyzes correlated patterns across multiple parameters.
    """
    sc_id = request.spacecraft_id
    telemetry = request.telemetry

    if len(telemetry) < 3:
        raise HTTPException(status_code=400, detail="Insufficient telemetry (minimum 3 readings)")

    nominal = NOMINAL_RANGES.get(sc_id, NOMINAL_RANGES.get("ORBIT-01"))
    recent = telemetry[-min(request.window_size, len(telemetry)):]
    latest_ts = recent[-1].timestamp

    anomalies: list[AnomalyResult] = []

    # Run all detectors
    detectors = [
        detect_power_anomaly,
        detect_thermal_anomaly,
        detect_comms_anomaly,
        detect_orbit_anomaly,
    ]
    for detector in detectors:
        result = detector(sc_id, recent, nominal, latest_ts)
        if result:
            anomalies.append(result)

    # Deduplicate: if power anomaly found, downgrade standalone thermal if correlated
    if any(a.anomaly_type == "power_system" for a in anomalies):
        thermal = [a for a in anomalies if a.anomaly_type == "thermal"]
        for t in thermal:
            if "power_consumption" in t.related_parameters:
                t.severity = "medium"
                t.explanation = "(Secondary to power anomaly) " + t.explanation

    return DetectionResponse(
        spacecraft_id=sc_id,
        anomalies=anomalies,
        analysis_timestamp=datetime.now(timezone.utc).isoformat(),
        readings_analyzed=len(telemetry),
    )


@app.get("/health")
async def health_check():
    return {"status": "operational", "service": "OrbitGuard Anomaly Detection", "version": "1.0.0"}


@app.get("/spacecraft/{sc_id}/nominal")
async def get_nominal_ranges(sc_id: str):
    """Return nominal parameter ranges for a spacecraft."""
    if sc_id not in NOMINAL_RANGES:
        return {"error": "Spacecraft not found", "available": list(NOMINAL_RANGES.keys())}
    return {"spacecraft_id": sc_id, "nominal_ranges": NOMINAL_RANGES[sc_id]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
