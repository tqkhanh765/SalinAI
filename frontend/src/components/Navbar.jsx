import { useState } from 'react';
import logo from '../assets/SalinAI-logo.png';
import { NAV_TABS } from './navigationTabs';

const MenuIcon = ({ open }) => (
  <div className="w-6 h-5 flex flex-col justify-between cursor-pointer" aria-label="Toggle menu">
    <span
      className="hamburger-line block h-0.5 rounded-full bg-white transition-all duration-300"
      style={{
        transform: open ? 'translateY(10px) rotate(45deg)' : 'none',
      }}
    />
    <span
      className="hamburger-line block h-0.5 rounded-full bg-white transition-all duration-300"
      style={{ opacity: open ? 0 : 1 }}
    />
    <span
      className="hamburger-line block h-0.5 rounded-full bg-white transition-all duration-300"
      style={{
        transform: open ? 'translateY(-10px) rotate(-45deg)' : 'none',
      }}
    />
  </div>
);

const SalinLogo = () => (
  <div className="flex items-center gap-2.5">
    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-white/25 backdrop-blur-md overflow-hidden p-1 shadow-inner">
      <img src={logo} alt="SalinAI Logo" className="w-full h-full object-contain drop-shadow-sm" />
    </div>
    <div>
      <span className="text-white font-extrabold text-xl tracking-tight leading-none drop-shadow-md">Salin</span>
      <span style={{ color: '#6FCF97' }} className="font-extrabold text-xl tracking-tight leading-none drop-shadow-md">AI</span>
    </div>
  </div>
);

export default function Navbar({ activePage, setActivePage }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleTabClick = (id) => {
    setActivePage(id);
    setMenuOpen(false);
  };

  return (
    <nav
      className="sticky top-0 z-50 w-full"
      style={{ background: 'linear-gradient(135deg, #1F6F5F 0%, #2FA084 100%)', boxShadow: '0 4px 24px rgba(31,111,95,0.25)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <SalinLogo />

          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-xl p-1.5 border border-white/20">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => handleTabClick(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activePage === tab.id
                    ? 'bg-white shadow-md'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                style={activePage === tab.id ? { color: '#1F6F5F' } : {}}
              >
                <span className={activePage === tab.id ? '' : 'opacity-80'}>{tab.icon}</span>
                <div className="text-left">
                  <div className="leading-tight">{tab.label}</div>
                  <div className={`text-xs font-normal leading-tight ${activePage === tab.id ? 'opacity-60' : 'opacity-50'}`}>
                    {tab.sublabel}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5 border border-white/20">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#6FCF97' }} />
            <span className="text-white/90 text-xs font-medium">AI Đang Hoạt Động</span>
          </div>

          <button
            id="mobile-menu-btn"
            className="md:hidden flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 border border-white/20 active:bg-white/20 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Mở/đóng menu điều hướng"
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>

      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${menuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
          }`}
        style={{ background: 'rgba(31,111,95,0.97)', borderTop: '1px solid rgba(255,255,255,0.15)' }}
      >
        <div className="px-4 py-3 space-y-2">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`mobile-nav-tab-${tab.id}`}
              onClick={() => handleTabClick(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-200 ${activePage === tab.id
                  ? 'bg-white shadow-lg'
                  : 'bg-white/10 border border-white/15 active:bg-white/20'
                }`}
              style={activePage === tab.id ? { color: '#1F6F5F' } : { color: 'rgba(255,255,255,0.9)' }}
            >
              <span className="shrink-0">{tab.icon}</span>
              <div>
                <div className="font-semibold text-sm">{tab.label}</div>
                <div className="text-xs opacity-60">{tab.sublabel}</div>
              </div>
              {activePage === tab.id && (
                <span className="ml-auto w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#2FA084' }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
