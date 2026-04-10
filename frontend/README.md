# SalinAI Frontend

This is the frontend interface for the SalinAI (Agriculture AI Agent) platform. It features the **Farmer Dashboard** for monitoring field conditions and the **AI Behind-the-Scenes Simulator** for visualizing AI logic decisions.

## 🚀 Quick Start for Developers

Follow these commands to get the application running on your local machine. You need [Node.js](https://nodejs.org/) installed on your system.

### 1. Navigate to the frontend directory
If you have just cloned the repository, first switch to the frontend folder:
```bash
cd frontend
```

### 2. Install Dependencies
Install all required Node modules. 
> [!NOTE] 
> We append `--legacy-peer-deps` to smoothly handle peer-dependency requirements from specific complex UI packages like `react-leaflet` and `recharts`.
```bash
npm install --legacy-peer-deps
```

### 3. Start the Development Server
Launch the local Vite server:
```bash
npm run dev
```
Your application should now automatically be available at [http://localhost:5173](http://localhost:5173).

---

## 🔧 Other Useful Commands

**Build for Production** 
Compiles and optimizes the application for deployment. Output will be generated in the `dist/` folder.
```bash
npm run build
```

**Preview Production Build locally**
Spin up a lightweight server to preview the production-ready code locally.
```bash
npm run preview
```

---

## 💻 Tech Stack
- **Framework:** React + Vite
- **Styling:** Tailwind CSS 
- **Mapping:** Leaflet & React-Leaflet
- **Charts:** Recharts
- **Icons & UI:** Lucide React / Custom SVG
