# System Architecture (v6.0 — Proactive, Streaming & Self-Learning)

## 1. High-Level Architecture

SalinAI v6.0 is a **4-layer Proactive Intelligence System** that evolves from reactive event-handling to forward-looking decision planning.

| Layer | Name | Purpose |
|---|---|---|
| **Layer 1** | Perception (Reactive Sync) | IoT telemetry → Firebase Cloud Bus |
| **Layer 2** | Decision Intelligence (Agentic Core) | Multi-agent RAG + Self-RAG + Evaluator |
| **Layer 3** | Proactive Intelligence | Daily forecast cronjob → Irrigation planning |
| **Layer 4** | Execution & UX | SSE Streaming + Animated Dashboard |

---

## 2. Runtime Layers (Detailed)

### Layer A: Perception & Data Bus (Firebase-Centric)

| Component | Technology | Responsibility |
|---|---|---|
| IoT Hardware (ESP32) | C++ (Arduino) | Event-driven push to `SalinAI/sensor_data` on delta or heartbeat |
| Cloud Bus | Firebase RTDB | Single source of truth and event dispatcher |
| AI Trigger Filter | `farmAiTriggerService.js` | Delta checks + Recovery + Urgency triggers using AI-managed thresholds |
| Sensor Enrichment | `farmFirebaseWatcher.js` | Appends weather (Open-Meteo) + tide data to each sensor event |

### Layer B: Agentic Decision Core (v6 — Upgraded)

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENTIC DECISION CORE                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              RESEARCHER AGENT (SaoLa4-Small)         │   │
│  │                                                      │   │
│  │  1. Query Rewriter                                   │   │
│  │     Raw sensor data → Natural-language VN query      │   │
│  │                                                      │   │
│  │  2. Self-RAG Loop (max 2 retries)                   │   │
│  │     ┌──────────┐    score < 0.72?    ┌───────────┐  │   │
│  │     │ Retrieve │ ──────────────────► │  Rewrite  │  │   │
│  │     │  Docs    │ ◄────────────────── │   Query   │  │   │
│  │     └──────────┘    retry (≤2x)      └───────────┘  │   │
│  │          │ score ≥ 0.72                              │   │
│  │          ▼                                           │   │
│  │  3. Evidence Summary (with citations)                │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           ORCHESTRATOR AGENT (GLM-4.7)               │   │
│  │                                                      │   │
│  │  Inputs: Researcher Summary + Policy Memory          │   │
│  │          + RLHF Lessons + Crop Stage Profile         │   │
│  │          + Proactive Forecast Context                │   │
│  │                                                      │   │
│  │  Output: execute_valve_control(state, reason)        │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         EVALUATOR AGENT / FEEDBACK LOOP (v6.0)       │   │
│  │                                                      │   │
│  │  Triggered by: Farmer 👎 feedback with reason        │   │
│  │  Task: Analyze mistake → Extract lesson →            │   │
│  │         Save to MongoDB `lessons_learned`            │   │
│  │  Model: SaoLa4-Medium (FPT Cloud)                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

| Component | Role | Model |
|---|---|---|
| **Researcher Agent** | RAG evidence synthesis → natural-language summary | SaoLa4-Small (FPT Cloud) |
| **Orchestrator Agent** | Final decision + valve execution | **GLM-4.7 (FPT Cloud)** |
| **Evaluator Agent** *(Feedback Loop)* | 👎 mistake analysis + lesson extraction (RLHF) | **SaoLa4-Medium (FPT Cloud)** |
| **Embedding Engine** | Vector embedding for RAG | Gemini `gemini-embedding-001` |
| **Retrieval Module** | MongoDB Atlas Vector Search (algorithm-based) | Atlas Vector Search |
| **Policy Memory** | Compact feedback summary injected into Orchestrator | MongoDB `agent_policy_memory` |
| **RLHF Lessons Store** | Structured lessons from Evaluator Agent | MongoDB `lessons_learned` |

### Layer C: Proactive Intelligence (NEW — v6.0)

