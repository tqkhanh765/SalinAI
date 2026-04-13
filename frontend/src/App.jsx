import { useState } from 'react';
import Navbar from './components/Navbar';
import FarmerDashboard from './pages/FarmerDashboard';
import SimulatorPage from './pages/SimulatorPage';
import './index.css';

function App() {
  const [activePage, setActivePage] = useState('dashboard');

  return (
    <div className="min-h-screen" style={{ background: '#EEEEEE', fontFamily: 'var(--font-vn)' }}>
      <Navbar activePage={activePage} setActivePage={setActivePage} />
      <main>
        <div style={{ display: activePage === 'dashboard' ? 'block' : 'none' }}>
          <FarmerDashboard />
        </div>
        <div style={{ display: activePage === 'simulator' ? 'block' : 'none' }}>
          <SimulatorPage />
        </div>
      </main>
    </div>
  );
}

export default App;
