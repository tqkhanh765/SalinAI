<<<<<<< HEAD
# System Architecture (v5.0 - Event-Driven Push + AI Trigger Filter)

## 1. High-Level Architecture
SalinAI is a 3-layer event-driven irrigation intelligence system.

1. **Realtime state bus:** Firebase Realtime DB (sensor, actuator, ai_status, action_logs).
2. **Decision intelligence:** Node.js backend + Gemini + MongoDB Atlas Vector Search.
3. **User interfaces:** React dashboard.

## 2. Runtime Layers
=======
# System Architecture (v3.0 - AI Agentic + RAG Pipeline)

## 1. High-Level Architecture
SalinAI is built as a three-layer, event-driven AI Agentic system. Firebase remains the real-time command bus, while RAG is mandatory and uses only MongoDB Atlas Vector Search.

### Layer 1: Perception (Data Ingestion)
>>>>>>> b50344a2725be0ef3a7d9a93faea49a6fd1924dd

### Layer A: Data Ingestion (Push Architecture)

| Component | Technology | Responsibility |
|---|---|---|
<<<<<<< HEAD
| IoT Hardware (ESP32) | C++ (Arduino) | Pushes data to `POST /api/ingest` every 5m or on anomaly. |
| Ingestion Endpoint | Express (`ingestData`) | Unified endpoint for Hardware; applies strict validation. |
| Strict Validator | Node.js | Rejects `0`, `-ve`, `NaN`, `null`, `moisture > 100` (Fail-Fast). |
| AI Trigger Filter | Logic Layer | Compares deltas (Sal > 0.5 ppt, Mois > 10%) to decide if Agent should run. |
| Sensor ingestion pipeline | `farmSensorIngestionService` | Enriches with weather/tide; persists to Firebase/MongoDB. |

### Layer B: Agentic Decision Core

| Component | File(s) | Responsibility |
|---|---|---|
| Agent Trigger | `farmController.js` | Invoked directly by Ingestion Endpoint only when delta filters pass. |
| Agent orchestration | `backend/agent/agentResearch.js`, `backend/agent/agentOrchestration.js` | `SAOLA4_SMALL` gathers evidence; `SAOLA4_MEDIUM` makes final valve decision |
| Retrieval module | `backend/services/ai/retrievalService.js` | Vector search against `guideline_documents` |
| Agent safety service | `backend/services/core/agentSafetyService.js` | Timeout guard, fallback decision, resilience |
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
5. **Agentic Loop:** If triggered, `retrievalService` gets guidelines -> `SAOLA4_SMALL` reasons -> `SAOLA4_MEDIUM` executes tools.
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
 │    │    ├── agentResearch.js
 │    │    ├── services/ai/retrievalService.js
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
| LLM | SAOLA4_MEDIUM + SAOLA4_SMALL | Orchestration and research reasoning |
| Embeddings | Gemini embedding model | Query/doc vectorization |
| Realtime bus | Firebase Realtime DB | Event and command synchronization |
| Vector DB + history | MongoDB Atlas | RAG retrieval + persistent history |
| Weather source | Open-Meteo API | External weather context |
=======
| IoT Sensor Mockup | ESP32 / React Simulator | Writes salinity, moisture, and crop_stage into Firebase sensor_data |
| Weather Feed | OpenWeatherMap API | Provides macro weather risk context |

### Layer 2: AI Agentic Core (Backend on Render)

| Submodel | Role | Notes |
|---|---|---|
| Event Filter + Throttle | Firebase listener middleware | Prevents spam invocation and enforces minimum trigger interval |
| Orchestrator | LangChain.js | Coordinates retrieval, prompt assembly, and tool execution |
| Embedding Generator | Gemini embedding model (via LangChain integration) | Converts multi-factor query state into vector representation |
| Vector Database | MongoDB Atlas Vector Search | Retrieves agricultural guideline chunks filtered by crop_stage and context |
| Reasoning Model | Gemini 2.5 Flash | Produces decision and tool arguments based on retrieved context |

### Layer 3: Execution + Interfaces

| Component | Technology | Description |
|---|---|---|
| Command Bus | Firebase Realtime DB | Stores valve_state, control_mode, AI status, and action logs |
| Actuator | Valve Relay | Executes OPEN or CLOSED state |
| Frontend | React (Vite) | Dashboard, simulator, and AI Agentic visual pages |
| Notifications | Telegram Bot / SMTP | Delivers anomaly or action alerts |

## 2. Mandatory RAG Decision Flow
The production decision chain must always follow this sequence:

1. Listener receives new sensor payload from Firebase.
2. Backend composes multi-factor retrieval query with salinity, moisture, crop_stage, weather_risk, and recent action summary.
3. Embedding generator creates the query vector.
4. LangChain retriever executes MongoDB Atlas Vector Search on agricultural guideline corpus.
5. Retriever returns top-k guideline chunks with scores and metadata.
6. System prompt for Gemini 2.5 Flash is assembled with:
    - Hard safety rules.
    - Real-time factors (salinity, moisture, crop_stage, weather, control_mode).
    - Retrieved guideline context from MongoDB.
7. Gemini reasons and decides tool call or NO_ACTION.
8. Tool executor rechecks control_mode before writing actuator updates.
9. Result is logged to Firebase and MongoDB action logs.

Fallback rule: if retrieval returns no document above threshold, the chain continues with hard safety rules only and logs retrieval_miss=true.

## 3. Langflow Visual Specification (Canonical)
Langflow is the required visual representation for the AI Agentic pipeline. The visual canvas must mirror backend runtime behavior.

### 3.1 Langflow Nodes

| Node ID | Node Type | Input | Output |
|---|---|---|---|
| N1 | Firebase Trigger Node | sensor_data update | sensor_event |
| N2 | Event Filter Node | sensor_event | filtered_event |
| N3 | Weather Context Node | filtered_event | enriched_event |
| N4 | Query Builder Node | enriched_event | retrieval_query_text |
| N5 | Embedding Node | retrieval_query_text | query_vector |
| N6 | MongoDB Atlas Vector Search Node | query_vector + crop_stage filter | retrieved_guidelines |
| N7 | Prompt Builder Node | enriched_event + retrieved_guidelines | system_prompt |
| N8 | Gemini 2.5 Flash Node | system_prompt + tool schemas | model_decision |
| N9 | Tool Router Node | model_decision | tool_execution_result |
| N10 | Log Sink Node | tool_execution_result | firebase_log + mongo_log |

### 3.2 Langflow Edges

| Edge | From | To | Purpose |
|---|---|---|---|
| E1 | N1 | N2 | Initial trigger handoff |
| E2 | N2 | N3 | Pass valid events only |
| E3 | N3 | N4 | Build retrieval query from multi-factor state |
| E4 | N4 | N5 | Generate embedding |
| E5 | N5 | N6 | Execute vector retrieval |
| E6 | N3 + N6 | N7 | Merge live context and retrieved context |
| E7 | N7 | N8 | Run Gemini reasoning |
| E8 | N8 | N9 | Execute tool decision safely |
| E9 | N9 | N10 | Persist outcome and observability metadata |

## 4. Control Mode State Machine

```text
AUTO   -- user sets MANUAL --> MANUAL
MANUAL -- user sets AUTO   --> AUTO

AUTO:   AI Agentic pipeline may execute valve writes.
MANUAL: AI Agentic pipeline may reason, but actuator write tools are blocked.
>>>>>>> b50344a2725be0ef3a7d9a93faea49a6fd1924dd
