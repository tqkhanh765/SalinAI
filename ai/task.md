# Development Tasks (Sprint Board)
# Deadline: April 19, 2026

## Team Assignment
| Member | Role | Focus Area |
|---|---|---|
| Member A | AI / Backend Engineer | AI Agentic chain, LangChain, Gemini, retrieval, tools |
| Member B | Frontend Engineer | Simulator, dashboard, Langflow visual handoff, UI wording |
| Member C | Full-Stack / Integration | Firebase, MongoDB, API routes, deployment, E2E tests |

## Priority Legend
- 🔴 MVP Must Ship: Required for demo acceptance.
- 🟡 MVP Should Ship: Strongly recommended for complete demo quality.
- ⚪ Backlog: Post-MVP or optional stretch.

## Phase 1: Core Infrastructure Baseline
Target: Apr 10-11 | Owner: B + C

- [x] Task 1.1 🔴 [C] Initialize Express backend, Firebase Admin SDK, CORS, and GET /api/health.
- [x] Task 1.2 🔴 [C] Add MongoDB Atlas config module at backend/config/mongodb.js and validate startup connectivity.
- [x] Task 1.3 🔴 [C] Update .env.example with MONGODB_URI, GEMINI_API_KEY, EMBEDDING_MODEL, VECTOR_TOP_K, VECTOR_MIN_SCORE.
- [x] Task 1.4 🔴 [B] Ensure simulator writes salinity, moisture, crop_stage, timestamp to Firebase sensor_data.
- [ ] Task 1.5 🟡 [B] Add crop_stage selector in simulator and dashboard filter panels.

## Phase 2: MongoDB Vector Search Setup (MVP)
Target: Apr 12 | Owner: C (primary) + A

- [x] Task 2.1 🔴 [C] Create guideline_documents collection schema and seed initial agricultural guideline corpus.
- [x] Task 2.2 🔴 [C] Generate and persist embeddings for seeded guideline documents.
- [x] Task 2.3 🔴 [C] Create Atlas Vector Search index on guideline_documents.embedding.
- [x] Task 2.4 🔴 [A] Implement retrieval utility in backend/agent/langchain.js with top_k and min_score policy.
- [x] Task 2.5 🔴 [A] Add metadata filter support for crop_stage and region in retrieval query.
- [x] Task 2.6 🔴 [A + C] Verify retrieval returns relevant guideline chunks for at least 5 crop_stage scenarios.

## Phase 3: AI Agentic Runtime Chain (LangChain + Gemini)
Target: Apr 12-14 | Owner: A (primary) + C

- [x] Task 3.1 🔴 [A] Implement backend/listeners/firebase-listener.js:
  - Subscribe to sensor_data updates.
  - Abort actuator writes when control_mode is MANUAL.
  - Apply minimum 10 second debounce between AI Agentic invocations.
- [x] Task 3.2 🔴 [A] Implement backend/agent/prompt.js:
  - Include hard safety rules and multi-factor context (salinity, moisture, crop_stage, weather, control_mode).
  - Inject retrieved guideline snippets and source ids into Gemini system prompt.
- [x] Task 3.3 🔴 [A] Implement backend/agent/tools.js:
  - execute_valve_control(state, reason, source_ids) with strict MANUAL lock guard.
  - check_weather() returning condition, is_risky, description.
  - send_alert(channel, message).
- [x] Task 3.4 🔴 [A] Implement backend/agent/langchain.js end-to-end chain:
  - Build retrieval query from environmental factors plus crop_stage.
  - Generate embedding and query Atlas Vector Search.
  - Inject retrieved context into the research agent prompt.
  - Execute tools and persist logs.
- [x] Task 3.5 🔴 [C] Register listener and chain bootstrap in backend/server.js.
- [x] Task 3.6 🔴 [A + C] Enforce dual logging for every decision to Firebase action_logs and MongoDB action_logs.
- [x] Task 3.7 🔴 [A] Build Unstructured Data Ingestion pipeline (Text extraction -> Overlap Chunking -> Embeddings -> MongoDB).
- [x] Task 3.8 🔴 [A] Refactor single-shot chain into a Multi-Agent Supervisor workflow (Researcher Subagent + Orchestrator).
- [x] Task 3.9 🔴 [C] Implement Enterprise Pre-Filter anomaly firewall in listener for API cost savings.
- [x] Task 3.10 🔴 [A] Implement persistent memory via query_action_history tool so the Agent studies past consequences.