| Component | Trigger | Responsibility |
|---|---|---|
| **Forecast Scheduler** | Cronjob at 05:00 AM daily (Vietnam TZ) | Fetches 3-5 day weather + tide forecast |
| **Proactive Planner** | After forecast fetch | AI generates "Irrigation Plan" with risk levels per day |
| **Plan Store** | MongoDB `irrigation_plans` | Persists plans with TTL; latest plan served to Dashboard |

### Layer D: Execution & UX (v6 — Streaming + Animated)

| Component | Technology | Responsibility |
|---|---|---|
| **SSE Token Stream** | `EventSource` / `res.write()` | Streams LangChain tokens from backend → frontend in real-time |
| **Farmer Dashboard** | React (Vite) | Realtime sensor cards, valve control, 3-day forecast panel |
| **Streaming Reasoning Panel** | `BehindTheScenes.jsx` | Typewriter rendering of AI reasoning phases |
| **Nature Animations** | CSS/SVG | Water flow, weather ambience, crop stage transitions |
| **Actuator Control** | Firebase RTDB | `SalinAI/actuator/valve_state` polled by ESP32 (Eager Poll) |

---

## 3. Data Flow

### 3A: Reactive Decision Cycle (existing, refined)

```
ESP32 ──PUT──► Firebase RTDB (sensor_data)
                    │
                    ▼ (Firebase Watcher)
            Enrichment (Weather + Tide)
                    │
                    ▼
            AI Trigger Filter
            (Delta / Recovery / Urgency)
                    │ shouldTriggerAI = true
                    ▼
        ┌─── Researcher Agent ────────────────────┐
        │  1. QueryRewriter(sensorContext) → query │
        │  2. VectorSearch(query) → docs           │
        │  3. ScoreCheck → Rewrite if needed       │
        │  4. Summary with citations               │
        └─────────────────┬───────────────────────┘
                          │
                          ▼
        ┌─── Orchestrator Agent ──────────────────┐
        │  + PolicyMemory + RLHF Lessons           │
        │  + CropStageProfile + ForecastContext    │
        │  → execute_valve_control(state, reason)  │
        └─────────────────┬───────────────────────┘
                          │
                    ┌─────▼──────────────────┐
                    │  Firebase RTDB          │
                    │  actuator/valve_state   │◄─── ESP32 polls (Eager)
                    │  action_logs (push)     │
                    │  ai_status (update)     │
                    └─────────────────────────┘
                          │
                    MongoDB Atlas
                    action_logs + outcome evaluation
                    → Policy Memory refresh
```

### 3B: SSE Streaming Flow (NEW)

```
Frontend                   Backend                    LangChain
   │                          │                           │
   │── GET /api/ai-stream ──► │                           │
   │   (EventSource)          │── runAgentStreaming() ──► │
   │                          │                           │ token1
   │ ◄── data: [token1] ───── │ ◄── stream chunk ──────── │
   │ ◄── data: [token2] ───── │ ◄── stream chunk ──────── │ token2
   │    (typewriter render)   │         ...               │
   │ ◄── data: [DONE] ─────── │ ◄── stream end ─────────── │
   │   (finalize UI state)    │                           │
```

### 3C: RLHF & Evaluator Flow (NEW)

```
Farmer clicks 👎 + types reason
          │
          ▼
POST /api/decision-feedback
{action_log_id, verdict: "incorrect", notes: "AI opened valve during storm"}
          │
          ▼
  Evaluator Agent invoked
  (analyzes action_log + feedback + sensor_snapshot)
          │
          ▼
  Extracts structured Lesson:
  {
    condition: "salinity < 2.0 AND rainfall > 20mm",
    action_taken: "OPEN",
    correct_action: "CLOSED",
    lesson: "Do not open valve when heavy rain is forecasted..."
  }
          │
          ├──► MongoDB `lessons_learned` (insert)
          └──► Trigger refreshPolicySummary()
                    │
                    ▼
          [RLHF_MEMORY] injected into
          next Orchestrator invocation
```

