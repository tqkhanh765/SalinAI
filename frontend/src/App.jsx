import { useState } from 'react';
import Navbar from './components/Navbar';
import FarmerDashboard from './pages/FarmerDashboard';
import SimulatorPage from './pages/SimulatorPage';
import './index.css';
import { Toaster } from 'react-hot-toast';

function App() {
  const [activePage, setActivePage] = useState('dashboard');

  return (
    <div className="min-h-screen" style={{ background: '#EEEEEE', fontFamily: 'var(--font-vn)' }}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3200,
          style: {
            borderRadius: '16px',
            padding: '14px 16px',
            fontSize: '14px',
            fontWeight: 600,
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.16)',
          },
        }}
      />
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
