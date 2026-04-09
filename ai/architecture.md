# System Architecture

## 1. High-Level Architecture
The system uses an Event-Driven Architecture over WebSockets (Firebase Realtime DB) to ensure sub-3-second latency.

- **Frontend (React.js / Vite):** - Hosts both the `Dashboard` and the `Simulator`.
  - Connects directly to Firebase via Client SDK to listen for state changes.
- **Backend (Node.js / Express):**
  - Acts as the Agentic Core.
  - Uses `firebase-admin` to listen to DB changes.
  - Integrates `@langchain/google-genai` for reasoning.
- **Database (Firebase Realtime DB):**
  - The central source of truth for both state and logs.

## 2. Directory Structure (Monorepo)
```text
/salin-ai-monorepo
 ├── /frontend          # React, Tailwind, Firebase Client
 │    ├── /src/pages    # Dashboard.jsx, Simulator.jsx
 │    └── /src/lib      # firebase.js
 ├── /backend           # Node.js, Express, LangChain
 │    ├── /agent        # prompt.js, tools.js, langchain.js
 │    ├── /listeners    # firebase-listener.js
 │    └── server.js     # Express entry point
 └── docs               # product.md, architecture.md, etc.

