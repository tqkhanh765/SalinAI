import { useState, useEffect, useRef } from 'react';

// ─── Log Section Tags ──────────────────────────────────────────────────────────

const TAG_STYLES = {
  DATA_RECEIVED: {
    label: 'DỮ LIỆU ĐẦU VÀO',
    bg: '#1e3a5f',
    text: '#60a5fa',
    border: '#2563eb40',
    icon: '📡',
  },
  CONTEXT_MATCHED: {
    label: 'QUY TẮC KHỚP',
    bg: '#1a3a2a',
    text: '#4ade80',
    border: '#16a34a40',
    icon: '🔍',
  },
  AGENT_REASONING: {
    label: 'LUẬN GIẢI CỦA AI',
    bg: '#2d1f3a',
    text: '#c084fc',
    border: '#9333ea40',
    icon: '🧠',
  },
  FUNCTION_EXECUTION: {
    label: 'GỌI HÀM ĐIỀU KHIỂN',
    bg: '#3a2a1a',
    text: '#fb923c',
    border: '#ea580c40',
    icon: '⚡',
  },
};

// ─── Typing Effect Hook ────────────────────────────────────────────────────────

function useTypingEffect(text, speed = 18, active = false) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setDisplayed('');
      setDone(false);
      indexRef.current = 0;
      return;
    }
    setDisplayed('');
    setDone(false);
    indexRef.current = 0;
    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed((prev) => prev + text[indexRef.current]);
        indexRef.current++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, active, speed]);

  return { displayed, done };
}

// ─── Log Section ──────────────────────────────────────────────────────────────

const LogSection = ({ type, content, visible, isTyping = false, typingText = '' }) => {
  const style = TAG_STYLES[type];
  const { displayed, done } = useTypingEffect(typingText, 20, isTyping && visible);
  if (!visible) return null;
  return (
    <div className="log-entry rounded-xl overflow-hidden" style={{ border: `1px solid ${style.border}`, background: style.bg }}>
      <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: 'rgba(0,0,0,0.2)', borderBottom: `1px solid ${style.border}` }}>
        <span className="text-base">{style.icon}</span>
        <span className="text-xs font-bold tracking-[0.15em]" style={{ color: style.text }}>
          [{style.label}]
        </span>
        <div className="ml-auto flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full opacity-40" style={{ background: style.text }} />
          ))}
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        {isTyping && visible ? (
          <p className="text-xs sm:text-sm leading-relaxed font-mono whitespace-pre-wrap" style={{ color: style.text }}>
            {displayed}
            {!done && <span className="typing-cursor" />}
          </p>
        ) : (
          <pre className="text-xs sm:text-sm leading-relaxed font-mono whitespace-pre-wrap break-words" style={{ color: style.text, margin: 0 }}>
            {content}
          </pre>
        )}
      </div>
    </div>
  );
};

// ─── Salinity Gauge ────────────────────────────────────────────────────────────

const SalinityGauge = ({ value }) => {
  const pct = (value / 10) * 100;
  const color = value <= 3 ? '#6FCF97' : value <= 6 ? '#F2C94C' : '#EB5757';
  const label = value <= 3 ? 'An Toàn' : value <= 6 ? 'Trung Bình' : 'Nguy Hiểm';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28 rounded-full flex items-center justify-center"
        style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, #e0e0e0 ${pct * 3.6}deg)`, padding: '4px' }}>
        <div className="w-full h-full rounded-full flex flex-col items-center justify-center" style={{ background: '#fff' }}>
          <span className="text-2xl font-extrabold" style={{ color: '#1F6F5F' }}>{value.toFixed(1)}</span>
          <span className="text-xs font-semibold opacity-60" style={{ color: '#1F6F5F' }}>‰</span>
          <span className="text-xs font-bold mt-0.5 px-1.5 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>{label}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Weather Icon ──────────────────────────────────────────────────────────────

const WeatherIcon = ({ condition }) => {
  if (condition === 'Sunny') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
  if (condition === 'Heavy Rain') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/>
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
    </svg>
  );
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="3" x2="22" y2="21" stroke="#EB5757" strokeWidth="2"/>
    </svg>
  );
};

// ─── Empty Terminal ────────────────────────────────────────────────────────────

