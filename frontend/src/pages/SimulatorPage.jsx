import { useState, useEffect, useRef } from 'react';

// ─── Helper sub-components ─────────────────────────────────────────────────────

const SalinityGauge = ({ value }) => {
  const pct = (value / 10) * 100;
  const color = value <= 3 ? '#6FCF97' : value <= 6 ? '#F2C94C' : '#EB5757';
  const label = value <= 3 ? 'An Toàn' : value <= 6 ? 'Trung Bình' : 'Nguy Hiểm';

  return (
    <div className="relative flex flex-col items-center">
      <div
        className="relative w-36 h-36 md:w-44 md:h-44 rounded-full flex items-center justify-center"
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, #e0e0e0 ${pct * 3.6}deg)`,
          padding: '4px',
        }}
      >
        <div
          className="w-full h-full rounded-full flex flex-col items-center justify-center"
          style={{ background: '#fff' }}
        >
          <span className="text-3xl md:text-4xl font-extrabold" style={{ color: '#1F6F5F' }}>
            {value.toFixed(1)}
          </span>
          <span className="text-xs font-semibold opacity-60" style={{ color: '#1F6F5F' }}>‰ PSU</span>
          <span
            className="text-xs font-bold mt-0.5 px-2 py-0.5 rounded-full"
            style={{ background: `${color}20`, color }}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};

const WeatherIcon = ({ condition }) => {
  const icons = {
    Sunny: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ),
    'Heavy Rain': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/>
        <line x1="12" y1="15" x2="12" y2="23"/>
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
      </svg>
    ),
    Drought: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v1M12 21v1M4.22 4.22l.707.707M18.362 18.362l.707.707M2 12h1M21 12h1M4.22 19.78l.707-.707M18.362 5.638l.707-.707"/>
        <path d="M12 6 C12 6 7 12 7 15 C7 17.76 9.24 20 12 20 C14.76 20 17 17.76 17 15 C17 12 12 6 12 6Z" fill="currentColor" opacity="0.15" stroke="currentColor"/>
        <line x1="3" y1="3" x2="21" y2="21" stroke="#EB5757" strokeWidth="2"/>
      </svg>
    ),
  };
  return icons[condition] || icons.Sunny;
};

