# System Architecture (v2.2 — LangChain Agentic Core + LangFlow Visualization)

## 1. High-Level Architecture
The system is structured into three layers around Firebase for realtime state, MongoDB for RAG history, and a Node.js plus LangChain agentic core for runtime control. LangFlow is used only to visualize the pipeline in the UI so the system is easier to explain and iterate on. The goal is to keep the pipeline modular so each substep can be built, tested, and replaced independently.

---

### Layer 1: Perception and State Capture
This layer collects raw environmental data and writes it into Firebase.

| Component | Technology | Description |
|---|---|---|
| Sensor Mockup / ESP32 | React Simulator or hardware | Pushes `salinity` and `moisture` to Firebase |
| Firebase Listener | Node.js listener | Detects changes and decides whether the AI pipeline should run |
| Optional Weather Enrichment | OpenWeatherMap or mocked data | Adds macro context when the flow needs it |

---

### Layer 2: Agentic Core (Node.js + LangChain)
This layer is the active AI pipeline. Node.js hosts the runtime loop and LangChain performs reasoning, control, and tool use. LangFlow mirrors the same structure visually, but does not control execution.

| Submodel | Role | Notes |
|---|---|---|
| Context Ingestion Substep | Builds the current state from Firebase and system inputs | Keeps sensor, control mode, and weather normalization isolated |
| RAG Retrieval Substep | Queries MongoDB Atlas for relevant historical actions and guidance | Can be swapped between keyword search, vector search, or hybrid retrieval |
| Decision Substep | Generates the proposed action and reason | Focuses on reasoning only, not on writing state |
| Safety Validation Substep | Applies hard rules before any write happens | Prevents unsafe actions, especially in MANUAL mode |
| Persistence Substep | Writes the final decision trail to Firebase and MongoDB | Centralizes logging and auditability |
| LangFlow View | Visual representation of the same pipeline | Used for communication, not runtime control |

**Runtime composition pattern:**
```
Firebase event → LangChain control loop → Context Ingestion → RAG Retrieval → Decision → Safety Validation → Persistence
```

This structure makes it easier to iterate on one piece at a time. For example, the retrieval step can change from simple past-log lookup to MongoDB Vector Search without rewriting the decision logic. LangFlow should show the same path in a visual graph.

---

### Layer 3: Execution and Dashboard
This layer turns decisions into visible state changes.

| Component | Technology | Description |
|---|---|---|
| Command Bus | Firebase Realtime DB | Carries valve commands and control mode state |
| Hardware / Actuator | Valve or relay | Reads OPEN / CLOSED state from Firebase |
| Dashboard | React app | Displays sensor state, valve status, logs, and RAG-assisted history |
| MongoDB Atlas | Vector Search / document store | Stores decision history for retrieval and audit |

---

## 2. Control Mode State Machine
The `actuator.control_mode` field governs autonomy:

```
AUTO  ──(User sets MANUAL)──▶  MANUAL
MANUAL ──(User sets AUTO)───▶  AUTO

- In AUTO mode: the orchestration flow may write to `actuator.valve_state` after safety validation.
- In MANUAL mode: the orchestration flow must stop before any autonomous write.
```

---

## 3. Data Flow (Step-by-Step)

| Step | Description |
|---|---|
| 1 | Simulator or hardware pushes `salinity` and `moisture` to Firebase |
| 2 | Firebase listener detects the update and filters duplicates or noisy repeats |
| 3 | LangChain starts the orchestration flow |
| 4 | Context ingestion substep normalizes current state |
| 5 | RAG retrieval substep queries MongoDB for similar cases and past decisions |
| 6 | Decision substep proposes the next action and reason |
| 7 | Safety validation substep checks MANUAL mode and hard salinity rules |
| 8 | Persistence substep writes the final action and reasoning to Firebase and MongoDB |
| 9 | Dashboard updates in realtime from Firebase |

---

## 4. Submodel Strategy
The system should be broken into smaller units so the team can work in parallel.

| Substep | Ownership Example | Output |
|---|---|---|
| Ingestion | Data preparation | Clean current-state payload |
| Retrieval | RAG / memory | Relevant MongoDB context |
| Reasoning | AI decisioning | Proposed action and explanation |
| Safety | Guardrails | Approved or blocked action |
| Persistence | Audit trail | Firebase and MongoDB log entries |

This split is the main reason to use LangFlow for visualization: each substep can be tested on its own, then wired together in a single graph that mirrors the runtime loop.

---

## 5. Directory Structure (Monorepo)
```text
/SalinAI
 ├── /ai                    # Documentation and planning
 │    ├── architecture.md   # This file
 │    ├── api-contract.md   # Firebase schema and AI contracts
 │    ├── product.md        # PRD and product vision
 │    ├── task.md           # Sprint task board
 │    └── testing.md        # Test cases and edge cases
 ├── /backend               # Node.js backend and orchestration layer
 │    ├── /agent
 │    │    ├── langchain.js  # Runtime orchestration wrapper or flow runner
 │    │    ├── prompt.js     # Decision rules and context template
 │    │    └── tools.js      # Valve control and persistence tools
 │    ├── /listeners
 │    │    └── firebase-listener.js  # Realtime DB change handler and throttling
 │    ├── /config
 │    │    ├── firebase.js   # Firebase Admin SDK singleton
 │    │    └── mongodb.js    # MongoDB connection and retrieval client
 │    └── server.js          # Express entry point and REST routes
 ├── /frontend               # React dashboard and simulator
 └── /hardware               # ESP32 firmware or mockup scripts
```

---

## 6. Technology Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React.js (Vite) | Dashboard and simulator |
| Backend | Node.js and Express | API and event listener host |
| Orchestration | Node.js + LangChain | Runtime control and reasoning |
| Visualization | LangFlow | Visual pipeline only |
| Reasoning Model | Gemini 2.5 Flash | Decision generation |
| Realtime State | Firebase Realtime DB | Live sensor and actuator state |
| RAG Store | MongoDB Atlas | Historical decisions and semantic retrieval |
| Weather Data | OpenWeatherMap | Optional context enrichment |
