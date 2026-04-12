# Development Tasks (Sprint Board)
# Deadline: April 19, 2026

## Team Assignment
| Member | Role | Focus Area |
|---|---|---|
| **Member A** | AI / Backend Engineer | LangChain runtime control, prompts, retrieval, safety |
| **Member B** | Frontend Engineer | Simulator, dashboard, realtime status UI, LangFlow visualization |
| **Member C** | Full-Stack / Integration | Firebase, MongoDB, server routes, testing |

## Priority Legend
- 🔴 **MVP — Must Ship** → Required for the demo and must work end-to-end
- 🟡 **MVP — Should Ship** → Important polish or robustness work
- ⚪ **Optional** → Only if time remains after the core RAG pipeline is stable

---

## Phase 1: Foundation and Realtime UI
> **Target: Apr 10–11** | Owner: B + C

- [x] **Task 1.1** 🔴 `[C]` Initialize Node.js Express server, configure CORS, connect Firebase Admin SDK, and add `GET /api/health`.
- [x] **Task 1.2** 🔴 `[C]` Initialize Vite React app, set up Firebase client SDK, and define environment variables in `.env` and `.env.example`.
- [x] **Task 1.3** 🔴 `[B]` Build `Simulator.jsx` with salinity and moisture sliders plus a push action to Firebase `sensor_data`.
- [x] **Task 1.4** 🔴 `[B]` Build `Dashboard.jsx` with realtime sensor cards, valve state, action logs, and manual override controls.

---

## Phase 2: Agentic Core
> **Target: Apr 12–14** | Owner: A (primary) + C (integration)

- [ ] **Task 2.1** 🔴 `[A]` Design the runtime agentic pipeline with separate substeps for ingestion, retrieval, reasoning, safety validation, and persistence.
- [ ] **Task 2.2** 🔴 `[A]` Write `agent/prompt.js` with the goal, hard rules, dynamic state inputs, and an explicit requirement to justify each action.
- [ ] **Task 2.3** 🔴 `[A]` Refactor `agent/langchain.js` so it executes the runtime control loop and returns a structured decision object.
- [ ] **Task 2.4** 🔴 `[C]` Register the Firebase listener in `server.js` and route valid sensor changes into the orchestration flow.
- [ ] **Task 2.5** 🔴 `[C + A]` Validate that the flow can run end-to-end with MANUAL lockout and action logging.

---

## Phase 2b: LangFlow Visualization
> **Target: Apr 12–14** | Owner: B

- [ ] **Task 2.6** 🟡 `[B]` Build a LangFlow view that visually mirrors the runtime agentic pipeline.
- [ ] **Task 2.7** 🟡 `[B]` Keep the LangFlow diagram synced with backend labels so the UI explains the same steps the runtime uses.

---

## Phase 3: RAG and MongoDB
> **Target: Apr 15–16** | Owner: A + C

- [ ] **Task 3.1** 🔴 `[C]` Add MongoDB connection support in `/config/mongodb.js` and define `MONGODB_URI` in the environment.
- [ ] **Task 3.2** 🔴 `[A]` Define the action log document schema for retrieval and persistence.
- [ ] **Task 3.3** 🔴 `[A]` Dual-write every AI decision to Firebase and MongoDB, including no-action outcomes.
- [ ] **Task 3.4** 🔴 `[A]` Implement the RAG retrieval step so the flow can fetch the top relevant past actions before reasoning.
- [ ] **Task 3.5** 🟡 `[C]` Add a retrieval validation test that proves the system can surface the correct prior action for a similar salinity event.

---

## Phase 4: Safety and Control
> **Target: Apr 16–17** | Owner: C + A

- [ ] **Task 4.1** 🔴 `[C]` Implement `POST /api/override` for `valve_state` and `control_mode` updates.
- [ ] **Task 4.2** 🔴 `[A]` Ensure the safety submodel blocks autonomous writes whenever `control_mode` is `MANUAL`.
- [ ] **Task 4.3** 🟡 `[B]` Show `ai_status.is_processing` and `ai_status.last_reasoning` clearly in the dashboard.
- [ ] **Task 4.4** 🟡 `[A]` Add guardrail handling for invalid or conflicting model outputs so the system logs a safe fallback decision.

---

## Phase 5: Verification and Polish
> **Target: Apr 18–19** | Owner: All

- [ ] **Task 5.1** 🔴 `[C + A]` Run an end-to-end test: Simulator push → listener → LangChain control loop → MongoDB retrieval → valve update → dashboard update.
- [ ] **Task 5.2** 🔴 `[C]` Confirm MANUAL mode blocks all autonomous action.
- [ ] **Task 5.3** 🟡 `[B]` Improve log readability with status colors and timestamps.
- [ ] **Task 5.4** 🟡 `[C]` Measure round-trip latency and keep the core path under 3 seconds.

---

## Sprint Timeline

```
Apr 10–11  →  Phase 1  (B + C): Firebase schema + Simulator + Dashboard skeleton
Apr 12–14  →  Phase 2  (A + C): LangFlow orchestration and safety flow
Apr 15–16  →  Phase 3  (A + C): MongoDB RAG and persistence
Apr 16–17  →  Phase 4  (A + B + C): Manual override and guardrails
Apr 18–19  →  Phase 5  (All): Integration tests, latency check, polish
```