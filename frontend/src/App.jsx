import { useState } from 'react';
import Navbar from './components/Navbar';
import FarmerDashboard from './pages/FarmerDashboard';
import BehindTheScenes from './pages/BehindTheScenes';
import './index.css';

function App() {
  const [activePage, setActivePage] = useState('dashboard');

  return (
    <div className="min-h-screen" style={{ background: '#EEEEEE', fontFamily: "'Inter', sans-serif" }}>
      <Navbar activePage={activePage} setActivePage={setActivePage} />
      <main>
        <div style={{ display: activePage === 'dashboard' ? 'block' : 'none' }}>
          <FarmerDashboard />
        </div>
        <div style={{ display: activePage === 'ai-logic' ? 'block' : 'none' }}>
          <BehindTheScenes />
        </div>
      </main>
    </div>
  );
}

export default App;
