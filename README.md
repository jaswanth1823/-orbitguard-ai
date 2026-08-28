# OrbitGuard AI
## 🚀 Live Demo

👉 *[Launch OrbitGuard AI](orbitguard-ai.vercel.app)*

👉 **[View Source Code](https://github.com/jaswanth1823/-orbitguard-ai)**
🤖 How IBM Bob Was Used
IBM Bob was used as the AI-assisted development environment to accelerate the development of OrbitGuard AI.
IBM Bob helped with:
Generating and modifying application components
Building the Next.js application structure
Creating API routes
Implementing the satellite/orbital data integration
Integrating the N2YO provider
Maintaining the simulation fallback system
Creating UI components for mission monitoring
Connecting application functionality with Supabase
Integrating the AI-powered Mission Copilot
Debugging and improving application functionality
Preparing the application for production deployment
> **AI-powered spacecraft mission monitoring and decision-support platform**

OrbitGuard AI transforms raw spacecraft telemetry into understandable, actionable mission intelligence. Designed for space exploration operations teams, it combines real-time telemetry monitoring, statistical anomaly detection, and IBM Granite AI to provide comprehensive mission situational awareness.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [IBM Granite / watsonx Configuration](#ibm-granite--watsonx-configuration)
6. [Database Setup](#database-setup)
7. [Python Anomaly Detection Service](#python-anomaly-detection-service)
8. [Space Data Integration](#space-data-integration)
9. [Vector Search](#vector-search)
10. [Running the Demo](#running-the-demo)
11. [Application Structure](#application-structure)
12. [API Reference](#api-reference)
13. [Demo Scenario](#demo-scenario)
14. [Production Deployment](#production-deployment)

---

## Overview

### Core Features

- **Real-time fleet monitoring** — 5 spacecraft with live telemetry visualization
- **AI Anomaly Detection** — Statistical anomaly detection with correlated pattern analysis
- **Mission Health Scores** — Explainable 0–100 health scoring across 6 subsystems
- **AI Mission Copilot** — Conversational AI assistant backed by IBM Granite or demo fallback
- **Mission Intelligence** — AI-generated mission briefings with investigation priorities
- **Vector Knowledge Base** — Spacecraft manuals, emergency procedures, and interpretation guides
- **Graceful Degradation** — Every feature works without paid services via simulation mode

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Backend | Next.js API Routes |
| Anomaly Detection | Python (FastAPI, statistics) |
| AI | IBM Granite via watsonx.ai (+ demo fallback) |
| Database | PostgreSQL / Supabase (+ in-memory demo) |
| Vector Search | pgvector / Pinecone / Weaviate (+ keyword demo) |

---

## Architecture

```
orbitguard-ai/
├── app/                          # Next.js App Router pages
│   ├── dashboard/                # Fleet overview dashboard
│   ├── satellites/               # Spacecraft list + detail pages
│   ├── anomalies/                # Anomaly engine view
│   ├── mission-copilot/          # AI conversational interface
│   ├── mission-intelligence/     # AI mission briefing
│   ├── settings/                 # Configuration
│   └── api/                      # API routes
│       ├── dashboard/
│       ├── satellites/[id]/
│       ├── anomalies/
│       ├── copilot/
│       ├── mission-intelligence/
│       └── telemetry/
├── components/
│   ├── layout/                   # AppShell, Sidebar, TopBar
│   ├── dashboard/                # Dashboard-specific widgets
│   └── ui/                       # Reusable UI components
├── lib/
│   ├── types.ts                  # TypeScript interfaces
│   ├── seed-data.ts              # Deterministic simulated data
│   ├── space-data-provider.ts    # Data abstraction layer
│   ├── ai-provider.ts            # IBM Granite / demo AI
│   ├── vector-search.ts          # Vector DB abstraction
│   └── utils.ts                  # Utilities
├── services/
│   └── anomaly_detection/
│       ├── server.py             # FastAPI anomaly service
│       └── requirements.txt
└── database/
    └── schema.sql                # PostgreSQL schema
```

### Data Flow

```
Spacecraft Telemetry
       │
       ▼
SpaceDataProvider ─── Simulated (demo) ─── 25h deterministic telemetry
       │            └─ Live (N2YO API)
       ▼
Anomaly Detection Engine
       │            ┌─ Python Service (FastAPI)  ← statistical z-score
       └──────────── └─ TypeScript fallback (built-in)
       ▼
Health Score Calculator (per-subsystem, explainable)
       ▼
AI Provider ────────── IBM Granite (watsonx.ai) ← real credentials
       │            └─ Demo AI (data-driven responses)
       ▼
Mission Intelligence + Copilot Interface
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (for anomaly detection service, optional)

### Installation

```bash
# 1. Navigate to the project
cd orbitguard-ai

# 2. Install Node.js dependencies
npm install

# 3. Copy environment template
cp .env.local.example .env.local

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to the dashboard.

The application works **fully in demo mode** without any external credentials.

### Optional: Python Anomaly Service

```bash
# In a separate terminal
cd services/anomaly_detection
pip install -r requirements.txt
python server.py
```

The Python service runs on `http://localhost:8000`. If not running, the TypeScript implementation handles anomaly detection automatically.

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and configure:

```env
# IBM watsonx AI (optional — demo works without this)
WATSONX_API_KEY=your_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_watsonx_project_id
WATSONX_URL=https://us-south.ml.cloud.ibm.com
GRANITE_MODEL_ID=ibm/granite-3-8b-instruct

# Database (optional — in-memory demo works without this)
DATABASE_URL=postgresql://user:password@localhost:5432/orbitguard

# Vector Database (optional)
VECTOR_DB_TYPE=pgvector    # or: pinecone, weaviate, demo

# Space Data APIs (optional)
N2YO_API_KEY=your_n2yo_key

# App config
NEXT_PUBLIC_DATA_MODE=demo     # demo | live | auto
```

### Required vs Optional

| Variable | Required | Purpose |
|----------|----------|---------|
| `WATSONX_API_KEY` | No | Enables IBM Granite AI |
| `WATSONX_PROJECT_ID` | No | Required with API key |
| `DATABASE_URL` | No | Persists telemetry/anomalies |
| `N2YO_API_KEY` | No | Real satellite TLE data |
| All others | No | Demo mode covers everything |

---

## IBM Granite / watsonx Configuration

OrbitGuard AI uses IBM Granite for:
- **Mission Copilot**: Answering natural language questions about spacecraft
- **Mission Intelligence**: Generating AI mission briefings
- **Anomaly Explanation**: Producing detailed plain-language explanations

### Setup Steps

1. Create an IBM Cloud account at [cloud.ibm.com](https://cloud.ibm.com)
2. Provision a **watsonx.ai** instance
3. Create a **Project** in watsonx.ai
4. Generate an **API Key** in IBM Cloud IAM
5. Add credentials to `.env.local`

### AI Provider Abstraction

```typescript
// lib/ai-provider.ts
export function getActiveProvider(): AIProvider {
  const apiKey = process.env.WATSONX_API_KEY;
  const projectId = process.env.WATSONX_PROJECT_ID;
  if (apiKey && projectId) return 'watsonx';
  return 'demo';  // Automatic fallback
}
```

When watsonx credentials are absent, the application:
- Shows **"Demo Mode"** in the sidebar AI Engine status
- Uses deterministic, data-driven responses based on actual telemetry
- Provides the same interface and functionality

### Supported Models

- `ibm/granite-3-8b-instruct` (default, recommended)
- `ibm/granite-3-2b-instruct` (faster, lower cost)
- `ibm/granite-13b-instruct-v2` (higher quality)

---

## Database Setup

### PostgreSQL (Local)

```bash
# Create database
createdb orbitguard

# Run schema
psql orbitguard -f database/schema.sql
```

### Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `database/schema.sql` in the SQL editor
3. Copy the connection string to `DATABASE_URL`

### Without a Database

The application runs entirely from in-memory simulated data. No database required for the demo. When a database is configured, telemetry and anomalies will be persisted there.

---

## Python Anomaly Detection Service

The Python service provides more sophisticated statistical analysis than the TypeScript implementation.

### Running

```bash
cd services/anomaly_detection
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

### API

```http
POST http://localhost:8000/detect
Content-Type: application/json

{
  "spacecraft_id": "ORBIT-01",
  "telemetry": [...telemetry readings...],
  "window_size": 12
}
```

### Detection Algorithms

1. **Z-Score Analysis**: Detects values deviating > 2σ from rolling mean
2. **Range Violation**: Flags values outside defined nominal ranges
3. **Correlated Pattern Detection**: Identifies multi-parameter anomalies
   - Power fault: battery ↓ + consumption ↑ + temperature ↑
   - Thermal fault: temperature deviation with eclipse/sunlight correlation
   - Communications: signal ↓ with altitude-path-loss correlation

### Fallback Behavior

If the Python service is unavailable, the TypeScript implementation in `lib/seed-data.ts` provides equivalent detection automatically.

---

## Space Data Integration

### SpaceDataProvider Abstraction

```typescript
// lib/space-data-provider.ts
interface SpaceDataProvider {
  getSpacecraft(): Promise<Spacecraft[]>;
  getTelemetry(id: string, hoursBack: number): Promise<TelemetryReading[]>;
  getAnomalies(id?: string): Promise<Anomaly[]>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  getState(): SpaceDataProviderState;
}
```

### Modes

| Mode | Behavior |
|------|---------|
| `demo` | Uses deterministic simulated telemetry |
| `live` | Attempts N2YO API, falls back to simulation |
| `auto` | Uses live when available, simulation otherwise |

Set via `NEXT_PUBLIC_DATA_MODE` environment variable.

### External API Support

When `N2YO_API_KEY` is configured and `NEXT_PUBLIC_DATA_MODE=live`:
- TLE data fetched from [n2yo.com/api](https://www.n2yo.com/api/)
- Orbital position computed from TLE data
- Real altitude/velocity populated

---

## Vector Search

OrbitGuard AI includes a vector knowledge base containing:

- Spacecraft operations manuals (power, thermal, communications, attitude)
- Mission procedures (standard and emergency)
- Subsystem documentation
- Telemetry interpretation guides

### Architecture

```typescript
// lib/vector-search.ts
interface VectorDBProvider {
  search(options: VectorSearchOptions): Promise<VectorSearchResult[]>;
  upsert(documents: VectorDocument[]): Promise<void>;
}
```

### Providers

| Provider | Requirements | Notes |
|----------|-------------|-------|
| `demo` | None | Keyword search, works out of box |
| `pgvector` | PostgreSQL + pgvector extension | Full vector similarity |
| `pinecone` | `PINECONE_API_KEY` | Cloud-hosted vectors |
| `weaviate` | `WEAVIATE_URL` | Self-hosted or cloud |

Set `VECTOR_DB_TYPE` in `.env.local`.

### Adding Documents

```typescript
import { getVectorProvider, SPACE_DOCUMENT_CORPUS } from '@/lib/vector-search';

const provider = getVectorProvider();
await provider.upsert(SPACE_DOCUMENT_CORPUS);
```

---

## Running the Demo

### What the Demo Shows

The demo scenario focuses on **ORBIT-01**:

1. **Power System Anomaly**: Starting ~8 hours ago in the simulation timeline:
   - Battery voltage declines from 28.2V to ~23.7V
   - Power consumption increases from ~195W to ~280W
   - Internal temperature rises from ~21°C to ~33°C

2. **The anomaly engine detects** the correlated pattern and generates:
   - A `critical` severity anomaly classification
   - 87%+ confidence based on multi-parameter correlation
   - Detailed explanation and recommended corrective actions

3. **The dashboard** shows:
   - ORBIT-01 in CRITICAL status with a degraded health score (~45%)
   - Active anomaly count incremented
   - AI Mission Brief highlighting the issue

4. **The Mission Copilot** can answer:
   - "Why is ORBIT-01 at high risk?"
   - "Explain the current anomaly in simple terms"
   - "Which spacecraft should we investigate first?"

5. **Mission Intelligence** auto-prioritizes ORBIT-01 as the highest investigation priority.

### Demo Walkthrough

```
1. Open http://localhost:3000
2. Dashboard: Note ORBIT-01 critical status, 3 open anomalies
3. Click ORBIT-01 → View telemetry charts showing the degradation pattern
4. Navigate to Anomalies → Expand the ORBIT-01 critical anomaly
5. Navigate to Mission Copilot → Ask "Why is ORBIT-01 at high risk?"
6. Navigate to Mission Intelligence → See AI-generated briefing with ORBIT-01 as priority #1
```

---

## Application Structure

### Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Fleet overview with telemetry charts and anomaly timeline |
| `/satellites` | Searchable, sortable spacecraft list |
| `/satellites/[id]` | Detailed telemetry, subsystem health, AI analysis |
| `/anomalies` | Full anomaly engine view with filtering |
| `/mission-copilot` | Conversational AI interface |
| `/mission-intelligence` | AI-generated mission briefing |
| `/settings` | watsonx / database / API configuration |

### Component Architecture

```
components/
├── layout/
│   ├── AppShell.tsx       # Main layout wrapper
│   ├── Sidebar.tsx        # Navigation + AI status
│   └── TopBar.tsx         # Clock, data source, user
├── dashboard/
│   ├── FleetMetricsBar.tsx          # 5 KPI cards
│   ├── TelemetryOverviewChart.tsx   # Interactive line charts
│   ├── AnomalyTimeline.tsx          # Recent anomaly list
│   ├── AIMissionBrief.tsx           # AI summary card
│   └── SpacecraftStatusGrid.tsx     # Fleet health table
└── ui/
    ├── Badge.tsx          # Status/severity/health badges
    ├── Card.tsx           # Card container components
    ├── HealthBar.tsx      # Animated health progress bars
    └── LoadingState.tsx   # Loading/error/empty states
```

---

## API Reference

### `GET /api/dashboard`
Returns spacecraft fleet status, metrics, and recent anomalies.

### `GET /api/satellites`
Returns all spacecraft with health scores and anomaly counts.

### `GET /api/satellites/[id]?hours=24`
Returns detailed spacecraft data: telemetry, anomalies, health breakdown.

### `GET /api/anomalies?spacecraft_id=ORBIT-01&severity=critical`
Returns filtered anomalies.

### `POST /api/copilot`
```json
{ "question": "Why is ORBIT-01 at high risk?" }
```
Returns AI response with confidence and provider information.

### `GET /api/mission-intelligence`
Returns AI-generated mission briefing with investigation priorities.

### `GET /api/telemetry?spacecraft_id=ORBIT-01&hours=6`
Returns raw telemetry readings for charting.

---

## Production Deployment

### Vercel

```bash
npm run build
vercel deploy
```

Set environment variables in Vercel project settings.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Environment Checklist

- [ ] `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` configured
- [ ] `DATABASE_URL` pointing to PostgreSQL instance
- [ ] Database schema applied: `psql $DATABASE_URL -f database/schema.sql`
- [ ] `NEXT_PUBLIC_DATA_MODE=live` if using real space APIs
- [ ] Python anomaly service deployed and `ANOMALY_SERVICE_URL` set

---

## License

MIT — See LICENSE file for details.

---

*Built with IBM Bob · Powered by IBM Granite AI*
