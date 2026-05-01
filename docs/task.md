# SalinAI Development Roadmap (v6.0 — Product Finals)

> **Status as of 2026-04-30** | Post-Demo Upgrade Sprint  
> Legend: ✅ Done | 🔧 Bug Fix Required | 🚀 In Progress | 📋 Planned

---

## ✅ Milestone 1: Perception & Data Bus (Complete)
- [x] ESP32 firmware with Firebase RTDB event-driven sync (delta + heartbeat)
- [x] Unified Ingestion API with strict schema validation
- [x] Reactive Firebase Watcher (fingerprint deduplication + cooldown)
- [x] Weather enrichment (Open-Meteo) + Tide enrichment per sensor event
- [x] Interactive Farmer Dashboard (Recharts area charts + stat cards)
- [x] SSE realtime stream (`/api/farm-stream`) with `useRealtimeFarmState` hook

## ✅ Milestone 2: Agentic RAG Core (Complete)
- [x] MongoDB Atlas Vector Search integration (`guideline_documents`)
- [x] Researcher Subagent (SaoLa4-Small) with mandatory RAG pre-injection
- [x] Orchestrator Subagent (SaoLa4-Medium) with tool-calling (`execute_valve_control`)
- [x] Agentic traceability (`agent_trace` array per decision)
- [x] Orchestrator retry loop + text-decision fallback parser
- [x] Provider failover (primary → fallback on timeout)

## ✅ Milestone 3: Resilience & Safety (Complete)
- [x] Agent timeout + retry with `withTimeout()` wrapper
- [x] Quota error detection + `parseRetrySeconds` from API headers
- [x] Fallback action (`buildFallbackAction`) with realistic Vietnamese reasoning
- [x] Manual Safety Lock mode (MANUAL / AUTO toggle)
- [x] AI-managed sensitivity thresholds (self-calibrating trigger service)

## ✅ Milestone 4: Autonomous Learning Loop (Complete)
- [x] `outcomeService.js` — reward calculation per crop stage profile
- [x] `evaluateOutcomes()` — delayed outcome comparison with MongoDB history
- [x] `upsertAutoFeedbackFromOutcome()` — auto-generated feedback from reward signal
- [x] `policyLearningService.js` — compact policy summary injected into Orchestrator
- [x] `autoLearningScheduler.js` — periodic background learning cycle
- [x] Human feedback endpoint (`POST /api/decision-feedback`)

---

## 🔧 Milestone 5: Critical Bug Fixes (Sprint 1 — Immediate)

> Fix these BEFORE implementing v6.0 Epics. They affect core data integrity.

### Backend
- [x] **[C1]** Fix ESP32 timestamp: remove `millis()` from firmware JSON payload; let `normalizeNestedSensorPayload()` use `new Date().toISOString()` server-side
- [x] **[C2]** Add `GERMINATION` to `CROP_STAGES` list in `farmPayloadMapper.js`
- [x] **[C2]** Add `GERMINATION` profile to `CROP_STAGE_PROFILES` in `outcomeService.js` (use SEEDLING values as reference)
- [x] **[C3]** Fix `success_rate` computation in `updateGuidelineSuccessRate()`: calculate `successful_uses / total_uses` and persist it, or use MongoDB `$avg` aggregation in retrieval query
- [x] **[M1]** Fix null-check bug: `farmAiTriggerService.js:42` — change `recoverySal !== undefined` to `recoverySal != null`
- [x] **[M2]** Hoist `require('../services/ai/outcomeService')` to module top in `langchain.js:321`

### Hardware
- [x] **[M3]** Remove `"crop_stage":"VEGETATIVE"` hardcode from `sketch.ino:113`; firmware should NOT send `crop_stage` field at all (let backend/dashboard control it)

### Frontend
- [x] **[M4]** Add SSE reconnection with exponential backoff in `useRealtimeFarmState.js`
  ```js
  // Pattern: on 'error', wait 1s → 2s → 4s then reconnect EventSource
  ```
