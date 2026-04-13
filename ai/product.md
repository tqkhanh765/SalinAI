# Product Requirements Document (PRD): SalinAI v2.2

## 1. Product Vision
SalinAI is a standalone Multi-Agent system that **Studies, Responds, and Learns** to protect Mekong Delta crops.
It ingests unstructured data (PDFs/papers) via automated chunking RAG. Its Researcher Subagent constantly learns by reading past decisions before allowing the Orchestrator Agent to control the hardware. LangChain powers the runtime intelligence, while LangFlow is used strictly to visualize this cognitive pipeline.

---

## 2. Core Scope

| # | Feature | Priority |
|---|---|---|
| 1 | Real-time sensor monitoring for salinity and moisture via Firebase | P0 |
| 2 | Autonomous valve control in AUTO mode using the AI pipeline | P0 |
| 3 | Manual override with hard lockout for AI actions | P0 |
| 4 | RAG over MongoDB Atlas action history and domain context | P0 |
| 5 | LangFlow pipeline visualization for reusable AI subflows | P0 |
| 6 | Real-time dashboard for sensor values, valve state, and action logs | P0 |
| 7 | Optional weather enrichment for proactive decisions | P1 |

### Explicitly out of active scope
- Chatbot UI and chat endpoints
- Telegram, email, or other notification delivery
- Any agent behavior that is not tied to sensor-driven control or RAG

---

## 3. Why LangFlow
LangFlow is useful here because it lets the team visualize the AI system as smaller reusable flows instead of one large agent file. That makes it easier to explain, demo, and split across substeps, while LangChain still performs the runtime control and reasoning.

Recommended submodel split:
- Context ingestion submodel: collects Firebase sensor state, weather, and control mode.
- RAG retrieval submodel: queries MongoDB for relevant past actions and guidance.
- Decision submodel: reasons about the current situation and proposes the next action.
- Safety submodel: validates the proposed action against hard rules before writing to Firebase.
- Visualization submodel: represents the flow in LangFlow for easier UI explanation.

---

## 4. Core User Flows

### Flow A: Autonomous Control in AUTO mode
1. User pushes sensor values from the Simulator Page to Firebase.
2. Firebase listener detects the change and filters out duplicates or low-signal updates.
3. LangChain runs the orchestration flow.
4. The context ingestion substep builds the current state.
5. The RAG retrieval substep fetches relevant history from MongoDB.
6. The decision substep evaluates salinity, moisture, and optional weather context.
7. The safety substep confirms the action is valid.
8. If needed, the system writes the valve state to Firebase and stores the action log in MongoDB.

### Flow B: Manual Override
1. User switches `control_mode` to `MANUAL` from the dashboard.
2. The listener and AI pipeline treat the system as locked.
3. No autonomous valve command is written while MANUAL is active.
4. User can return to `AUTO` when ready.

### Flow C: RAG-Driven History Review
1. The user inspects past actions through the dashboard logs.
2. The backend retrieves the related MongoDB action history.
3. The UI can show why a prior valve decision was made.

---

## 5. Decision Rules

The active AI pipeline must obey these hard rules:

| Condition | Required Action |
|---|---|
| `control_mode == "MANUAL"` | Stop before any autonomous valve action |
| `salinity >= 2 ppt` | Recommend or apply `CLOSED` depending on safety gate |
| `salinity < 1 ppt` and valve is `CLOSED` | Recommend `OPEN` if no other risk is present |
| MongoDB retrieval returns relevant history | Use it as supporting context, not as a replacement for safety rules |
| Any action taken | Produce a clear reason string and store the decision trail |

---

## 6. Non-Functional Requirements
- **Latency:** End-to-end sensor push to dashboard update should stay under 3 seconds.
- **Reliability:** Duplicate sensor events must not trigger repeated AI runs.
- **Traceability:** Every action or no-action decision must be written to Firebase and MongoDB.
- **Modularity:** Each substep should be independently testable, and LangFlow should be able to visualize the same structure.