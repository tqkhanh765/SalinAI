# SalinAI Comprehensive Test Cases

## 1) Scope
This suite covers end-to-end behavior for:
- API contracts and validation
- AI trigger policy
- Multi-agent pipeline (Researcher -> Retrieval -> Orchestrator)
- Retrieval quality (paper-only evidence)
- Action execution and logging
- Feedback loop and delayed outcome evaluation
- Policy learning and manual feedback
- Frontend-visible state correctness

## 2) Test Environment
- Backend running at `http://localhost:3001`
- Firebase Admin credentials valid
- MongoDB connected
- At least 1 ingested paper chunk in `guideline_documents` with `_id` prefix `paper-`
- `sensor_history` and `action_logs` collections writable

Recommended env:
- `OUTCOME_MIN_ACTION_AGE_HOURS=1`
- `VECTOR_TOP_K=3`
- `VECTOR_MIN_SCORE=0.72`

## 3) Test Data Preconditions
1. Run paper ingestion:
   - `cd backend`
   - `node scripts/ingest-files.js`
2. Verify in MongoDB:
   - `guideline_documents` has docs where `_id` starts with `paper-`
3. Ensure realtime baseline exists:
   - `GET /api/farm-state`

## 4) API and Feature Test Matrix

| ID | Feature | Endpoint/Function | Input | Expected Result |
|---|---|---|---|---|
| API-001 | Health check | `GET /api/health` | None | 200 OK, service status payload |
| API-002 | Farm snapshot | `GET /api/farm-state` | `logLimit=20` | 200 OK, includes `sensorData`, `actuator`, `aiStatus`, `actionLogs` |
| API-003 | SSE stream | `GET /api/farm-stream` | Keep connection open | Stream events with JSON payload, no malformed chunks |
| API-004 | Ingest valid payload | `POST /api/ingest` | Valid salinity/moisture payload | 200 OK, data synced, trigger reason present if threshold crossed |
| API-005 | Ingest invalid payload | `POST /api/ingest` | `salinity=0` or `moisture=0` | 400 with validation error details |
| API-006 | Control mode switch | `PATCH /api/control-mode` | `MANUAL`, then `AUTO` | 200, actuator mode updated |
| API-007 | Manual override | `POST /api/override` | `valve_state=OPEN` in MANUAL | 200, actuator state updated |
| API-008 | Crop stage update | `PATCH /api/crop-stage` | `FLOWERING` | 200, `sensor_data.crop_stage` updated |
| API-009 | Decision details format | `GET /api/decision-details` | None | 200, formatted factors/decision for dashboard |
| API-010 | Manual feedback submit | `POST /api/decision-feedback` | latest `action_log_id` + verdict | 200, policy refreshed |
| API-011 | Policy summary | `GET /api/policy-summary` | None | 200, policy text/object returned |

## 5) Retrieval and Evidence Test Cases (Papers-Only)

| ID | Focus | Steps | Expected |
|---|---|---|---|
| RAG-001 | Retrieval has hits from papers | Trigger AI via `/api/ingest` with valid data | Latest `action_logs[*].retrieval.hit_count` > 0 |
| RAG-002 | Source ID prefix enforcement | Read latest action log | Every `retrieval.source_ids[]` starts with `paper-` (or matches allowed upload source rule) |
| RAG-003 | No seeded guideline leakage | Inspect latest `source_ids` | No legacy seed id pattern appears in source list |
| RAG-004 | Retrieval fallback text | Force no-hit scenario (raise min score) | `model_insights.retrieval_output_preview` indicates no uploaded-paper evidence |
| RAG-005 | Researcher neutrality | Read `subagent_summary` and `model_insights.researcher_output_preview` | No direct imperative like `OPEN/CLOSE valve now`; only evidence/argumentation |

## 6) AI Pipeline and Action Decision Test Cases