- [x] **[M5]** Remove commented-out Leaflet map block from `FarmerDashboard.jsx:700–758` (or move to a separate lazy-loaded route)

---

## 🚀 Epic 1: Advanced RAG & Complex Scenario Intelligence

### Backend — AI/RAG
- [ ] **[E1-B1]** Create `queryRewriterService.js` in `backend/services/ai/`
  - Input: `{ salinity, moisture, crop_stage, external_forecast, trend }` context object
  - Output: 1–3 natural-language Vietnamese search queries
  - Use a lightweight LLM call (Gemini Flash) — not the full Researcher agent
- [ ] **[E1-B2]** Refactor `retrievalService.js` — replace raw variable string queries with rewritten queries from `queryRewriterService`
- [ ] **[E1-B3]** Implement **Self-RAG loop** in `langchain.js` Researcher phase:
  - After each retrieval, evaluate relevance: if `hitCount === 0` or all `score < 0.72`, call `queryRewriterService` again (max 2 retries)
  - Add trace events: `"rag_retry"`, `"rag_accepted"`, `"rag_fallback"`
- [ ] **[E1-B4]** Add relevance score to each retrieved document in retrieval result payload
- [ ] **[E1-B5]** Write complex scenario test prompts in `backend/tests/`:
  - `test_double_disaster.js` — Salinity >4 ppt + Moisture <35%
  - `test_sweet_water_trap.js` — Safe salinity now + `rainfall_24h > 20mm` forecast

### AI/Prompts
- [ ] **[E1-P1]** Update `researcherPromptTemplate` in `agent/prompt.js`:
  - Add instruction: *"Trước tiên hãy tạo một câu truy vấn tự nhiên bằng tiếng Việt mô tả tình huống, sau đó dùng câu đó để tìm kiếm guideline."*
  - Add Self-RAG self-critique step: *"Đánh giá xem các tài liệu được truy xuất có liên quan đến tình huống này không. Nếu không, hãy viết lại truy vấn."*
- [ ] **[E1-P2]** Add complex scenario handling instructions to `orchestratorPromptTemplate`:
  - "Double Disaster" priority rule: safety (close valve) overrides moisture needs
  - "Sweet Water Trap" rule: if forecasted rainfall > 20mm within 6h, defer OPEN decision

---

## 🚀 Epic 2: Human-in-the-Loop (RLHF) & Evaluator Agent

### Backend
- [x] **[E2-B1]** Create `evaluatorAgentService.js` in `backend/services/ai/`:
  - Triggered by `POST /api/evaluate-feedback` with `{action_log_id, verdict: "incorrect", notes}`
  - Fetches the full `action_log` from Firebase + MongoDB for context
  - Invokes LLM with: action taken, sensor conditions, farmer's reason for rejection
  - Extracts structured lesson: `{ condition_pattern, action_taken, correct_action, lesson_text }`
  - Saves to MongoDB `lessons_learned` collection
- [x] **[E2-B2]** Create new Express route `POST /api/evaluate-feedback` in `routes/farm.js`
- [x] **[E2-B3]** Create new Express route `GET /api/lessons-learned` — returns top-10 latest lessons
- [x] **[E2-B4]** Update `policyLearningService.js` — `buildPolicyPromptBlock()`:
  - Fetch latest lessons from `lessons_learned` collection
  - Append as `[RLHF_MEMORY]` block below existing `[POLICY_MEMORY]` in the prompt
- [x] **[E2-B5]** Define MongoDB schema for `lessons_learned`:
  ```js
  {
    action_log_id: String,
    condition_pattern: String,   // e.g. "salinity < 2.0 AND rainfall > 20mm"
    action_taken: String,        // "OPEN"
    correct_action: String,      // "CLOSED"
    lesson_text: String,         // Full lesson in Vietnamese
    created_at: Date,
    feedback_source: String      // "evaluator_agent"
  }
  ```

