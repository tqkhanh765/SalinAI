# Langflow Visual Pipeline Setup (Task 4.1)

Because SalinAI has evolved into a Cognitive Multi-Agent system, your Langflow visual canvas needs to reflect the new **Supervisor Architecture** built in Phase 3. You can use the Mermaid diagram below as a literal map for dragging and dropping nodes on the Langflow UI.

## 1. Visual Flow Diagram (Mermaid)
*Tip: You can screenshot this diagram for your presentation if you don't have time to drag-and-drop all the nodes into Langflow before the demo!*

```mermaid
graph TD
    %% Define Styles
    classDef Trigger fill:#e2f0d9,stroke:#548235,stroke-width:2px;
    classDef Filter fill:#fff2cc,stroke:#d6b656,stroke-width:2px;
    classDef Subagent fill:#dae8fc,stroke:#6c8ebf,stroke-width:2px;
    classDef Orchestrator fill:#e1d5e7,stroke:#9673a6,stroke-width:2px;
    classDef DB fill:#ffe6cc,stroke:#d79b00,stroke-width:2px;

    %% Nodes
    A[Firebase Trigger Node\nSensor Payload]:::Trigger
    B[Event Pre-Filter Node\nAnomaly Threshold]:::Filter
    
    C[Researcher Subagent Node\nGemini Flash]:::Subagent
    D[(MongoDB Atlas\nVector Search Node)]:::DB
    E[(MongoDB Atlas\nAction History Node)]:::DB
    
    F[Orchestrator Agent Node\nGemini Flash]:::Orchestrator
    G[Tool Execution Node\nActuator Lockout]:::Orchestrator
    
    H[Firebase Log Sink]:::DB

    %% Connections
    A -->|Raw Data| B
    B -->|Safe Conditions| Z[Dropped - Save API Costs]
    B -->|Anomaly Detected!| C
    
    C -->|search_guidelines| D
    D -.->|RAG Chunks| C
    
    C -->|query_history| E
    E -.->|Past Decisions| C
    
    C -->|Drafts Actionable Summary| F
    B -->|Raw Sensor Data| F
    
    F -->|Decides Valve State| G
    G -->|Final Action Payload| H
```

## 2. Langflow Node Mapping
When building this in the Langflow UI, use these exact components:

1. **Webhook / API Trigger Node** (Represents the Firebase Listener).
2. **Conditional Router Node** (Represents the Enterprise Pre-Filter).
3. **Agent Node (Subagent)** (Use the `Tool Calling Agent` component, hook it to `SAOLA4_SMALL`).
4. **Vector Store Node** (Use `MongoDB Atlas` component configured to your `vector_index`).
5. **Agent Node (Orchestrator)** (Use a second `Tool Calling Agent` component hooked to `SAOLA4_MEDIUM`).
6. **Custom Tool Nodes** (Use the `Javascript Function` component for the Valve Actuator).

By wiring the Subagent's "Text Output" directly into the Orchestrator's "System Prompt" input, the Langflow UI will perfectly mathematically match the backend code we wrote in `langchain.js`!