const EmptyTerminal = () => (
  <div className="flex flex-col items-center justify-center py-14 gap-4">
    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
      style={{ background: 'rgba(47,160,132,0.15)', border: '1px solid rgba(47,160,132,0.2)' }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2FA084" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    </div>
    <div className="text-center">
      <p className="font-semibold text-sm" style={{ color: '#4ade80' }}>Terminal Sẵn Sàng</p>
      <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
        Nhấn <span style={{ color: '#2FA084' }}>Kích Hoạt SalinAI Agent</span> bên trên để xem nhật ký.
      </p>
    </div>
    <div className="flex items-center gap-2 mt-1">
      <span style={{ color: '#2FA084', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>$</span>
      <span className="w-2 h-4 rounded-sm inline-block" style={{ background: '#2FA084', animation: 'typing-cursor 1s ease-in-out infinite' }} />
    </div>
  </div>
);

// ─── Main BehindTheScenes ──────────────────────────────────────────────────────

export default function BehindTheScenes() {
  // Simulator state
  const [salinityLevel, setSalinityLevel] = useState(4.5);
  const [weatherCondition, setWeatherCondition] = useState('Sunny');
  const [isSimLoading, setIsSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // AI Log state
  const [logs, setLogs] = useState([]);
  const [visibleSections, setVisibleSections] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [timestamp, setTimestamp] = useState('');
  const logContainerRef = useRef(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [visibleSections]);

  const weatherOptions = ['Sunny', 'Heavy Rain', 'Drought'];
  const translateWeather = (w) => ({ Sunny: 'Nắng', 'Heavy Rain': 'Mưa To', Drought: 'Hạn Hán' })[w] || w;

  const salinityColor = salinityLevel <= 3 ? '#6FCF97' : salinityLevel <= 6 ? '#F2C94C' : '#EB5757';
  const sliderBg = `linear-gradient(to right, ${salinityColor} 0%, ${salinityColor} ${(salinityLevel / 10) * 100}%, #d1d5db ${(salinityLevel / 10) * 100}%, #d1d5db 100%)`;

  const handleTrigger = () => {
    if (isSimLoading || isRunning) return;
    setIsSimLoading(true);
    setSimResult(null);
    setVisibleSections({});
    setLogs([]);

    const delay = 1500 + Math.random() * 800;
    setTimeout(() => {
      const isSafe = salinityLevel <= 4 && weatherCondition !== 'Drought' && weatherCondition !== 'Heavy Rain';
      const valveOpen = isSafe || (salinityLevel <= 6 && weatherCondition === 'Sunny');

      setSimResult({ valveOpen, salinityLevel, weatherCondition });
      setIsSimLoading(false);

      // Start terminal
      runAgentLog({ salinityLevel, weatherCondition, valveOpen });
    }, delay);
  };

  const runAgentLog = ({ salinityLevel, weatherCondition, valveOpen }) => {
    const ts = new Date().toISOString();
    setTimestamp(ts);
    setIsRunning(true);
    setRunCount((c) => c + 1);

    const roundedSalinity = parseFloat(salinityLevel.toFixed(2));
    const isSafe = valveOpen;

    let matchedRule = '';
    if (roundedSalinity <= 4 && weatherCondition === 'Sunny') {
      matchedRule = 'QUY_TẮC_01: độ_mặn <= 4‰ VÀ thời_tiết == "Nắng" → MỞ_VAN';
    } else if (roundedSalinity <= 6 && weatherCondition === 'Sunny') {
      matchedRule = 'QUY_TẮC_02: 4 < độ_mặn <= 6‰ VÀ thời_tiết == "Nắng" → MỞ_VAN (có điều kiện)';
    } else if (weatherCondition === 'Heavy Rain') {
      matchedRule = 'QUY_TẮC_03: thời_tiết == "Mưa To" → ĐÓNG_VAN (nguy cơ ngập lụt)';
    } else if (weatherCondition === 'Drought') {
      matchedRule = 'QUY_TẮC_04: thời_tiết == "Hạn Hán" → ĐÓNG_VAN (bảo tồn nước)';
    } else {
      matchedRule = 'QUY_TẮC_05: độ_mặn > 6‰ → ĐÓNG_VAN (nguy cơ tổn thương mùa vụ)';
    }

    const reasoningText = isSafe
      ? `Đang phân tích điều kiện đồng ruộng hiện tại...

Số liệu độ mặn ${roundedSalinity}‰ nằm trong ngưỡng chấp nhận được cho tưới tiêu (tối đa 4.0‰ để lúa phát triển tốt nhất). Điều kiện thời tiết hiện tại (${translateWeather(weatherCondition)}) không gây nguy cơ ngập lụt hay hạn hán.

Đối chiếu với dữ liệu lịch sử của mảnh ruộng này:
→ Điều kiện tương tự ngày 14/03/2024: đã mở van, năng suất tăng +12%
→ Điều kiện tương tự ngày 22/07/2024: đã mở van, không có thiệt hại mùa vụ

Độ tin cậy: 94.7%

Quyết định: MỞ VAN. Điều kiện đang tối ưu cho việc tưới tiêu. Nông dân có thể tiến hành tưới theo lịch định.`
      : `Đang phân tích điều kiện đồng ruộng hiện tại...

Số liệu độ mặn ${roundedSalinity}‰ ${roundedSalinity > 6 ? 'vượt ngưỡng an toàn (tối đa 6.0‰)' : 'trong mức chấp nhận, TUY NHIÊN'}. Điều kiện thời tiết "${translateWeather(weatherCondition)}" ${weatherCondition === 'Heavy Rain' ? 'gây nguy cơ cao ngập lụt và rửa trôi đất' : weatherCondition === 'Drought' ? 'cho thấy thiếu nước — tưới lúc này lãng phí và không hiệu quả' : 'kết hợp với độ mặn cao gây nguy hại cho mùa vụ'}.

Đánh giá rủi ro:
→ Xác suất thiệt hại cây trồng: ${roundedSalinity > 8 ? '87%' : '65%'}
→ Dự đoán giảm năng suất nếu tưới: ~${roundedSalinity > 8 ? '35-50%' : '15-30%'}

Độ tin cậy: 96.2%

Quyết định: ĐÓNG VAN. Không khuyến cáo tưới tiêu trong điều kiện hiện tại.`;

    const functionCall = isSafe
      ? `dieu_khien_van(hanh_dong="MO", van_id="CANH_DONG_01_CHINH", thoi_gian_phut=45, luu_luong_L_phut=12.5)`
      : `dieu_khien_van(hanh_dong="DONG", van_id="CANH_DONG_01_CHINH", canh_bao_nong_dan=True, ly_do="${weatherCondition === 'Heavy Rain' ? 'nguy_co_ngap_lut' : weatherCondition === 'Drought' ? 'bao_ton_nuoc_han_han' : 'do_man_cao'}")`;

    const allLogs = [
      {
        id: 'DATA_RECEIVED',
        content: JSON.stringify({
          timestamp: ts,
          sensor_id: 'SALIN-CẢM-BIẾN-001',
          field_id: 'CANH_DONG_01',
          payload: {
            salinity_ppt: roundedSalinity,
            weather_condition: translateWeather(weatherCondition),
            temperature_c: weatherCondition === 'Sunny' ? 32.4 : weatherCondition === 'Heavy Rain' ? 24.1 : 38.6,
            humidity_pct: weatherCondition === 'Sunny' ? 65 : weatherCondition === 'Heavy Rain' ? 92 : 28,
            soil_moisture: weatherCondition === 'Drought' ? 12 : 55,
          },
          agent: 'SalinAI-v2.1',
        }, null, 2),
      },
      {
        id: 'CONTEXT_MATCHED',
        content: `Nội Dung Hệ Thống (System Prompt):
─────────────────────────────────
"Bạn là SalinAI, một AI agent thông minh kiểm soát tưới tiêu. Nhiệm vụ
của bạn là phân tích dữ liệu cảm biến và đưa ra quyết định an toàn về
việc kiểm soát van tưới tiêu.

Quy Tắc An Toàn:
  QUY_TẮC_01: độ_mặn <= 4‰ VÀ nắng   → MỞ
  QUY_TẮC_02: 4 < độ_mặn <= 6‰ + nắng → MỞ (theo dõi)
  QUY_TẮC_03: Mưa To                  → ĐÓNG
  QUY_TẮC_04: Hạn Hán                 → ĐÓNG
  QUY_TẮC_05: độ_mặn > 6‰             → ĐÓNG"
─────────────────────────────────
Khớp: ${matchedRule}
Độ ưu tiên: CAO
Yêu cầu lệnh ghi đè: không`,
      },
      { id: 'AGENT_REASONING', isTyping: true, content: reasoningText },
      {
        id: 'FUNCTION_EXECUTION',
        content: `> Gọi hàm: dieu_khien_van()
> ${functionCall}

✓ Cổng IoT: CANH_DONG_01_CHINH đã xác nhận
✓ Trạng thái van vật lý: ${isSafe ? 'ĐÃ MỞ' : 'ĐÃ ĐÓNG'}
✓ Mã xác nhận: van_ack_${Math.random().toString(36).substring(2, 9).toUpperCase()}
✓ Thông báo SMS gửi nông dân: ĐÃ GỬI

Thời gian thực thi: ${(120 + Math.random() * 80).toFixed(0)}ms
Trạng thái: THÀNH CÔNG`,
      },
    ];

    setLogs(allLogs);
    const delays = [0, 900, 2000, 5200];
    allLogs.forEach((log, i) => {
      setTimeout(() => {
        setVisibleSections((prev) => ({ ...prev, [log.id]: true }));
        if (i === allLogs.length - 1) setIsRunning(false);
      }, delays[i]);
    });
  };

  const hasLogs = logs.length > 0;

  return (
    <div className="min-h-[calc(100vh-64px)] py-6 px-4 sm:px-6 lg:px-8" style={{ background: '#EEEEEE' }}>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── Header ────────────────────────────────────────────────── */}
        <div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
            style={{ background: '#1F6F5F20', color: '#1F6F5F' }}>
            Góc Nhìn Ban Giám Khảo & Kỹ Sư
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold leading-tight mt-1" style={{ color: '#1F6F5F' }}>
            Hậu Trường Hệ Thống
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Mô phỏng dữ liệu cảm biến và theo dõi toàn bộ quy trình ra quyết định của SalinAI.
          </p>
        </div>

        {/* ── Simulator Panel ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: '1px solid #EEEEEE' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#2FA08415' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2FA084" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>Bảng Mô Phỏng Cảm Biến</h2>
              <p className="text-xs text-gray-400">Nhập dữ liệu giả lập để kiểm tra logic AI</p>
            </div>
            <div className="ml-auto hidden sm:flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5 border" style={{ borderColor: '#1F6F5F20' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F2C94C' }} />
              <span className="text-xs font-mono text-gray-500">Chế độ mô phỏng</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {/* Salinity slider */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: '#1F6F5F' }} htmlFor="sim-salinity-slider">
                  💧 Mức Độ Mặn Mô Phỏng
                </label>
                <span className="font-extrabold text-lg tabular-nums" style={{ color: salinityColor }}>
                  {salinityLevel.toFixed(1)} <span className="text-xs font-semibold text-gray-400">‰</span>
                </span>
              </div>
              <input
                id="sim-salinity-slider"
                type="range" min={0} max={10} step={0.1}
                value={salinityLevel}
                onChange={(e) => setSalinityLevel(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full"
                style={{ background: sliderBg, minHeight: '44px', padding: '18px 0', cursor: 'pointer' }}
              />
              <div className="flex justify-between text-xs text-gray-400 font-medium">
                <span>0 ‰ <span style={{ color: '#6FCF97' }}>● An Toàn</span></span>
                <span>5 ‰</span>
                <span style={{ color: '#EB5757' }}>Nguy Hiểm ●</span>
                <span>10 ‰</span>
              </div>

              {/* Weather */}
              <div className="space-y-2 pt-1">
                <label className="text-sm font-semibold" style={{ color: '#1F6F5F' }} htmlFor="sim-weather-select">
                  🌤️ Điều Kiện Thời Tiết
                </label>
                <div className="relative">
                  <select
                    id="sim-weather-select"
                    value={weatherCondition}
                    onChange={(e) => setWeatherCondition(e.target.value)}
                    className="w-full appearance-none rounded-xl px-4 pr-10 font-semibold text-sm outline-none cursor-pointer"
                    style={{ height: '50px', background: '#F7F9F9', border: '1.5px solid #1F6F5F30', color: '#1F6F5F', fontSize: '15px' }}
                  >
                    {weatherOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt === 'Sunny' ? '☀️ Nắng' : opt === 'Heavy Rain' ? '🌧️ Mưa To' : '🏜️ Hạn Hán'}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" style={{ color: '#2FA084' }}>
                    <WeatherIcon condition={weatherCondition} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {weatherOptions.map((opt) => (
                    <button key={opt} onClick={() => setWeatherCondition(opt)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={weatherCondition === opt ? { background: '#2FA084', color: 'white' } : { background: '#f0f0f0', color: '#666' }}>
                      {opt === 'Sunny' ? '☀️ Nắng' : opt === 'Heavy Rain' ? '🌧️ Mưa To' : '🏜️ Hạn Hán'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Gauge + button */}
            <div className="flex flex-col items-center gap-4">
              <SalinityGauge value={salinityLevel} />

              <button
                id="sim-trigger-btn"
                onClick={handleTrigger}
                disabled={isSimLoading || isRunning}
                className="w-full rounded-xl font-bold text-white text-sm transition-all duration-300 flex items-center justify-center gap-2 active:scale-95"
                style={{
                  minHeight: '50px',
                  background: isSimLoading || isRunning
                    ? 'linear-gradient(135deg, #94a3b8, #64748b)'
                    : 'linear-gradient(135deg, #2FA084 0%, #1F6F5F 100%)',
                  boxShadow: isSimLoading || isRunning ? 'none' : '0 6px 20px rgba(47,160,132,0.4)',
                  cursor: isSimLoading || isRunning ? 'not-allowed' : 'pointer',
                }}
              >
                {isSimLoading || isRunning ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8l4 4-4 4M8 12h8"/>
                    </svg>
                    <span>Kích Hoạt SalinAI Agent</span>
                  </>
                )}
              </button>

              {/* Sim result badge */}
              {simResult && (
                <div className="log-entry w-full rounded-xl px-3 py-2.5 text-center"
                  style={{
                    background: simResult.valveOpen ? '#6FCF9715' : '#1F6F5F15',
                    border: `1.5px solid ${simResult.valveOpen ? '#6FCF9740' : '#1F6F5F40'}`,
                  }}>
                  <p className="text-xs font-bold" style={{ color: simResult.valveOpen ? '#2FA084' : '#1F6F5F' }}>
                    {simResult.valveOpen ? '✅ Kết quả: MỞ VAN' : '🚫 Kết quả: ĐÓNG VAN'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {simResult.salinityLevel.toFixed(1)}‰ · {translateWeather(simResult.weatherCondition)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── AI Logic Terminal ──────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden shadow-xl" style={{ border: '1px solid #1F6F5F30' }}>
          {/* Title bar */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ background: '#0f1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
              <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-80" />
              <div className="w-3 h-3 rounded-full bg-green-400 opacity-80" />
              <span className="ml-3 text-xs font-mono hidden sm:block" style={{ color: 'rgba(255,255,255,0.4)' }}>
                salinai@agent ~ /nhat-ky-suy-luan
              </span>
            </div>
            <div className="flex items-center gap-3">
              {isRunning && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#2FA084' }} />
                  <span style={{ color: '#2FA084', fontSize: '11px', fontFamily: 'monospace' }}>ĐANG XỬ LÝ</span>
                </div>
              )}
              {!isRunning && hasLogs && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#6FCF97' }} />
                  <span style={{ color: '#6FCF97', fontSize: '11px', fontFamily: 'monospace' }}>XONG — Lần #{runCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Terminal body */}
          <div ref={logContainerRef} className="overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4"
            style={{ background: '#111827', minHeight: '420px', maxHeight: '65vh' }}>
            <div className="flex items-center gap-2 font-mono text-xs sm:text-sm mb-2">
              <span style={{ color: '#2FA084' }}>salinai</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>@</span>
              <span style={{ color: '#60a5fa' }}>agent</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>:~$</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                {hasLogs ? `chay_agent --thoi-diem ${timestamp}` : 'dang cho lenh...'}
              </span>
            </div>

            {!hasLogs ? (
              <EmptyTerminal />
            ) : (
              <>
                {logs.map((log) => (
                  <LogSection key={log.id} type={log.id} content={log.content}
                    visible={!!visibleSections[log.id]}
                    isTyping={!!log.isTyping}
                    typingText={log.isTyping ? log.content : ''} />
                ))}
                {!isRunning && hasLogs && (
                  <div className="log-entry flex items-center gap-2 font-mono text-xs pt-2">
                    <span style={{ color: '#6FCF97' }}>✓</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Agent hoàn thành · Mã thoát: 0</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 flex items-center justify-between"
            style={{ background: '#0f1117', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontFamily: 'monospace' }}>
              SalinAI v2.1 · Node: LLM-GEMINI-FLASH
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontFamily: 'monospace' }}>
              {runCount > 0 ? `${runCount} lần chạy` : 'chờ'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