### Frontend
- [x] **[E2-F1]** Add 👍 / 👎 icon buttons to each Action Log card in `FarmerDashboard.jsx`
- [x] **[E2-F2]** On 👎 click, open a modal:
  - Textarea: *"Tại sao quyết định này không đúng?"*
  - Dropdown: reason category (Sai thông tin thời tiết / Sai ngưỡng mặn / Sai giai đoạn cây / Khác)
  - Submit → `POST /api/evaluate-feedback`
- [x] **[E2-F3]** Show a toast: *"Cảm ơn! AI sẽ học từ phản hồi này."* after successful submission
- [x] **[E2-F4]** Add a "💡 Bài học gần đây" collapsible section at the bottom of the AI panel, fetching from `GET /api/lessons-learned`

---

## 🚀 Epic 3: Proactive Forecasting (Predictive AI)

### Backend
- [ ] **[E3-B1]** Create `forecastScheduler.js` in `backend/services/ai/`:
  - Use `node-cron` (add to dependencies) — schedule at `0 5 * * *` (05:00 AM Vietnam TZ)
  - Fetch 5-day weather + tide forecast from Open-Meteo extended API
  - Call `proactivePlannerService` with forecast data
- [ ] **[E3-B2]** Create `proactivePlannerService.js` in `backend/services/ai/`:
  - Takes 5-day weather + tide forecast as input
  - Calls Orchestrator LLM with a specialized prompt: *"Based on the 5-day forecast, create a day-by-day irrigation risk assessment and recommended actions."*
  - Returns structured plan: `[{ date, risk_level, recommendation, reason }]`
  - Saves to MongoDB `irrigation_plans` with `created_at` timestamp
- [ ] **[E3-B3]** Add `GET /api/irrigation-plan` endpoint to `routes/farm.js`:
  - Returns latest plan from MongoDB `irrigation_plans`
  - Falls back to null/empty if no plan yet (not an error)
- [ ] **[E3-B4]** Register `forecastScheduler` in `server.js` alongside existing schedulers
- [ ] **[E3-B5]** Add `POST /api/irrigation-plan/trigger` dev endpoint to manually trigger plan generation (for testing without waiting for 5 AM)

### Frontend
- [ ] **[E3-F1]** Create `IrrigationPlanPanel.jsx` component:
  - Fetches `GET /api/irrigation-plan` on mount + every 10 minutes
  - Displays 3-day cards: Date | Risk Level (color-coded badge) | AI Recommendation
  - Risk levels: 🟢 Thấp / 🟡 Trung bình / 🔴 Cao
- [ ] **[E3-F2]** Integrate `IrrigationPlanPanel` into `FarmerDashboard.jsx` below the sensor grid

---

## 🚀 Epic 4: AI Streaming UX (Server-Sent Events)

### Backend
- [ ] **[E4-B1]** Create `runAgentStreaming()` function in `backend/agent/langchain.js`:
  - Accepts `(sensorData, res)` where `res` is the Express response object
  - Uses LangChain's `stream()` method instead of `invoke()`
  - Writes SSE events: `data: {"phase": "researcher", "token": "..."}\n\n`
  - Sends phase markers: `data: {"phase": "start"}\n\n`, `data: {"phase": "done"}\n\n`
- [ ] **[E4-B2]** Add `GET /api/ai-stream` endpoint to `routes/farm.js`:
  - Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
  - Only streams the LAST triggered reasoning session (or queues if busy)
  - On complete, sends `data: [DONE]\n\n`
