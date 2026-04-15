# System Architecture (v5.0 - Event-Driven Push + AI Trigger Filter)

## 1. High-Level Architecture
SalinAI is a 3-layer event-driven irrigation intelligence system.

1. **Realtime state bus:** Firebase Realtime DB (sensor, actuator, ai_status, action_logs).
2. **Decision intelligence:** Node.js backend + Gemini + MongoDB Atlas Vector Search.
3. **User interfaces:** React dashboard.

## 2. Runtime Layers

### Layer A: Data Ingestion (Push Architecture)

| Component | Technology | Responsibility |
|---|---|---|
| IoT Hardware (ESP32) | C++ (Arduino) | Pushes data to `POST /api/ingest` every 5m or on anomaly. |
| Ingestion Endpoint | Express (`ingestData`) | Unified endpoint for Hardware; applies strict validation. |
| Strict Validator | Node.js | Rejects `0`, `-ve`, `NaN`, `null`, `moisture > 100` (Fail-Fast). |
| AI Trigger Filter | Logic Layer | Compares deltas (Sal > 0.5 ppt, Mois > 10%) to decide if Agent should run. |
| Sensor ingestion pipeline | `farmSensorIngestionService` | Enriches with weather/tide; persists to Firebase/MongoDB. |

### Layer B: Agentic Decision Core

| Component | File(s) | Responsibility |
|---|---|---|
| Agent Trigger | `farmController.js` | Invoked directly by Ingestion Endpoint only when delta filters pass. |
| Agent orchestration | `backend/agent/agentOrchestration.js` | Coordinates retrieval + reasoning + safe output |
| Retrieval module | `backend/agent/agentRetrieval.js` | Vector search against `guideline_documents` |
| Agent utilities/fallback | `backend/agent/agentUtils.js` | Timeout guard, fallback decision, resilience |
| Prompt and tools | `backend/agent/prompt.js`, `backend/agent/tools.js` | Human-readable reasoning + safe actuator tool contract |

### Layer C: Execution and UX

| Component | Technology | Responsibility |
|---|---|---|
| Control write path | Firebase actuator node | Writes `valve_state` only when policy allows |
| Manual safety lock | Backend tool guard | In `MANUAL`, AI may reason but write is blocked |
| Dashboard | React (Vite) | Realtime monitoring, manual controls, decision explanation |
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

## 4. Decision Flow (New Push Mechanism)

1. **Hardware Push:** ESP32 reads sensors every 5s; pushes to `POST /api/ingest` on a 5-min heartbeat OR immediate anomaly.
2. **Strict Validation:** Backend rejects payload if default/error values (e.g. `0`, `-1`) are detected.
3. **Data Sync:** Valid data is enriched with Weather/Tide and synced to Firebase `sensor_data` (UI update).
4. **AI Trigger Filter:**
   - Compare current values with the last history point in MongoDB.
   - **Trigger Agent ONLY if:** Salinity delta > 0.5 ppt OR Moisture delta > 10% OR Weather becomes extreme.
5. **Agentic Loop:** If triggered, `agentRetrieval` gets guidelines -> Gemini reasons -> Tools execute.
6. **Execution:** Result written to Firebase; ESP32 reads updated `valve_state` via direct RTDB fetch.

## 5. API Surface (Implemented)

### Farm state/control APIs
- `GET /api/farm-state`
- `GET /api/farm-stream` (SSE realtime stream)
- `POST /api/ingest` (Unified Ingestion)
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
