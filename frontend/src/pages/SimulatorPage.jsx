import { useState, useEffect } from 'react';
import { useRealtimeFarmState } from '../hooks/useRealtimeFarmState';
import { API_BASE_URL } from '../lib/apiClient';
import StreamingText from '../components/StreamingText';
import { initSocket } from '../services/socket';
import CropStageIllustration from '../components/visuals/CropStageIllustration';
import WeatherAmbience from '../components/visuals/WeatherAmbience';

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
        <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
    'Heavy Rain': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="16" y1="13" x2="16" y2="21" /><line x1="8" y1="13" x2="8" y2="21" />
        <line x1="12" y1="15" x2="12" y2="23" />
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      </svg>
    ),
    Drought: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v1M12 21v1M4.22 4.22l.707.707M18.362 18.362l.707.707M2 12h1M21 12h1M4.22 19.78l.707-.707M18.362 5.638l.707-.707" />
        <path d="M12 6 C12 6 7 12 7 15 C7 17.76 9.24 20 12 20 C14.76 20 17 17.76 17 15 C17 12 12 6 12 6Z" fill="currentColor" opacity="0.15" stroke="currentColor" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="#EB5757" strokeWidth="2" />
      </svg>
    ),
  };
  return icons[condition] || icons.Sunny;
};