- [ ] **[E4-B3]** Ensure `farmFirebaseWatcher.js` stores streaming state so `/api/ai-stream` can tap into the active run
- [ ] **[E4-B4]** Define SSE event schema:
  ```
  data: {"phase": "researcher", "event": "thinking", "token": "Đang phân tích bằng chứng..."}
  data: {"phase": "retrieval", "event": "rag_hit", "count": 3}
  data: {"phase": "orchestrator", "event": "deciding", "token": "Dựa trên guideline..."}
  data: {"phase": "done", "event": "complete", "action": "CLOSED"}
  ```

### Frontend
- [ ] **[E4-F1]** Create `useAIStream.js` hook:
  - Opens `EventSource('/api/ai-stream')` when `aiStatus.is_processing === true`
  - Accumulates tokens per phase into state
  - Closes stream on `[DONE]` event
- [ ] **[E4-F2]** Refactor `BehindTheScenes.jsx` (or equivalent reasoning panel):
  - Render accumulated tokens with typewriter effect (`StreamingText.jsx` component already exists — reuse it)
  - Show phase label above streaming text: `🔍 Researcher` → `📋 Tổng hợp` → `⚙️ Orchestrator` → `✅ Hoàn tất`
  - Phase label animates with a pulsing dot while active
- [ ] **[E4-F3]** When AI is NOT processing, show last completed reasoning as static text (no flicker)

---

## 🚀 Epic 5: Dynamic Nature Animations (UI/UX)

### Frontend
- [ ] **[E5-F1]** **Valve Flow Animation:**
  - Create `WaterFlowSVG.jsx` — an SVG with animated path dashes representing water flowing through a canal
  - When `actuator.valve_state === "OPEN"`: animate `stroke-dashoffset` (CSS keyframe)
  - When `CLOSED`: static grey pipe visual
  - Integrate below the valve control button in `FarmerDashboard.jsx`

- [ ] **[E5-F2]** **Weather Background Layers:**
  - Create `WeatherAmbience.jsx` — a fixed, low-opacity overlay layer
  - Map `weather_code` to animation class:
    - `61–67` (Rain) → CSS rain droplets (`@keyframes fall`)
    - `0–1` (Sunny) → subtle warm radial glow pulse
    - `71–77` (Snow) → not applicable for Vietnam; map to Heavy Fog visual
    - `95+` (Storm) → fast-moving dark clouds + lightning flash
  - Apply as `position: fixed` behind dashboard content (z-index: 0)

- [ ] **[E5-F3]** **Crop Growth SVG Transitions (Simulator Page):**
  - Create `CropStageIllustration.jsx` — SVG-based crop illustration
  - Stages: 🌱 Seedling → 🌿 Vegetative → 🌸 Flowering → 🌾 Harvest
  - On stage change: animate with CSS `clip-path` or `opacity` + `transform: scale` transition (700ms ease)
  - Integrate into `SimulatorPage.jsx` near the crop stage selector

- [ ] **[E5-F4]** **CSS Global Keyframes** — add to `index.css`:
  - `@keyframes waterFlow` — for valve SVG
  - `@keyframes rainDrop` — for weather overlay
  - `@keyframes cropGrow` — for crop stage transition
  - All animations must respect `prefers-reduced-motion` media query

---

## 📋 Milestone 6: Polish & Production Readiness (Post-Epic Sprint)

- [ ] Add `node-cron` to `backend/package.json` dependencies
- [ ] Add `GET /api/health` extended check: MongoDB ping + Firebase ping + last AI run timestamp
- [ ] Write Jest integration tests for:
  - Self-RAG retry logic
  - Evaluator Agent lesson extraction
  - Proactive plan generation (mocked LLM)
- [ ] Add rate limiting middleware (`express-rate-limit`) on `/api/ingest` and `/api/ai-stream`
- [ ] Audit `serviceAccountKey.json` — confirm not in `.gitignore` exclusion
- [ ] Document all v6.0 API endpoints in `ai/api-contract.md`
- [ ] Load test SSE streaming with 5 concurrent browser clients

---

*Roadmap v6.0 — Product Finals Sprint | Updated 2026-04-30*
