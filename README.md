# SalinAI: Agentic Salinity Monitoring & Management
> **Smart Irrigation Intelligence for climate-vulnerable agriculture.**
> *Hệ thống giám sát và quản lý xâm nhập mặn thông minh ứng dụng Agentic AI.*

---

## 🌟 Vision & Mission

SalinAI is an end-to-end IoT and AI-driven solution designed to protect crops in salinity-threatened regions like the Mekong Delta. By combining real-time sensor data with **Agentic RAG (Retrieval-Augmented Generation)**, the system autonomously reasons through agricultural guidelines to make precise irrigation decisions, minimizing water stress and salinity damage for farmers.

---

## 🚀 Core Features

- **🤖 Agentic AI Reasoning**: Powered by a Multi-Agent pipeline (Researcher + Orchestrator) that simulates a professional agronomist's decision-making process.
- **📚 Multi-Factor RAG**: Retrieves local farming guidelines based on Salinity, Moisture, Weather, Tide, and Crop Stage.
- **⚡ Reactive Architecture**: Uses a real-time watcher to trigger the AI core instantly when environmental Changes are detected in the cloud bus.
- **🧠 Policy Memory**: Learns from human feedback to refine its decision-making logic over time.
- **📊 Real-time Dashboard**: Interactive visualization of telemetry, AI reasoning traces, and historical trends.
- **🛡️ Safety-First Control**: Integrated manual/automatic modes with guardrails to prevent hardware damage in critical scenarios.

---

## 🛠 Technology Stack

### **Artificial Intelligence**
- **Framework**: LangChain.js
- **Model Roles**: 
  - **SaoLa4-Medium** (FPT Cloud): The **Orchestrator** - Responsible for final decisions and tool execution.
  - **SaoLa4-Small** (FPT Cloud): The **Researcher** - Responsible for guideline analysis and evidence synthesis.
  - **Google Gemini**: The **Embedding Engine** - Powering high-precision vector search (`text-embedding-004`).
- **Observability**: LangSmith
- **Vector DB**: MongoDB Atlas Vector Search (using `text-embedding-004`)

### **Backend & Cloud**
- **Runtime**: Node.js & Express
- **Real-time Bus**: Firebase Realtime Database (Single Source of Truth)
- **Persistence**: MongoDB Atlas (History, Logs, Policy Memory)
- **External Data**: Open-Meteo & OpenWeatherMap (Weather context).

### **Frontend UX**
- **Framework**: React + Vite
- **Styling**: Tailwind CSS v4
- **Viz**: Recharts (Data analytics), Leaflet (Map visualization), Lucide React (Icons).

### **IoT & Hardware**
- **Controller**: ESP32 (Wokwi Simulator)
- **Sync Protocol**: Direct Firebase RTDB Synchronization (Real-time PUT).
- **Communication**: Heartbeat + Eager Polling for sub-15s response latency.

---

## 🏗 System Architecture

SalinAI follows a **3-Layer Push-Based Architecture** designed for high responsiveness and low server compute overhead.

### 1. Perception Layer (IoT Edge)
- **Direct Sync**: The ESP32 collects sensor data (Salinity, Moisture, Flow) and synchronizes it **directly** to the Firebase Realtime Database.
- **Trigger Logic**: Data is pushed on a **Salinity Spike** (>0.1ppt), **Moisture Drop** (>1%), or a 5-minute **Heartbeat**.
- **Eager Polling**: After syncing, the hardware polls Firebase every 15s to react instantly to AI intervention.

### 2. Intelligence Layer (Backend Watcher)
The backend acts as a reactive agent layer sitting on top of the data bus:
- **Firebase Watcher**: A continuous listener on `SalinAI/sensor_data`. When new data arrives, the watcher:
  - **Enriches**: Fetches real-time weather and tide forecasts.
  - **Triggers**: Evaluates delta-thresholds (Adaptive AI Thresholds) to decide if a reasoning cycle is needed.
- **Researcher Agent (SaoLa4-Small)**: Scans the MongoDB Vector DB for relevant agricultural guidelines and summarizes the evidence.
- **Orchestrator Agent (SaoLa4-Medium)**: Weighs the evidence, considers **Policy Memory** (past feedback), and executes the `valve_control` tool.

### 3. Interface Layer (Control Room)
- **Bilateral Sync**: The React dashboard displays the state from Firebase in real-time.
- **Traceability**: Users can inspect the specific "Reasoning Trace" to see the evidence retrieved and the logic used by the AI.

---

## 📦 Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas account (with Vector Search enabled)
- Firebase Project (Realtime Database)
- FPT Cloud (SaoLa) & Google AI Studio (Gemini) API Keys

### Step 1: Clone & Install
```bash
git clone https://github.com/tqkhanh765/SalinAI.git
cd SalinAI
# Install backend
cd backend && npm install
# Install frontend
cd ../frontend && npm install
```

### Step 2: Environment Configuration
Copy `.env.example` to `.env` in the root and fill in your credentials:
```bash
cp .env.example .env
```
Key requirements:
- `serviceAccountKey.json` placed in `./backend/`.
- `MONGODB_URI` for long-term history and RAG.
- `SAOLA4_MEDIUM_API_KEY` & `SAOLA4_SMALL_API_KEY`.
- `GOOGLE_API_KEY` (for embeddings).

---

## 🚀 Running the Project

### Local Development
**Start Backend (Watcher + API):**
```bash
cd backend
npm run dev
```
**Start Frontend:**
```bash
cd frontend
npm run dev
```

### Using Docker
```bash
docker-compose up --build
```

---

## 📂 Directory Structure

```text
/SalinAI
 ├── /ai                # Architecture specs & product design (Documentation)
 ├── /backend
 │    ├── /agent        # Multi-agent logic (Researcher & Orchestrator)
 │    ├── /config       # Firebase & MongoDB connections
 │    ├── /controllers  # Control mode & feedback API endpoints
 │    ├── /data         # RAG PDF knowledge base
 │    ├── /services     # Core services (Watcher, Enrichment, Trigger logic)
 │    └── server.js     # Entry point (Starts the Watcher)
 ├── /frontend
 │    └── /src          # Dashboard & Simulator UI (React)
 ├── /hardware
 │    ├── sketch.ino    # ESP32 Firmware (Firebase Sync logic)
 │    └── diagram.json  # Wiring diagram
 └── docker-compose.yml # Full stack containerization
```

---

## 📄 License
This project is licensed under the ISC License.

---
*Developed with ❤️ by the SalinAI Team for the Future of Sustainable Farming.*