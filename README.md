# SalinAI: Agentic Salinity Monitoring & Management
> **Smart Irrigation Intelligence for climate-vulnerable agriculture.**
> *Intelligent salinity monitoring and management system powered by Agentic AI v6.0.*

---

## 🎬 Demo Video

[![SalinAI Demo Video](https://img.youtube.com/vi/VlD3pZOHvxo/maxresdefault.jpg)](https://www.youtube.com/watch?v=VlD3pZOHvxo)

> 📺 Click the thumbnail above to watch the full project demo on YouTube.

---

## 🌟 Vision & Mission
SalinAI is a comprehensive IoT and AI solution designed to protect crops in salinity-threatened regions like the Mekong Delta. By combining real-time sensor data with an **Agentic Multi-Agent Pipeline**, the system autonomously reasons through agricultural guidelines to make precise irrigation decisions, minimizing water stress and salinity damage for farmers.

---

## 🚀 Core Features

- **🤖 Multi-Agent Orchestration**: A collaborative pipeline featuring 4 specialized agents:
    - **Researcher**: Retrieves and synthesizes evidence from the knowledge base (RAG).
    - **Orchestrator**: Performs deep reasoning and executes valve control decisions.
    - **Planner**: Generates proactive irrigation plans based on 3-5 day weather forecasts.
    - **Evaluator**: Analyzes farmer feedback to extract "Lessons Learned" for autonomous system improvement (Self-Learning).
- **⚡ Real-time Streaming Reasoning**: Monitor AI reasoning steps in real-time (step-by-step) via **Socket.io**.
- **📅 Proactive Irrigation Planning**: Automatically generates daily irrigation strategies based on tide and rainfall forecasts.
- **🧠 Policy Memory & RLHF**: The system learns from past mistakes through a human-in-the-loop feedback loop.
- **📊 Advanced Farmer Dashboard**: Intuitive visualization of telemetry data, trend charts, and real-time actuator status.
- **🛡️ Safety-First Guardrails**: Integrated "Double Disaster" and "Sweet Water Trap" protocols to ensure maximum crop safety.

---

## 🏗 System Architecture
SalinAI v6.0 operates on a **4-Layer Architecture**:

1. **Perception Layer (IoT Edge)**: ESP32 collects environmental data (Salinity, Moisture) and syncs directly to the **Firebase Realtime Database**.
2. **Decision Intelligence (Agentic Core)**: Backend Watcher detects changes and triggers the Multi-Agent pipeline (Researcher + Orchestrator) using **RAG** on MongoDB Atlas.
3. **Proactive Intelligence**: A daily scheduler predicts salinity risks and generates proactive irrigation plans.
4. **Execution & UX Layer**: Results are streamed to the Dashboard via **Socket.io** (token streaming) and valve states are synced back to the hardware.

---

## 🛠 Technology Stack

### **Artificial Intelligence**
- **Framework**: LangChain.js
- **Models**:
  - **GLM-4.7 / SaoLa4-Medium**: The Orchestrator for final decision making.
  - **SaoLa4-Small**: The Researcher for guideline synthesis.
  - **Gemini 1.5/2.0 Flash**: Embedding engine and Fallback provider.
- **Vector DB**: MongoDB Atlas Vector Search.

### **Backend & Infrastructure**
- **Runtime**: Node.js (Express)
- **Real-time Bus**: Firebase Realtime Database.
- **Streaming**: Socket.io (Real-time Token Streaming).
- **Database**: MongoDB (History, Lessons Learned, Policy Memory).

### **Frontend & UX**
- **Framework**: React + Vite.
- **Styling**: Tailwind CSS v4.
- **Visuals**: Recharts, Lucide Icons, Framer Motion (Animations).

---

## 📂 Directory Structure

```text
/SalinAI
 ├── /docs              # Technical documentation, architecture, and design (v6.0)
 ├── /backend
 │    ├── /agent        # Multi-agent logic (Researcher, Orchestrator, Planner, Evaluator)
 │    ├── /services
 │    │    ├── /ai      # AI Services (RAG, Policy Learning, Proactive Planning)
 │    │    ├── /core    # Infrastructure (Firebase Watcher, Socket, Safety Guardrails)
 │    │    └── /external # External API integrations (Weather, Tide)
 │    ├── /config       # Connection configs for Firebase, MongoDB
 │    ├── /routes       # API Endpoints (Health, Farm, AI Stream)
 │    └── server.js     # Entry point (Starts Watcher & Schedulers)
 ├── /frontend
 │    ├── /src
 │    │    ├── /components # UI Components (Irrigation Panel, Streaming Reasoning)
 │    │    ├── /hooks      # Custom hooks (useAIStream, useRealtimeFarmState)
 │    │    └── /pages      # Farmer Dashboard, Simulator
 └── docker-compose.yml # Full-stack containerization
```

---

## 📦 Installation & Setup

### Step 1: Clone & Install
```bash
git clone https://github.com/tqkhanh765/SalinAI.git
cd SalinAI
# Install dependencies
cd backend && npm install
cd ../frontend && npm install
```

### Step 2: Environment Configuration
Create a `.env` file in the root (or inside `backend/`) based on `.env.example`:
- `serviceAccountKey.json`: Place inside the `backend/` directory.
- `MONGODB_URI`: Connection string for MongoDB Atlas.
- `SAOLA4_MEDIUM_API_KEY`: API Key for the Orchestrator.
- `GOOGLE_API_KEY`: API Key for Gemini (Embeddings).

### Step 3: Running the Project
**Start Backend:**
```bash
cd backend && npm run dev
```
**Start Frontend:**
```bash
cd frontend && npm run dev
```

---

## 📄 License
This project is licensed under the ISC License.

---
*Developed with ❤️ by the SalinAI Team for the Future of Sustainable Farming.*