const ValveStatusCard = ({ valveOpen, isLoading }) => {
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
        className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center mb-4 transition-all duration-700 ${isLoading ? '' : valveOpen ? 'pulse-safe' : 'pulse-danger'
          }`}
        style={{ background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.4)' }}
      >
        {isLoading ? (
          <svg className="animate-spin w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : (
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {valveOpen ? (
              <>
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 8v4l3 3" stroke="white" strokeWidth="2.5" />
                <circle cx="12" cy="12" r="3" fill="white" opacity="0.3" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
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
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main SimulatorPage ────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const { actuator, aiStatus, actionLogs, sensorData } = useRealtimeFarmState();
  const [_decisionDetails, setDecisionDetails] = useState(null);
  const [typingPhase, setTypingPhase] = useState(0);

  useEffect(() => {
    initSocket();
  }, []);

  // Reset typing phase when a new log appears
  const latestActionId = actionLogs.length > 0 ? actionLogs[0].id : null;
  useEffect(() => {
    if (actionLogs.length > 0) {
      // Defer to avoid synchronous state update inside effect
      setTimeout(() => setTypingPhase(0), 0);
    }
  }, [latestActionId]);

  // Fetch decision details for display
  useEffect(() => {
    const fetchDecisionDetails = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/decision-details`);
        if (!res.ok) return;
        const json = await res.json();
        setDecisionDetails(json.data);
      } catch (err) {
        console.error('Failed to fetch decision details:', err);
      }
    };

    fetchDecisionDetails();
    const interval = setInterval(fetchDecisionDetails, 5000); // Poll decision details every 5s for dashboard
    return () => clearInterval(interval);
  }, [actionLogs]);

  // Live sensor readings from Firebase (pushed by ESP32)
  const liveSalinity = Number(sensorData.salinity ?? sensorData.river_salinity ?? 0);
  const liveMoisture = Number(sensorData.soil_moisture ?? sensorData.moisture ?? 0);
  const liveWaterFlow = Number(sensorData.water_flow ?? 0);
  const liveTemp = sensorData.temperature ?? sensorData.external_forecast?.temperature ?? null;
  const liveHumidity = sensorData.humidity ?? sensorData.external_forecast?.humidity ?? null;
  const liveRain24h = sensorData.rainfall_24h ?? sensorData.external_forecast?.rainfall_24h ?? null;
  const liveTide = sensorData.tide_status ?? sensorData.external_forecast?.tide_status ?? null;
  const liveCropStage = sensorData.crop_stage ?? 'VEGETATIVE';

  const valveOpen = actuator.valve_state === 'OPEN';
  const isProcessing = aiStatus.is_processing;

  const lastLog = actionLogs && actionLogs.length > 0 ? actionLogs[0] : null;
  const showNotification = !!lastLog && !isProcessing;

  const salinityColor = liveSalinity <= 3 ? '#6FCF97' : liveSalinity <= 6 ? '#F2C94C' : '#EB5757';

  const retrievalOutput =
    lastLog?.model_insights?.retrieval_output_preview ||
    ((lastLog?.retrieval?.source_ids?.length || 0) > 0
      ? `Không có bản trích văn bản đầy đủ trong log cũ. Nguồn đã dùng: ${lastLog.retrieval.source_ids.join(', ')}`
      : 'Không có dữ liệu retrieval từ papers.');

  const feedbackLoop = aiStatus?.feedback_loop || {};
  const feedbackDelayHours = Number(feedbackLoop.min_action_age_hours ?? 1);
  const normalizeFeedbackStatus = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'PENDING_24H' || normalized === 'AWAITING_24H_OUTCOME') return 'PENDING_OUTCOME';
    return normalized || 'IDLE';
  };
  const feedbackLoopStatus = normalizeFeedbackStatus(feedbackLoop.status || (isProcessing ? 'PROCESSING' : 'IDLE'));
  const isPendingFeedback = feedbackLoopStatus === 'PENDING_OUTCOME';
  const hasFeedbackLoop = isPendingFeedback || feedbackLoopStatus === 'EVALUATED' || Boolean(feedbackLoop.action_at);
  const feedbackLoopStateLabel = hasFeedbackLoop ? 'ĐANG HOẠT ĐỘNG' : 'CHƯA CÓ';
  const feedbackLoopLabel = isPendingFeedback
    ? `Đang chờ outcome ${feedbackDelayHours}h`
    : feedbackLoopStatus === 'EVALUATED'
      ? 'Feedback loop đã khép kín'
      : feedbackLoopStatus === 'PROCESSING'
        ? 'AI đang xử lý'
        : 'Chưa có vòng phản hồi';

  const getDecisionOrigin = (log = {}) => {
    const actor = String(log?.actor || '').toUpperCase();
    if (actor.includes('AI') || actor.includes('ORCHESTRATOR')) {
      return { label: 'AI-GENERATED', bg: '#23863633', color: '#3fb950' };
    }
    return { label: 'RULE-BASED', bg: '#1f6feb33', color: '#79c0ff' };
  };

  const researcherAgentName = 'SaoLa4-small';
  const orchestratorAgentName = 'GLM-4.7';

  // Helper: format nullable number
  const fmt = (v, digits = 1, suffix = '') =>
    v != null ? `${Number(v).toFixed(digits)}${suffix}` : '--';

  const shortText = (text, max = 180) => {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '--';
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  };

  const salinityLabel = (value) => {
    if (!Number.isFinite(value)) return 'Chưa có dữ liệu';
    if (value > 2.0) return 'Mặn - Nguy hiểm';
    if (value > 1.0) return 'Mặn nhẹ - Cần theo dõi';
    return 'An toàn';
  };

  const moistureLabel = (value) => {
    if (!Number.isFinite(value)) return 'Chưa có dữ liệu';
    if (value < 40) return 'Hơi khô';
    if (value > 75) return 'Quá ẩm';
    return 'Ổn định';
  };

  const isStepActive = (trace = [], phase) => Array.isArray(trace) && trace.some((t) => t?.phase === phase);

  // Removed unused trace formatting helpers to satisfy lint

  const buildReasoningSummary = (log = {}) => {
    const action = String(log?.action || 'NO_ACTION').toUpperCase();
    const reason = shortText(log?.reason || 'Không có lý do cụ thể', 120);
    return `Tóm tắt: ${reason} | Kết quả: ${action}`;
  };

  const formatVnTime = (value) => {
    if (!value) return '--:--';
    return new Date(value).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  };

  const formatVnDateTime = (value) => {
    if (!value) return '--:--:--';
    return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  };

  return (
    <div className="min-h-[calc(100vh-64px)] py-6 px-4 sm:px-6 lg:px-8 relative" style={{ background: '#EEEEEE' }}>
      {/* Epic 5: Dynamic Weather Background */}
      <WeatherAmbience weatherCode={sensorData.weather_code || 0} />

      <div className="max-w-5xl mx-auto relative z-10">

        {/* Page Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
              style={{ background: '#2FA08420', color: '#2FA084' }}>
              Chế Độ Tự Động
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
              style={{
                background: isProcessing ? '#F2C94C20' : '#6FCF9720',
                color: isProcessing ? '#B45309' : '#1F6F5F',
              }}>
              {isProcessing ? '⚙️ AI đang phân tích...' : `📡 Đang chờ tín hiệu Push`}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold leading-tight" style={{ color: '#1F6F5F' }}>
            Hậu Trường Hệ Thống AI
          </h1>
        </div>

        {/* ── 2-col: Live Sensors + Valve & Agent Status ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 mb-5">

          {/* ── LEFT: Live Wokwi Sensor Readings ─────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6 flex flex-col gap-4"
            style={{ borderColor: '#1F6F5F20' }}>

            <div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid #EEEEEE' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: '#2FA08415' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2FA084" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>Cảm Biến IoT (Thực Tế)</h2>
              </div>
            </div>

            {/* Salinity with gauge */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: '#1F6F5F' }}>Độ Mặn</span>
                <span className="text-2xl font-extrabold tabular-nums" style={{ color: salinityColor }}>
                  {fmt(liveSalinity, 1)} <span className="text-sm font-semibold text-gray-400">‰</span>
                </span>
              </div>
              <div className="flex justify-center py-2">
                <SalinityGauge value={liveSalinity} />
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                <div className="h-2 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min((liveSalinity / 10) * 100, 100)}%`, background: salinityColor }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 font-medium">
                <span style={{ color: '#6FCF97' }}>● An Toàn 0–3 ‰</span>
                <span style={{ color: '#EB5757' }}>Nguy Hiểm &gt;6 ‰ ●</span>
              </div>
            </div>

            {/* Moisture & Water Flow */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: '#F7F9F9' }}>
                <p className="text-xs text-gray-400 mb-1">Độ Ẩm Đất</p>
                <p className="font-extrabold text-xl tabular-nums" style={{ color: '#2FA084' }}>
                  {fmt(liveMoisture, 0)}<span className="text-sm font-semibold text-gray-400 ml-1">%</span>
                </p>
                <div className="w-full h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: '#e5e7eb' }}>
                  <div className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(liveMoisture, 100)}%`, background: '#2FA084' }} />
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: '#F7F9F9' }}>
                <p className="text-xs text-gray-400 mb-1">Lưu Lượng</p>
                <p className="font-extrabold text-xl tabular-nums" style={{ color: '#56CCF2' }}>
                  {fmt(liveWaterFlow, 1)}<span className="text-sm font-semibold text-gray-400 ml-1">L/min</span>
                </p>
              </div>
            </div>

            {/* Weather from Open-Meteo */}
            <div className="rounded-xl p-3" style={{ background: '#F7F9F9' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#9ca3af' }}>
                Thời Tiết Thực (Open-Meteo)
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <span className="text-gray-500">Nhiệt Độ</span>
                <span className="font-bold text-right" style={{ color: '#F2994A' }}>{fmt(liveTemp, 1, ' °C')}</span>
                <span className="text-gray-500">Độ Ẩm KK</span>
                <span className="font-bold text-right" style={{ color: '#2D9CDB' }}>{fmt(liveHumidity, 0, ' %')}</span>
                <span className="text-gray-500">Mưa 24h</span>
                <span className="font-bold text-right" style={{ color: '#2D9CDB' }}>{fmt(liveRain24h, 1, ' mm')}</span>
                <span className="text-gray-500">Thủy Triều</span>
                <span className="font-bold text-right" style={{ color: '#1F6F5F' }}>{liveTide ?? '--'}</span>
                <span className="text-gray-500">Giai Đoạn Cây</span>
                <span className="font-bold text-right">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2FA08420', color: '#1F6F5F' }}>
                    {liveCropStage}
                  </span>
                </span>
              </div>
            </div>

            {/* Epic 5: Crop Stage Illustration */}
            <div className="mt-2">
              <CropStageIllustration stage={liveCropStage} />
            </div>
          </div>

          {/* ── RIGHT: Valve Status + Agent Controls ──────────────────── */}
          <div className="flex flex-col gap-5">

            {/* Valve Status */}
            <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
              <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: '1px solid #EEEEEE' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#6FCF9715' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6FCF97" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>Trạng Thái Van</h2>
                </div>
              </div>
              <ValveStatusCard
                valveOpen={valveOpen}
                salinityLevel={liveSalinity}
                weatherCondition={liveTide ?? 'FALLING'}
                isLoading={isProcessing}
              />
            </div>

            {/* Latest agent decision */}
            {showNotification && lastLog && (
              <div
                className="log-entry bg-white rounded-2xl shadow-sm border p-5"
                style={{
                  borderColor: valveOpen ? '#6FCF9740' : '#1F6F5F40',
                  borderLeftWidth: '4px',
                  borderLeftColor: valveOpen ? '#6FCF97' : '#1F6F5F',
                }}
              >
                <div className="flex items-start gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>
                      Quyết Định Mới Nhất Của Agent
                    </p>
                    <StreamingText 
                      text={lastLog.reason || 'Không có lý do'} 
                      enabled={true} 
                      speed={10} 
                      streamKey={isProcessing ? aiStatus.sensor_timestamp : (lastLog?.sensor_snapshot?.timestamp || null)}
                      className="text-sm font-medium leading-relaxed text-[#1F6F5F]"
                    />
                    {lastLog.timestamp && (
                      <p className="text-xs text-gray-400 mt-1">
                        {formatVnTime(lastLog.timestamp)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border p-4" style={{ borderColor: '#1F6F5F20', background: '#F8FBFA' }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#9ca3af' }}>Feedback Loop</p>
                  <p className="text-sm font-bold mt-1" style={{ color: '#1F6F5F' }}>{feedbackLoopLabel}</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: hasFeedbackLoop ? '#6FCF9720' : '#E5E7EB', color: hasFeedbackLoop ? '#1F6F5F' : '#4B5563' }}>
                  {feedbackLoopStateLabel}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {isPendingFeedback
                  ? `Action vừa được ghi nhận. Hệ thống đang chờ outcome đủ ${feedbackDelayHours} giờ để chấm reward và cập nhật policy memory.`
                  : feedbackLoopStatus === 'EVALUATED'
                    ? 'Action cũ đã được hậu kiểm và feedback đã quay trở lại policy memory.'
                    : 'Sau khi có action đầu tiên, trạng thái feedback loop sẽ hiện ở đây.'}
              </p>
            </div>
          </div>
        </div>

        {/* ─── TERMINAL LOGS SECTION ─── */}
        <div className="mt-8 bg-[#0d1117] rounded-xl overflow-hidden shadow-2xl border" style={{ borderColor: '#30363d' }}>
          <div className="flex items-center justify-between px-4 py-3 bg-[#161b22]" style={{ borderBottom: '1px solid #30363d' }}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
              <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
              <span className="ml-2 pl-2 border-l border-gray-600 text-xs font-mono text-gray-400">
                SalinAI Orchestrator Terminal
              </span>
            </div>
            <span className="text-xs font-mono" style={{ color: '#8b949e' }}>
              {actionLogs.length > 0 ? `${actionLogs.length} logs recorded` : 'awaiting telemetry...'}
            </span>
          </div>

          <div className="p-5 space-y-6 max-h-200 overflow-auto font-mono text-sm leading-relaxed" style={{ color: '#c9d1d9' }}>
            {!actionLogs.length && (
              <div className="text-gray-500 italic">
                Hệ thống đã khởi tạo. Đang chờ dữ liệu từ phần cứng...
              </div>
            )}

            {actionLogs.map((log, idx) => (
              <div key={log.id} className="pb-6 border-b border-[#21262d] last:border-0 relative">
                {/* Header: Action + Actor + Timestamp */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span style={{ color: '#58a6ff' }}>[{log.actor || 'SYSTEM_DAEMON'}]</span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: getDecisionOrigin(log).bg, color: getDecisionOrigin(log).color }}>
                      {getDecisionOrigin(log).label}
                    </span>
                    {log.action === 'OPEN' ? (
                      <span className="bg-[#238636] text-white px-2 py-0.5 rounded-md text-xs font-bold">EXECUTED: OPEN VALVE</span>
                    ) : log.action === 'CLOSED' || log.action === 'CLOSE' ? (
                      <span className="bg-[#da3633] text-white px-2 py-0.5 rounded-md text-xs font-bold">EXECUTED: {log.action} VALVE</span>
                    ) : (
                      <span className="bg-[#8b949e] text-white px-2 py-0.5 rounded-md text-xs font-bold">EXECUTED: {log.action || 'NO_ACTION'}</span>
                    )}
                  </div>
                  <span style={{ color: '#8b949e' }}>
                    {formatVnDateTime(log.timestamp)}
                  </span>
                </div>

                {/* Mini pipeline map (hardcoded fixed sequence) */}
                <div className="mb-3">
                  <span style={{ color: '#8b949e', display: 'block', marginBottom: '6px' }}>&gt; SƠ ĐỒ PIPELINE:</span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded-md" style={{ background: '#79c0ff22', color: '#79c0ff' }}>📡 Cảm biến</span>
                    <span style={{ color: '#8b949e' }}>→</span>
                    <span className="px-2 py-1 rounded-md" style={{ background: '#30363d', color: '#8b949e' }}>🔎 Researcher ({researcherAgentName})</span>
                    <span style={{ color: '#8b949e' }}>→</span>
                    <span className="px-2 py-1 rounded-md" style={{ background: '#58a6ff33', color: '#58a6ff' }}>📚 Retrieval (0 hits)</span>
                    <span style={{ color: '#8b949e' }}>→</span>
                    <span className="px-2 py-1 rounded-md" style={{ background: '#ffa65733', color: '#ffa657' }}>🧠 Orchestrator ({orchestratorAgentName})</span>
                    <span style={{ color: '#8b949e' }}>→</span>
                    <span className="px-2 py-1 rounded-md" style={{ background: valveOpen ? '#3fb95033' : '#da363333', color: valveOpen ? '#3fb950' : '#da3633' }}>🤖 Van {valveOpen ? 'OPEN' : 'CLOSED'}</span>
                  </div>
                </div>

                {/* Sensor Context */}
                {log.sensor_snapshot && (
                  <div className="bg-[#161b22] p-3 rounded-lg mb-3 border border-[#30363d]">
                    <span style={{ color: '#8b949e', display: 'block', marginBottom: '8px' }}>&gt; ENVIRONMENT_SNAPSHOT:</span>
                    <div className="overflow-x-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-3 text-xs min-w-190">
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>salinity:</span>
                          <span className="ml-2 text-[#c9d1d9]">{Number(log.sensor_snapshot.salinity ?? log.sensor_snapshot.river_salinity ?? 0).toFixed(2)} ppt ({salinityLabel(Number(log.sensor_snapshot?.salinity ?? log.sensor_snapshot?.river_salinity ?? 0))})</span>
                        </div>
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>moisture:</span>
                          <span className="ml-2 text-[#c9d1d9]">{Number(log.sensor_snapshot.soil_moisture ?? log.sensor_snapshot.moisture ?? 0).toFixed(1)} % ({moistureLabel(Number(log.sensor_snapshot?.soil_moisture ?? log.sensor_snapshot?.moisture ?? 0))})</span>
                        </div>
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>water_level:</span>
                          <span className="ml-2 text-[#c9d1d9]">{Number(log.sensor_snapshot.river_water_level ?? log.sensor_snapshot.water_level ?? 0).toFixed(2)} m</span>
                        </div>
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>temp:</span>
                          <span className="ml-2 text-[#c9d1d9]">{log.sensor_snapshot.temperature || log.sensor_snapshot.external_forecast?.temperature || '--'} °C</span>
                        </div>
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>tide:</span>
                          <span className="ml-2 text-[#c9d1d9]">{log.sensor_snapshot?.external_forecast?.tide_status || '--'}</span>
                        </div>
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>weather:</span>
                          <span className="ml-2 text-[#c9d1d9]">{log.sensor_snapshot?.external_forecast?.weather || '--'}</span>
                        </div>
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>pH:</span>
                          <span className="ml-2 text-[#c9d1d9]">{log.sensor_snapshot.ph != null ? Number(log.sensor_snapshot.ph).toFixed(1) : '--'}</span>
                        </div>
                        <div className="pr-3 whitespace-nowrap">
                          <span style={{ color: '#79c0ff' }}>crop_stage:</span>
                          <span className="ml-2 text-[#c9d1d9]">{log.sensor_snapshot.crop_stage || '--'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Commented out Agent Trace Timeline per user request
                  {Array.isArray(log.agent_trace) && log.agent_trace.length > 0 && (
                    <div className="mb-3">
                      <span style={{ color: '#58a6ff', display: 'block', marginBottom: '6px' }}>&gt; AGENT_TRACE_TIMELINE:</span>
                      <div className="pl-4 border-l-2 border-[#58a6ff] text-xs space-y-1.5">
                        <div className="text-[#8b949e] mb-2">
                          Mỗi dòng là một bước trong pipeline: phase, hành động, và kết quả ngắn.
                        </div>
                        {log.agent_trace.slice(0, 8).map((step, idx) => (
                          <div key={`${log.id}-trace-${idx}`} className="text-[#8b949e] leading-relaxed">
                            <span className="inline-flex items-center gap-2 mr-2 px-2 py-0.5 rounded-full" style={{ background: '#30363d', color: '#c9d1d9' }}>
                              <span style={{ color: '#79c0ff' }}>#{idx + 1}</span>
                              <span>{formatTracePhase(step.phase)}</span>
                            </span>
                            <span style={{ color: '#79c0ff' }}>{formatTraceEvent(step.event)}</span>
                            {' '}
                            {shortText(step.message || 'No message', 110)}
                            {step.meta?.state ? (
                              <span style={{ color: '#3fb950' }}> → {step.meta.state}</span>
                            ) : null}
                            {step.meta?.tools?.length ? (
                              <span style={{ color: '#d2a8ff' }}> | tools: {step.meta.tools.join(', ')}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  */}

                <div className="mb-3">
                  <span style={{ color: '#58a6ff', display: 'block', marginBottom: '4px' }}>&gt; RETRIEVAL_OUTPUT (trích từ papers):</span>
                  <div className="pl-4 border-l-2 border-[#58a6ff] text-xs text-[#8b949e] whitespace-pre-wrap max-h-56 overflow-auto">
                    <StreamingText 
                      text={retrievalOutput} 
                      enabled={idx === 0} 
                      speed={5} 
                      onComplete={() => setTypingPhase(1)}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <span style={{ color: '#79c0ff', display: 'block', marginBottom: '4px' }}>&gt; RESEARCHER_OUTPUT:</span>
                  <div className="pl-4 border-l-2 border-[#79c0ff] text-xs text-[#8b949e] whitespace-pre-wrap max-h-56 overflow-auto">
                    <StreamingText 
                      text={log.model_insights?.researcher_output_preview || log.subagent_summary || 'Không có phản hồi Researcher.'} 
                      enabled={idx === 0} 
                      startTrigger={idx === 0 ? typingPhase >= 1 : true}
                      onComplete={() => setTypingPhase(2)}
                      speed={7} 
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <span style={{ color: '#ffa657', display: 'block', marginBottom: '4px' }}>&gt; ORCHESTRATOR_REASONING (phân tích thô từ model):</span>
                  <div className="pl-4 border-l-2 border-[#ffa657] text-xs text-[#8b949e] whitespace-pre-wrap max-h-56 overflow-auto">
                    <StreamingText 
                      text={(() => {
                        const rawOutput = String(log.model_insights?.orchestrator_output_preview || '').trim();
                        const toolReason = String(log.model_insights?.orchestrator_tool_reason || '').trim();
                        const finalReason = String(log.reason || '').trim();
                        const resolved = rawOutput || toolReason;

                        if (!resolved) {
                          if (log.model_insights?.fallback) {
                            return 'Pipeline gặp lỗi nên đã dùng fallback action; không có phân tích thô đầy đủ từ Orchestrator.';
                          }
                          return 'Log cũ chưa lưu trường ORCHESTRATOR_OUTPUT. Hãy xem log mới để thấy phần lập luận đầy đủ.';
                        }

                        if (resolved === finalReason) {
                          return `${resolved}\n\n[NOTE] Ở lần chạy này, phần lập luận và kết luận cuối gần như trùng nhau.`;
                        }

                        return resolved;
                      })()}
                      enabled={idx === 0}
                      startTrigger={idx === 0 ? typingPhase >= 2 : true}
                      onComplete={() => setTypingPhase(3)}
                      speed={10}
                      streamMode={isProcessing && idx === 0}
                      streamKey={isProcessing && idx === 0 ? aiStatus.sensor_timestamp : (idx === 0 ? lastLog?.sensor_snapshot?.timestamp || null : null)}
                    />
                  </div>
                </div>

                {/* Final Reason */}
                <div>
                  <span style={{ color: '#3fb950', display: 'block', marginBottom: '4px' }}>&gt; ORCHESTRATOR_OUTPUT (lý do cuối cùng đã thực thi):</span>
                  <div className="pl-4 border-l-2 border-[#3fb950] text-[#e6edf3] whitespace-pre-wrap">
                    <StreamingText 
                      text={log.model_insights?.orchestrator_reasoning_summary || buildReasoningSummary(log)} 
                      enabled={idx === 0} 
                      startTrigger={idx === 0 ? typingPhase >= 3 : true}
                      onComplete={() => setTypingPhase(4)}
                      speed={10} 
                      streamMode={isProcessing && idx === 0}
                      streamKey={isProcessing && idx === 0 ? aiStatus.sensor_timestamp : (idx === 0 ? lastLog?.sensor_snapshot?.timestamp || null : null)}
                    />
                  </div>
                </div>

                {/* Final Verdict for non-tech judges */}
                <div className="mt-3">
                  <span style={{ color: '#f2cc60', display: 'block', marginBottom: '4px' }}>&gt; KẾT LUẬN CUỐI:</span>
                  <div className="pl-4 border-l-2 border-[#f2cc60] text-[#f0f6fc] text-sm whitespace-pre-wrap">
                    <StreamingText 
                      text={log.action === 'OPEN'
                        ? `Hệ thống đánh giá điều kiện hiện tại có thể tưới, nên đã mở van.`
                        : log.action === 'CLOSED' || log.action === 'CLOSE'
                          ? `Hệ thống phát hiện rủi ro cho cây trồng, nên đã đóng van để bảo vệ.`
                          : `Hệ thống đang giữ trạng thái hiện tại và tiếp tục theo dõi.`}
                      enabled={idx === 0}
                      startTrigger={idx === 0 ? typingPhase >= 4 : true}
                      speed={10}
                      streamKey={isProcessing && idx === 0 ? aiStatus.sensor_timestamp : (idx === 0 ? lastLog?.sensor_snapshot?.timestamp || null : null)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