### 3D: Proactive Forecast Flow (NEW)

```
05:00 AM Cronjob (Vietnam TZ)
          │
          ▼
fetchWeatherForecast(days=5)
fetchTideForecast(days=5)
          │
          ▼
Proactive Planner AI
"Given forecast, generate 3-day irrigation plan with risk levels"
          │
          ▼
MongoDB `irrigation_plans` (upsert latest)
          │
          ▼
GET /api/irrigation-plan ◄─── Dashboard fetches on load + daily
```

---

## 4. MongoDB Collections (v6.0)

| Collection | Purpose | New in v6 |
|---|---|---|
| `guideline_documents` | Agricultural knowledge base (RAG) | — |
| `sensor_history` | Time-series sensor readings | — |
| `action_logs` | AI decisions with predictions | — |
| `decision_feedback` | Human verdicts (👍/👎) | — |
| `agent_policy_memory` | Compact policy summary for prompt injection | — |
| `lessons_learned` | Structured RLHF lessons from Evaluator Agent | ✅ NEW |
| `irrigation_plans` | Proactive 3-5 day irrigation plans | ✅ NEW |

---

## 5. API Endpoints (v6.0)

### Existing
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/farm-state` | Full farm state snapshot |
| `GET` | `/api/farm-stream` | SSE: realtime farm state stream |
| `POST` | `/api/ingest` | Hardware sensor data ingestion |
| `PATCH` | `/api/control-mode` | Toggle AUTO / MANUAL |
| `PATCH` | `/api/crop-stage` | Update crop lifecycle stage |
| `POST` | `/api/decision-feedback` | Submit 👍/👎 feedback |
| `GET` | `/api/policy-summary` | Fetch current policy memory |
| `POST` | `/api/override` | Manual actuator override |
| `GET` | `/api/decision-details` | Formatted latest AI decision |

### New in v6.0
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ai-stream` | SSE: streams AI reasoning tokens in real-time |
| `GET` | `/api/irrigation-plan` | Latest proactive 3-5 day irrigation plan |
| `POST` | `/api/evaluate-feedback` | Triggers Evaluator Agent on negative feedback |
| `GET` | `/api/lessons-learned` | Fetch recent lessons for dashboard display |

---

## 6. Key Performance Specs (v6.0 Targets)

| Metric | v5.0 Actual | v6.0 Target |
|---|---|---|
| Sensor → Firebase sync | 40s (demo) / delta | unchanged |
| AI First Token (streaming) | N/A (batch) | < 2 seconds |
| Full AI Reasoning Time | 3–7s | 5–12s (deeper Self-RAG) |
| Self-RAG Retry Rate | N/A | < 30% (most queries succeed first try) |
| Proactive Plan Generation | N/A | Daily, < 30s |
| ESP32 Actuator Latency | < 15s (Eager Poll) | unchanged |

---

## 7. Known Technical Debt (Must Fix)

| # | Issue | File | Fix |
|---|---|---|---|
| **C1** | ESP32 `millis()` timestamp | `sketch.ino:115` | Use NTP or let backend timestamp |
| **C2** | `GERMINATION` missing from `CROP_STAGES` | `farmPayloadMapper.js:5` | Add to array + add stage profile |
| **C3** | `success_rate` = 0, never computed | `outcomeService.js:425` | Compute via `$inc` ratio or aggregation |
| **M1** | `recoverySal !== undefined` null-check bug | `farmAiTriggerService.js:42` | Change to `!= null` |
| **M2** | `require()` inside function body | `langchain.js:321` | Hoist to module top |
| **M3** | ESP32 hardcodes `crop_stage: VEGETATIVE` | `sketch.ino:113` | Remove from firmware; read from Firebase |
| **M4** | SSE no reconnection logic | `useRealtimeFarmState.js` | Add exponential backoff reconnect |
| **M5** | Leaflet map in bundle but commented out | `FarmerDashboard.jsx:700` | Remove dead code |
