# System Architecture (v4.0 - Agentic RAG + Weather + Self-Learning)

## 1. High-Level Architecture
SalinAI is a 3-layer event-driven irrigation intelligence system.

1. **Realtime state bus:** Firebase Realtime DB (sensor, actuator, ai_status, action_logs).
2. **Decision intelligence:** Node.js backend + Gemini + MongoDB Atlas Vector Search.
3. **User interfaces:** React dashboard/simulator + hardware endpoint behavior.

## 2. Runtime Layers

### Layer A: Data Ingestion

| Component | Technology | Responsibility |
|---|---|---|
| Simulator / Device payload | React + ESP32-style schema | Sends nested payload (`sensor_telemetry`, `actuator`, `station_metadata`, `external_forecast`) |
| Input normalization & validation | `farmPayloadMapper` | Normalizes salinity/moisture/stage/water-level; validates against CROP_STAGES, CONTROL_MODES, VALVE_STATES |
| Sensor ingestion pipeline | `farmSensorIngestionService` | Orchestrates weather/tide enrichment, MongoDB persistence, Firebase write |
| Weather enrichment | Open-Meteo + cache (via `weatherService`) | Adds `temperature`, `humidity`, `rainfall_24h`, weather code |
| Tide enrichment | Tide inference (`tideService`) | Adds inferred `tide_status`, confidence, direction |
| History persistence | `farmHistoryService` + MongoDB | Stores sensor points in `sensor_history` collection for chart continuity |

### Layer B: Agentic Decision Core

| Component | File(s) | Responsibility |
|---|---|---|
| Firebase listener trigger | `backend/listeners/firebase-listener.js` | Detects sensor updates and triggers agentic flow |
| Agent orchestration | `backend/agent/agentOrchestration.js` | Coordinates retrieval + reasoning + safe output |
| Retrieval module | `backend/agent/agentRetrieval.js` | Vector search against `guideline_documents` |
| Agent utilities/fallback | `backend/agent/agentUtils.js` | Timeout guard, fallback decision, resilience |
| Prompt and tools | `backend/agent/prompt.js`, `backend/agent/tools.js` | Human-readable reasoning + safe actuator tool contract |

### Layer C: Execution and UX

| Component | Technology | Responsibility |
|---|---|---|
| Control write path | Firebase actuator node | Writes `valve_state` only when policy allows |
| Manual safety lock | Backend tool guard | In `MANUAL`, AI may reason but write is blocked |
| Dashboard + Simulator | React (Vite) | Realtime monitoring, manual controls, decision explanation |
| Decision explanation API | `/api/decision-details` | Returns fully formatted human-readable analysis |

## 3. Core Data Stores

### Firebase Realtime DB (operational state)
- `sensor_data`
- `actuator`
- `ai_status`
- `action_logs`

### MongoDB Atlas (knowledge and history)
- `guideline_documents`: embedded RAG guideline chunks.
- `action_logs`: long-term decision audit and retrieval trace metadata.
- `sensor_history`: persisted chart history for dashboard reload/cross-device continuity.

## 4. Decision Flow (Current)

1. Sensor payload is submitted to `POST /api/sensor-data` (handled by thin `farmController`).
2. `farmPayloadMapper` normalizes nested schema (sensor_telemetry, actuator, station_metadata).
3. `farmSensorIngestionService` enriches with weather (Open-Meteo) + tide context in parallel.
4. Enriched snapshot is committed: Firebase `sensor_data` + MongoDB `sensor_history`.
5. Firebase listener in `firebase-listener.js` detects change and triggers agent processing.
6. `agentRetrieval` gets top relevant guidelines from MongoDB Vector Search.
7. `agentOrchestration` + Gemini 2.5 Flash reason over sensor + weather + tide + guidelines.
8. `tools.js` enforces safety policy via control-mode gate (via `farmActuatorService`):
   - `AUTO`: AI may execute actuator writes to Firebase.
   - `MANUAL`: AI reasoning logged but write blocked.
9. Action result + rationale + retrieval metadata logged to Firebase `action_logs` and MongoDB audit trail.
10. Frontend consumes `/api/farm-state` (includes `sensorHistory` from MongoDB) and `/api/farm-stream` (SSE realtime) and `/api/decision-details` (rich explanation).

## 5. API Surface (Implemented)

### Farm state/control APIs
- `GET /api/farm-state`
- `GET /api/farm-stream` (SSE realtime stream)
- `POST /api/sensor-data`
- `PATCH /api/control-mode`
- `POST /api/override`

### Decision and performance APIs
- `GET /api/decision-details`
- `GET /api/performance`
- `GET /api/performance/report`

### Health/weather APIs
- `GET /api/health`
- `GET /api/weather`

## 6. Control Mode State Machine

```text
AUTO   -- user sets MANUAL --> MANUAL
MANUAL -- user sets AUTO   --> AUTO

AUTO:   AI can execute actuator writes.
MANUAL: AI reasoning/logging still runs, actuator write is blocked.
```

## 7. Frontend Data Strategy (Current)

1. Baseline fetch: `/api/farm-state`.
2. Realtime updates: `/api/farm-stream` via EventSource.
3. Rich explanation polling: `/api/decision-details`.
4. Chart history source: `sensorHistory` from backend (MongoDB-backed), not browser-only storage.

## 8. Key Reliability Rules

1. Weather service uses cached Open-Meteo responses (5-minute TTL) to reduce API pressure.
2. Agent timeout paths fall back to deterministic safety behavior.
3. Manual mode is a hard safety boundary for actuator writes.
4. All major actions are logged for audit and self-learning evaluation.

## 9. Repository Mapping (Updated)

```text
/SalinAI
 ├── /ai
 │    ├── architecture.md
 │    ├── api-contract.md
 │    ├── product.md
 │    ├── task.md
 │    └── testing.md
 ├── /backend
 │    ├── /agent
 │    │    ├── langchain.js
 │    │    ├── agentUtils.js
 │    │    ├── agentRetrieval.js
 │    │    ├── agentOrchestration.js
 │    │    ├── prompt.js
 │    │    └── tools.js
 │    ├── /controllers
 │    │    └── farmController.js (thin orchestration layer)
 │    ├── /routes
 │    │    ├── farm.js
 │    │    ├── performance.js
 │    │    └── health.js
 │    ├── /services
 │    │    ├── farmPayloadMapper.js (normalization + validation)
 │    │    ├── farmHistoryService.js (MongoDB sensor history get/set)
 │    │    ├── farmRealtimeStreamService.js (SSE stream management)
 │    │    ├── farmSensorIngestionService.js (weather/tide enrichment pipeline)
 │    │    ├── farmActuatorService.js (control mode + override validation)
 │    │    ├── weatherService.js
 │    │    ├── tideService.js
 │    │    ├── outcomeService.js
 │    │    └── explanationService.js
 │    ├── /listeners
 │    │    └── firebase-listener.js
 │    ├── /config
 │    │    ├── firebase.js
 │    │    └── mongodb.js
 │    └── server.js
 ├── /frontend
 └── /hardware
```

## 10. Technology Summary

| Layer | Technology | Role |
|---|---|---|
| Frontend | React + Vite | Dashboard and simulator UX |
| Backend | Node.js + Express | APIs, orchestration, control policies |
| LLM | Gemini 2.5 Flash | Reasoning and decision output |
| Embeddings | Gemini embedding model | Query/doc vectorization |
| Realtime bus | Firebase Realtime DB | Event and command synchronization |
| Vector DB + history | MongoDB Atlas | RAG retrieval + persistent history |
| Weather source | Open-Meteo API | External weather context |