## Phase 4: Langflow Visual Pipeline (MVP)
Target: Apr 13-14 | Owner: A + B

- [x] Task 4.1 🔴 [A] Build Langflow canvas mirroring production nodes: trigger, filter, subagent query, embedding, vector retrieval, prompt builder, orchestrator, tool router, log sink.
- [ ] Task 4.2 🔴 [A] Validate node IO parity between Langflow visual and backend chain interfaces.
- [ ] Task 4.3 🟡 [B] Add visual export artifact (PNG or JSON) to ai/ references for demo walkthrough.
- [ ] Task 4.4 🟡 [B] Update dashboard behind-the-scenes page labels to AI Agentic wording.

## Phase 5: API and Chat Contracts (MVP)
Target: Apr 14-15 | Owner: C + A

- [ ] Task 5.1 🔴 [C] Implement POST /api/chat with retrieval metadata in response (hit_count, source_ids, retrieval_miss).
- [ ] Task 5.2 🔴 [C] Implement POST /api/override with strict validation and control mode updates.
- [ ] Task 5.3 🟡 [A] Add chain observability fields to ai_status (last_retrieval_hit_count, last_retrieval_source_ids).
- [ ] Task 5.4 🟡 [C] Add health checks for both Firebase and MongoDB in GET /api/health.

## Phase 6: Validation and Performance
Target: Apr 15-18 | Owner: All

- [ ] Task 6.1 🔴 [A + C] E2E test: simulator push -> retrieval -> reasoning -> safe tool call -> dashboard update.
- [ ] Task 6.2 🔴 [A] Validate retrieval quality for crop_stage-specific prompts; ensure returned source ids are relevant.
- [ ] Task 6.3 🔴 [C] Confirm MANUAL mode blocks all actuator writes from AI Agentic tools.
- [ ] Task 6.4 🟡 [C] Measure round-trip latency target under 3 seconds for anomaly flow.
- [ ] Task 6.5 🟡 [B] Ensure UI labels use AI Agentic keyword (replace legacy AI Agent strings).

## Phase 7: Deployment and Demo Readiness
Target: Apr 18-19 | Owner: All

- [ ] Task 7.1 🟡 [C] Deploy backend to Render and frontend to Vercel with production environment variables.
- [ ] Task 7.2 🟡 [A] Demo script with 3 scenarios: salinity spike, weather risk, manual override.
- [ ] Task 7.3 🟡 [B] Demo visual walkthrough with Langflow canvas and source attribution from retrieval.

## Phase 8: Architectural Shift (v5.0)
Target: Apr 15 | Owner: All

- [x] Task 8.1 🔴 [C] Shift to Event-Driven Push: Delete `wokwi-poller.js` and remove legacy listeners.
- [x] Task 8.2 🔴 [C] Implement `POST /api/ingest` with strict validation (fail-fast on 0, -ve, NaN) and AI Trigger Filter (delta-based).
- [x] Task 8.3 🔴 [B] Update Arduino `sketch.ino` for 5-min heartbeat and hardware-level anomaly trigger.

## Acceptance Criteria (Hard Gates)

- [ ] AC-1: RAG uses only MongoDB Atlas Vector Search.
- [ ] AC-2: Every inference path includes crop_stage-aware retrieval before Gemini reasoning.
- [ ] AC-3: Retrieved context is injected into system prompt and source ids are logged.
- [ ] AC-4: AI Agentic naming is used across docs and user-facing labels.
- [ ] AC-5: MANUAL mode prevents actuator writes from AI Agentic tools.
- [ ] AC-6: E2E anomaly handling remains under 3 seconds in MVP environment.
- [x] AC-7: No polling services active in backend.
- [x] AC-8: `POST /api/ingest` rejects `0` and negative values with 400.
- [x] AC-9: AI Agent only triggered on significant sensor delta or extreme weather.

## Sprint Timeline

```text
Apr 10-11 -> Phase 1 baseline
Apr 12    -> Phase 2 MongoDB Vector Search setup
Apr 12-14 -> Phase 3 AI Agentic runtime chain
Apr 13-14 -> Phase 4 Langflow visual parity
Apr 14-15 -> Phase 5 API and chat contracts
Apr 15-18 -> Phase 6 validation and performance
Apr 15    -> Phase 8 Architectural Shift (v5.0)
Apr 18-19 -> Phase 7 deployment and demo readiness
```