const ValveStatusCard = ({ valveOpen, salinityLevel, weatherCondition, isLoading }) => {
  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-2xl p-6 md:p-8 overflow-hidden transition-all duration-700"
      style={{
        background: valveOpen
          ? 'linear-gradient(135deg, #6FCF97 0%, #2FA084 100%)'
          : 'linear-gradient(135deg, #1F6F5F 0%, #0d3d32 100%)',
        minHeight: '200px',
      }}
    >
      {/* Decorative circles */}
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10"
        style={{ background: 'white', transform: 'translate(30%, -30%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-10"
        style={{ background: 'white', transform: 'translate(-30%, 30%)' }}
      />

      {/* Valve icon */}
      <div
        className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center mb-4 transition-all duration-700 ${
          isLoading ? '' : valveOpen ? 'pulse-safe' : 'pulse-danger'
        }`}
        style={{ background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.4)' }}
      >
        {isLoading ? (
          <svg className="animate-spin w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        ) : (
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {valveOpen ? (
              <>
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M12 8v4l3 3" stroke="white" strokeWidth="2.5"/>
                <circle cx="12" cy="12" r="3" fill="white" opacity="0.3"/>
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </>
            )}
          </svg>
        )}
      </div>

      {/* Status text */}
      <div className="text-center relative z-10">
        {isLoading ? (
          <div>
            <p className="text-white font-bold text-xl mb-1">Đang phân tích...</p>
            <p className="text-white/70 text-sm">SalinAI đang suy nghĩ</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-2">
              <span
                className="text-2xl md:text-3xl font-extrabold text-white"
              >
                VAN {valveOpen ? 'ĐÃ MỞ' : 'ĐÃ ĐÓNG'}
              </span>
            </div>
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: valveOpen ? '#fff' : '#6FCF97' }} />
              {valveOpen ? '✅ An Toàn - Có Thể Tưới' : '🚫 Chặn Nước'}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main SimulatorPage ────────────────────────────────────────────────────────

export default function SimulatorPage({ onAgentTrigger }) {
  const [salinityLevel, setSalinityLevel] = useState(4.5);
  const [weatherCondition, setWeatherCondition] = useState('Sunny');
  const [valveOpen, setValveOpen] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [hasTriggered, setHasTriggered] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  const weatherOptions = ['Sunny', 'Heavy Rain', 'Drought'];

  const salinityColor = salinityLevel <= 3 ? '#6FCF97' : salinityLevel <= 6 ? '#F2C94C' : '#EB5757';
  const sliderBg = `linear-gradient(to right, ${salinityColor} 0%, ${salinityColor} ${(salinityLevel / 10) * 100}%, #d1d5db ${(salinityLevel / 10) * 100}%, #d1d5db 100%)`;

  const handleTrigger = () => {
    if (isLoading) return;
    setIsLoading(true);
    setShowNotification(false);
    setHasTriggered(false);

    // Simulate AI processing delay (1.5–2.5s)
    const delay = 1500 + Math.random() * 1000;

    setTimeout(() => {
      // Decision logic
      const isSafe =
        salinityLevel <= 4 &&
        weatherCondition !== 'Drought' &&
        weatherCondition !== 'Heavy Rain';

      const open = isSafe || (salinityLevel <= 6 && weatherCondition === 'Sunny');

      setValveOpen(open);
      setIsLoading(false);
      setHasTriggered(true);
      setShowNotification(true);

      if (open) {
        setNotificationMsg(
          `✅ Chất lượng nước an toàn (${salinityLevel.toFixed(1)}‰). Van đã mở để tưới tiêu.`
        );
      } else {
        setNotificationMsg(
          `🚫 Điều kiện không an toàn — Độ mặn: ${salinityLevel.toFixed(1)}‰, Thời tiết: ${translateWeather(weatherCondition)}. Van vẫn đóng.`
        );
      }

      // Notify parent (for AI Logic page)
      if (onAgentTrigger) {
        onAgentTrigger({ salinityLevel, weatherCondition, valveOpen: open });
      }
    }, delay);
  };

  const translateWeather = (w) => {
    const map = { Sunny: 'Nắng', 'Heavy Rain': 'Mưa To', Drought: 'Hạn Hán' };
    return map[w] || w;
  };

  return (
    <div className="min-h-[calc(100vh-64px)] py-6 px-4 sm:px-6 lg:px-8" style={{ background: '#EEEEEE' }}>
      <div className="max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
              style={{ background: '#2FA08420', color: '#2FA084' }}>
              Bảng Điều Khiển Nông Dân
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold leading-tight" style={{ color: '#1F6F5F' }}>
            Trình Mô Phỏng Đồng Ruộng
          </h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            Điều chỉnh dữ liệu cảm biến và kích hoạt AI agent để kiểm soát van tưới tiêu.
          </p>
        </div>

        {/* Two-column grid (stacks on mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">

          {/* ── LEFT CARD: Input Controls ───────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6 flex flex-col gap-6"
            style={{ borderColor: '#1F6F5F20' }}>

            <div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid #EEEEEE' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: '#2FA08415' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2FA084" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>Dữ Liệu Cảm Biến</h2>
                <p className="text-xs text-gray-400">Cấu hình điều kiện đồng ruộng của bạn</p>
              </div>
            </div>

            {/* Salinity Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: '#1F6F5F' }}
                  htmlFor="salinity-slider">
                  💧 Độ Mặn
                </label>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-lg font-extrabold tabular-nums"
                    style={{ color: salinityColor, transition: 'color 0.3s' }}
                  >
                    {salinityLevel.toFixed(1)}
                  </span>
                  <span className="text-xs font-semibold text-gray-400">‰</span>
                </div>
              </div>
              <input
                id="salinity-slider"
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={salinityLevel}
                onChange={(e) => setSalinityLevel(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full"
                style={{ background: sliderBg, minHeight: '44px', padding: '18px 0', cursor: 'pointer' }}
              />
              <div className="flex justify-between text-xs text-gray-400 font-medium">
                <span>0 ‰ <span style={{ color: '#6FCF97' }}>● An Toàn</span></span>
                <span>5 ‰</span>
                <span style={{ color: '#EB5757' }}>Nguy Hiểm ●</span> <span>10 ‰</span>
              </div>

              {/* Gauge */}
              <div className="flex justify-center py-2">
                <SalinityGauge value={salinityLevel} />
              </div>
            </div>

            {/* Weather Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-semibold" style={{ color: '#1F6F5F' }}
                htmlFor="weather-select">
                🌤️ Điều Kiện Thời Tiết
              </label>
              <div className="relative">
                <select
                  id="weather-select"
                  value={weatherCondition}
                  onChange={(e) => setWeatherCondition(e.target.value)}
                  className="w-full appearance-none rounded-xl px-4 pr-10 font-semibold text-sm transition-all duration-200 outline-none cursor-pointer"
                  style={{
                    height: '52px',
                    background: '#F7F9F9',
                    border: '1.5px solid #1F6F5F30',
                    color: '#1F6F5F',
                    fontSize: '15px',
                  }}
                >
                  {weatherOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: '#2FA084' }}>
                  <WeatherIcon condition={weatherCondition} />
                </div>
              </div>

              {/* Weather info tags */}
              <div className="flex flex-wrap gap-2 mt-1">
                {weatherOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setWeatherCondition(opt)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                    style={weatherCondition === opt
                      ? { background: '#2FA084', color: 'white' }
                      : { background: '#f0f0f0', color: '#666' }
                    }
                  >
                    {opt === 'Sunny' ? '☀️ Nắng' : opt === 'Heavy Rain' ? '🌧️ Mưa To' : '🏜️ Hạn Hán'}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger Button */}
            <button
              id="trigger-agent-btn"
              onClick={handleTrigger}
              disabled={isLoading}
              className="w-full rounded-xl font-bold text-white text-base transition-all duration-300 flex items-center justify-center gap-3 active:scale-95"
              style={{
                minHeight: '54px',
                background: isLoading
                  ? 'linear-gradient(135deg, #94a3b8, #64748b)'
                  : 'linear-gradient(135deg, #2FA084 0%, #1F6F5F 100%)',
                boxShadow: isLoading ? 'none' : '0 6px 20px rgba(47,160,132,0.4)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  <span>SalinAI đang phân tích...</span>
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8l4 4-4 4M8 12h8"/>
                  </svg>
                  <span>Kích Hoạt SalinAI Agent</span>
                </>
              )}
            </button>
          </div>

          {/* ── RIGHT CARD: Output / Valve Status ───────────────────── */}
          <div className="flex flex-col gap-5">

            {/* Valve Status Card */}
            <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6"
              style={{ borderColor: '#1F6F5F20' }}>
              <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: '1px solid #EEEEEE' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#6FCF9715' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6FCF97" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="M9 12l2 2 4-4"/>
                  </svg>
                </div>
                <div>
                  <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>Trạng Thái Van</h2>
                  <p className="text-xs text-gray-400">Đầu ra vật lý theo thời gian thực</p>
                </div>
              </div>

              {!hasTriggered && !isLoading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: '#EEEEEE' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm text-center font-medium">
                    Chờ kích hoạt agent.<br />
                    <span className="text-xs opacity-70">Cấu hình đầu vào và nhấn nút bên dưới.</span>
                  </p>
                </div>
              ) : (
                <ValveStatusCard
                  valveOpen={valveOpen}
                  salinityLevel={salinityLevel}
                  weatherCondition={weatherCondition}
                  isLoading={isLoading}
                />
              )}
            </div>

            {/* Notification Card */}
            {showNotification && !isLoading && (
              <div
                className="log-entry bg-white rounded-2xl shadow-sm border p-5"
                style={{ borderColor: valveOpen ? '#6FCF9740' : '#1F6F5F40', borderLeftWidth: '4px', borderLeftColor: valveOpen ? '#6FCF97' : '#1F6F5F' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: valveOpen ? '#6FCF9715' : '#1F6F5F15' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={valveOpen ? '#6FCF97' : '#1F6F5F'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>
                      Quyết Định Của Agent
                    </p>
                    <p className="text-sm font-medium leading-relaxed" style={{ color: '#1F6F5F' }}>
                      {notificationMsg}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Current readings summary */}
            <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#1F6F5F20' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
                Số Liệu Hiện Tại
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: '#F7F9F9' }}>
                  <p className="text-xs text-gray-400 mb-1">Độ Mặn</p>
                  <p className="font-extrabold text-lg tabular-nums" style={{ color: salinityColor }}>
                    {salinityLevel.toFixed(1)} <span className="text-xs font-semibold text-gray-400">‰</span>
                  </p>
                </div>
                <div className="rounded-xl p-3" style={{ background: '#F7F9F9' }}>
                  <p className="text-xs text-gray-400 mb-1">Thời Tiết</p>
                  <p className="font-bold text-sm" style={{ color: '#1F6F5F' }}>{translateWeather(weatherCondition)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