| ID | Focus | Steps | Expected |
|---|---|---|---|
| AGT-001 | Trigger on salinity delta | Send 2 ingests where delta > 0.5 | AI triggered on second payload |
| AGT-002 | Trigger on moisture delta | Send delta > 10 | AI triggered |
| AGT-003 | No trigger when stable | Send near-identical payload | AI skipped message |
| AGT-004 | Manual mode block | Set MANUAL, ingest dangerous data | Action log reason includes blocked/manual behavior |
| AGT-005 | Fallback decision path | Simulate agent failure (temporary provider off) | Action still resolved using fallback logic |
| AGT-006 | Trace completeness | Inspect `action_logs[0].agent_trace` | Contains `researcher`, `retrieval`, `orchestrator` phases |
| AGT-007 | Actor labeling | Inspect latest action log | Actor identifies AI pipeline when AI-generated |

## 7) Feedback Loop and Action-to-Evaluate Test Cases

| ID | Focus | Steps | Expected |
|---|---|---|---|
| FB-001 | Pending state after action | Trigger new action | `ai_status.feedback_loop.status = PENDING_OUTCOME` |
| FB-002 | Delay metadata | Inspect `ai_status.feedback_loop` | `min_action_age_hours=1`, `next_check_at` approximately +1h |
| FB-003 | Evaluator finds mature actions | Run cycle after maturity window | Console: `Found N actions to evaluate (awaiting window: M, delay=1h)` |
| FB-004 | Reward persistence | Check `action_logs.prediction` | `actual_moisture`, `actual_salinity`, `reward`, `evaluated_at` are set |
| FB-005 | Auto feedback insertion | Check `decision_feedback` | New doc with `feedback_source=auto_outcome_evaluator` |
| FB-006 | Policy refresh on insert | Run cycle with inserted feedback | Policy summary updated timestamp/content |
| FB-007 | Recheck guard | Re-run cycle immediately | No duplicate auto feedback for same `action_log_id` |

## 8) Frontend Behavior Test Cases

| ID | Page | Focus | Expected |
|---|---|---|---|
| UI-001 | Farmer Dashboard | Core cards/data map render | No crash, sensor values and logs visible |
| UI-002 | Farmer Dashboard | Feedback Loop section removed | No feedback-loop card appears |
| UI-003 | Simulator | Terminal origin badge | Each action row shows AI-GENERATED or RULE-BASED |
| UI-004 | Simulator | Retrieval panel text | Shows retrieval excerpt or explicit no-data fallback |
| UI-005 | Simulator | Feedback status clarity | Shows clear pending/evaluated copy, not raw legacy token |

## 9) Function Coverage and Dead-Code Audit (No Thua/No Thieu)

### 9.1 Required check strategy
1. Export inventory:
   - enumerate each exported function in backend modules
2. Runtime route coverage:
   - map each API endpoint to controller/service functions called
3. Static usage verification:
   - search references for each exported function
4. Unused-risk classification:
   - classify as `used`, `framework-entry`, or `candidate-unused`

### 9.2 Acceptance criteria
- Every exported function is either:
  - used by route/controller/service chain, or
  - intentionally retained as framework entry/helper
- No orphan critical path function in AI pipeline (`runAgent`, `executeRAGTool`, `finalizeAction`, `runAutonomousLearningCycle`)
- No missing wiring between route and controller

### 9.3 Must-pass wiring checks
- `/api/ingest` -> `ingestData` -> `ingestSensorPayload` + `decideAiTrigger` + `runAgent`
- `runAgent` -> mandatory `executeRAGTool` -> orchestration -> `finalizeAction`
- `finalizeAction` -> Firebase action log + `logActionWithPrediction` + `runAutonomousLearningCycle`
- scheduler -> `runAutonomousLearningCycle`

## 10) Regression Suite Order
1. API-001..API-011
2. RAG-001..RAG-005
3. AGT-001..AGT-007
4. FB-001..FB-007
5. UI-001..UI-005
6. Function coverage audit

## 11) Exit Criteria
- 100% pass on critical IDs: API-004, API-005, RAG-002, AGT-004, FB-001, FB-004
- No legacy retrieval source leakage in latest 20 action logs
- No unresolved candidate-unused function in critical backend path
- No frontend runtime error on Dashboard and Simulator pages
