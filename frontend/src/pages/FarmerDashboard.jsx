import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts';
import { MapContainer, TileLayer, Polygon, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { useRealtimeFarmState } from '../hooks/useRealtimeFarmState';

// Fix leaflet default icon
const DefaultIcon = L.icon({
  iconUrl: iconUrl,
  shadowUrl: shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons for valves
const createCustomIcon = (isOpen, isActive) => {
  return L.divIcon({
    className: 'custom-valve-icon',
    html: `<div style="
      background-color: ${isOpen ? '#2FA084' : '#1F6F5F'}; 
      border: ${isActive ? '3px solid #F2C94C' : '2px solid white'}; 
      width: 20px; 
      height: 20px; 
      border-radius: 50%; 
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
    "></div>`,
    iconAnchor: [10, 10],
  });
};

const INITIAL_VALVES = [
  { id: 'VAN_CHINH_01', name: 'Van Chính Đầu Nguồn', lat: 10.7618, lng: 106.660, open: true },
  { id: 'VAN_PHU_02', name: 'Van Cạnh Tây', lat: 10.7630, lng: 106.6585, open: false },
  { id: 'VAN_PHU_03', name: 'Van Phía Đông', lat: 10.7615, lng: 106.6620, open: false },
];

const FIELD_BOUNDARY = [
  [10.761, 106.657],
  [10.764, 106.657],
  [10.764, 106.663],
  [10.761, 106.663],
];

// ─── Mock data generator ───────────────────────────────────────────────────────

const generateHistoryData = (currentSalinity) => {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const t = new Date(now.getTime() - (23 - i) * 30 * 60 * 1000);
    const hour = t.getHours().toString().padStart(2, '0');
    const min = t.getMinutes().toString().padStart(2, '0');
    const base = currentSalinity;
    const noise = (Math.random() - 0.5) * 1.5;
    const wave = Math.sin((i / 24) * Math.PI * 2) * 1.2;
    return {
      time: `${hour}:${min}`,
      salinity: Math.max(0, Math.min(10, parseFloat((base + wave + noise).toFixed(2)))),
    };
  });
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, unit, color, bg }) => (
  <div className="bg-white rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-sm border" style={{ borderColor: '#1F6F5F15' }}>
    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
      <span className="text-xl">{icon}</span>
    </div>
    <div className="min-w-0">
      <p className="text-xs text-gray-400 font-medium truncate">{label}</p>
      <p className="font-extrabold text-xl tabular-nums leading-tight" style={{ color }}>
        {value}<span className="text-sm font-semibold ml-1 text-gray-400">{unit}</span>
      </p>
    </div>
  </div>
);

// ─── Custom chart tooltip ──────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const color = val <= 4 ? '#6FCF97' : val <= 6 ? '#F2C94C' : '#EB5757';
  return (
    <div className="bg-white rounded-xl shadow-lg px-3 py-2 border" style={{ borderColor: '#1F6F5F20' }}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="font-extrabold text-sm" style={{ color }}>{val} ‰</p>
    </div>
  );
};

// ─── Main FarmerDashboard ──────────────────────────────────────────────────────

export default function FarmerDashboard() {
  const { sensorData, actuator, aiStatus, actionLogs, sensorHistory, setControlMode: setRemoteControlMode } = useRealtimeFarmState();
  const [valves, setValves] = useState(INITIAL_VALVES);
  const [controlScope, setControlScope] = useState('all'); // 'all' | 'single'
  const [activeValveId, setActiveValveId] = useState(INITIAL_VALVES[0].id);

  const [isToggling, setIsToggling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [notification, setNotification] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [uiControlMode, setUiControlMode] = useState('manual');
  const [isModeUpdating, setIsModeUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Derived logical states based on Scope
  const valveOpen = controlScope === 'all'
    ? valves.every(v => v.open)
    : valves.find(v => v.id === activeValveId)?.open || false;

  const currentFlowRate = controlScope === 'all'
    ? (valves.filter(v => v.open).length * 12.5).toFixed(1)
    : (valveOpen ? '12.5' : '0.0');

  const activeValveDisplay = controlScope === 'all' ? 'TẤT CẢ VAN' : activeValveId;

  // Mock live sensor readings
  const [readings] = useState({
    salinity: 3.2,
    temperature: 31.5,
    humidity: 68,
    soilMoisture: 62,
    ph: 6.8,
    weather: 'Nắng',
  });

  useEffect(() => {
    setHistoryData(generateHistoryData(readings.salinity));
  }, []);

  useEffect(() => {
    const mode = (actuator.control_mode || 'AUTO').toLowerCase();
    setUiControlMode(mode);
  }, [actuator.control_mode]);

  // Auto-refresh timestamp every minute
  useEffect(() => {
    const interval = setInterval(() => setLastUpdated(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleControlModeChange = async (nextMode) => {
    setUiControlMode(nextMode);
    setIsModeUpdating(true);
    try {
      await setRemoteControlMode(nextMode.toUpperCase());
      setNotification({
        type: 'success',
        text: nextMode === 'manual' ? '🛠️ Đã chuyển sang chế độ MANUAL.' : '🤖 Đã chuyển sang chế độ AUTO.',
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      setNotification({
        type: 'warning',
        text: `❌ Không thể cập nhật control mode: ${error.message}`,
      });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsModeUpdating(false);
    }
  };

  const executeValveToggle = () => {
    setIsToggling(true);
    const action = confirmAction;
    setConfirmAction(null);
    setTimeout(() => {
      const isOpening = action === 'open';
      setValves(prev => prev.map(v =>
        (controlScope === 'all' || v.id === activeValveId)
          ? { ...v, open: isOpening }
          : v
      ));

      setIsToggling(false);
      setLastUpdated(new Date());

      const msg = controlScope === 'all'
        ? (isOpening ? '✅ Tất cả van đã được mở.' : '🔒 Tất cả van đã được đóng.')
        : (isOpening ? `✅ Van ${activeValveId} đã được mở.` : `🔒 Van ${activeValveId} đã được đóng.`);

      setNotification({
        type: isOpening ? 'success' : 'warning',
        text: msg,
      });
      setTimeout(() => setNotification(null), 4000);
    }, 1000);
  };

  const realtimeSalinity = Number(sensorData.salinity || 0);
  const realtimeMoisture = Number(sensorData.moisture || 0);
  const realtimeValveOpen = (actuator.valve_state || 'CLOSED') === 'OPEN';
  const salinityColor = realtimeSalinity <= 4 ? '#6FCF97' : realtimeSalinity <= 6 ? '#F2C94C' : '#EB5757';
  const trendData = sensorHistory.map((item) => ({
    time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--',
    salinity: Number(item.salinity || 0),
    moisture: Number(item.moisture || 0),
  }));

  const formatTime = (d) =>
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="min-h-[calc(100vh-64px)] py-6 px-4 sm:px-6 lg:px-8" style={{ background: '#EEEEEE' }}>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold leading-tight mt-1" style={{ color: '#1F6F5F' }}>
              Thửa ruộng A-01
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border self-start sm:self-auto"
            style={{ borderColor: '#1F6F5F20' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#6FCF97' }} />
            <span className="text-xs text-gray-500 font-medium">Cập nhật: {formatTime(lastUpdated)}</span>
          </div>
        </div>

        {/* ── Notification ──────────────────────────────────────────── */}
        {notification && (
          <div
            className="log-entry rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm"
            style={{
              background: notification.type === 'success' ? '#6FCF9715' : '#F2C94C15',
              border: `1.5px solid ${notification.type === 'success' ? '#6FCF9740' : '#F2C94C40'}`,
            }}
          >
            <p className="text-sm font-semibold" style={{ color: notification.type === 'success' ? '#1F6F5F' : '#B45309' }}>
              {notification.text}
            </p>
          </div>
        )}

        {/* ── Realtime Agent Monitor (Phase 1) ────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-lg" style={{ color: '#1F6F5F' }}>Theo Dõi Agent Realtime</h2>
              <p className="text-xs text-gray-500 mt-0.5">Firebase sensor_data · actuator · ai_status · action_logs</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#1F6F5F10', color: '#1F6F5F' }}>
                Mode: {actuator.control_mode || 'AUTO'}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: aiStatus.is_processing ? '#F2C94C20' : '#6FCF9720', color: aiStatus.is_processing ? '#B45309' : '#1F6F5F' }}>
                {aiStatus.is_processing ? 'AI is thinking...' : 'AI idle'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard icon="💧" label="Độ Mặn (Firebase)" value={realtimeSalinity.toFixed(1)} unit="‰" color={salinityColor} bg={`${salinityColor}20`} />
            <StatCard icon="🌱" label="Độ Ẩm (Firebase)" value={realtimeMoisture.toFixed(0)} unit="%" color="#2FA084" bg="#2FA08420" />
            <StatCard icon="🚰" label="Trạng Thái Van" value={realtimeValveOpen ? 'MỞ' : 'ĐÓNG'} unit="" color={realtimeValveOpen ? '#2FA084' : '#1F6F5F'} bg={realtimeValveOpen ? '#2FA08420' : '#1F6F5F20'} />
            <StatCard icon="🤖" label="Control Mode" value={(actuator.control_mode || 'AUTO').toUpperCase()} unit="" color="#1F6F5F" bg="#1F6F5F20" />
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button
              disabled={isModeUpdating}
              onClick={() => handleControlModeChange('auto')}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={uiControlMode === 'auto' ? { background: '#2FA084', color: 'white' } : { background: '#f3f4f6', color: '#4b5563' }}
            >
              Chuyển AUTO
            </button>
            <button
              disabled={isModeUpdating}
              onClick={() => handleControlModeChange('manual')}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={uiControlMode === 'manual' ? { background: '#1F6F5F', color: 'white' } : { background: '#f3f4f6', color: '#4b5563' }}
            >
              Chuyển MANUAL
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border p-3" style={{ borderColor: '#1F6F5F20' }}>
              <p className="text-xs text-gray-400 mb-2">Biểu đồ realtime (sensor_data)</p>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="salinity" stroke="#2FA084" strokeWidth={2.2} dot={false} />
                    <Line type="monotone" dataKey="moisture" stroke="#1F6F5F" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border p-3" style={{ borderColor: '#1F6F5F20' }}>
              <p className="text-xs text-gray-400 mb-2">Action Logs (mới nhất)</p>
              <div className="space-y-2 max-h-[180px] overflow-auto pr-1">
                {actionLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="rounded-lg px-3 py-2" style={{ background: '#f8faf9' }}>
                    <p className="text-xs font-semibold" style={{ color: '#1F6F5F' }}>
                      {log.action || 'NO_ACTION'} · {log.actor || 'AI'}
                    </p>
                    <p className="text-xs text-gray-500">{log.reason || 'No reason provided'}</p>
                  </div>
                ))}
                {!actionLogs.length && (
                  <p className="text-xs text-gray-400">Chưa có action_logs trong Firebase.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Field Map Section ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-3">
            <div>
              <h2 className="font-bold text-lg" style={{ color: '#1F6F5F' }}>Bản Đồ Cấp Nước</h2>
              <p className="text-xs text-gray-500 mt-0.5">Giám sát vị trí các van trên thửa ruộng</p>
            </div>

            <div className="flex bg-gray-100 p-1.5 rounded-xl">
              <button
                onClick={() => setControlScope('all')}
                className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg transition-all ${controlScope === 'all' ? 'bg-white shadow border border-gray-200/50 text-[#1F6F5F]' : 'text-gray-500 hover:bg-gray-200/50'
                  }`}
              >
                Điều Khiển Tất Cả Van
              </button>
              <button
                onClick={() => setControlScope('single')}
                className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg transition-all ${controlScope === 'single' ? 'bg-white shadow border border-gray-200/50 text-[#1F6F5F]' : 'text-gray-500 hover:bg-gray-200/50'
                  }`}
              >
                Điều Khiển Từng Van
              </button>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-gray-200 relative z-0" style={{ height: '360px' }}>
            <MapContainer center={[10.7625, 106.660]} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              <Polygon positions={FIELD_BOUNDARY} pathOptions={{ color: '#2FA084', fillColor: '#2FA084', fillOpacity: 0.15, weight: 2 }} />

              {valves.map(v => (
                <Marker
                  key={v.id}
                  position={[v.lat, v.lng]}
                  icon={createCustomIcon(v.open, controlScope === 'single' && activeValveId === v.id)}
                  eventHandlers={{
                    click: () => {
                      setControlScope('single');
                      setActiveValveId(v.id);
                    }
                  }}
                >
                  <Popup>
                    <div className="text-center">
                      <strong style={{ color: '#1F6F5F' }}>{v.id}</strong><br />
                      <span className="text-xs text-gray-600">{v.name}</span><br />
                      <span className={`text-xs font-bold mt-1 inline-block ${v.open ? 'text-[#2FA084]' : 'text-gray-500'}`}>
                        {v.open ? 'TRẠNG THÁI: ĐANG MỞ' : 'TRẠNG THÁI: ĐANG ĐÓNG'}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* ── Valve Control Section ─────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: '1px solid #EEEEEE' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: '#6FCF9715' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6FCF97" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>TRẠNG THÁI VAN TƯỚI</h2>
            </div>
            <div className="ml-auto">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all"
                style={{ background: '#1F6F5F10', color: '#1F6F5F' }}>
                {activeValveDisplay}
              </span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6 items-center">
            {/* 1. Visual status & action button combined */}
            <button
              onClick={() => setConfirmAction(valveOpen ? 'close' : 'open')}
              disabled={uiControlMode === 'auto' || isToggling}
              className={`shrink-0 w-44 h-44 flex flex-col items-center justify-center rounded-2xl p-4 gap-2.5 transition-all duration-700 relative overflow-hidden ${uiControlMode === 'auto' || isToggling ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:opacity-90 active:scale-95'
                }`}
              style={{
                background: isToggling
                  ? 'linear-gradient(135deg, #94a3b8, #64748b)'
                  : valveOpen
                    ? 'linear-gradient(135deg, #6FCF97 0%, #2FA084 100%)'
                    : 'linear-gradient(135deg, #EB5757 0%, #c12a2a 100%)',
                border: 'none',
                boxShadow: (uiControlMode === 'auto' || isToggling) 
                  ? 'none' 
                  : valveOpen
                    ? '0 8px 25px rgba(47,160,132,0.35)'
                    : '0 8px 25px rgba(235,87,87,0.35)',
              }}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center ${!isToggling && valveOpen ? 'pulse-safe' : !isToggling ? 'pulse-danger' : ''
                  }`}
                style={{ background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.4)' }}
              >
                {isToggling ? (
                  <svg className="animate-spin w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                ) : (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {valveOpen ? (
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
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
              <div className="text-center relative z-10 w-full">
                <p className="text-white font-extrabold text-lg leading-none wrap-break-word">
                  {controlScope === 'all' ? 'TẤT CẢ ' : 'VAN '}
                  {isToggling ? '...' : valveOpen ? 'ĐÃ MỞ' : 'ĐÃ ĐÓNG'}
                </p>
                <p className="text-white/80 text-xs mt-1.5 flex items-center justify-center gap-1 font-medium">
                  {isToggling ? 'Đang xử lý...' : uiControlMode === 'auto' ? (
                    <>Không thể mở/đóng</>
                  ) : valveOpen ? (
                    <>Nhấn để đóng</>
                  ) : (
                    <>Nhấn để mở</>
                  )}
                </p>
              </div>
            </button>

            {/* Options Panel (Right Side) */}
            <div className="flex-1 w-full space-y-4">

              {/* 2. Mode Selection Button */}
              <div className="space-y-2">
                <label className="text-sm font-semibold" style={{ color: '#1F6F5F' }}>CHẾ ĐỘ ĐIỀU KHIỂN</label>
                <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                  <button
                    onClick={() => handleControlModeChange('auto')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${uiControlMode === 'auto' ? 'bg-white shadow border border-gray-200/50 text-[#2FA084]' : 'text-gray-500 hover:bg-gray-200/50 hover:text-gray-700'
                      }`}
                  >
                    Tự Động (AI)
                  </button>
                  <button
                    onClick={() => handleControlModeChange('manual')}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${uiControlMode === 'manual' ? 'bg-white shadow border border-gray-200/50 text-[#1F6F5F]' : 'text-gray-500 hover:bg-gray-200/50 hover:text-gray-700'
                      }`}
                  >
                    Thủ Công
                  </button>
                </div>
              </div>

              {/* 3. Flow Rate Field */}
              <div className="space-y-2">
                <label className="text-sm font-semibold" style={{ color: '#1F6F5F' }}>LƯU LƯỢNG NƯỚC HIỆN TẠI</label>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-3 h-3 rounded-full ${valveOpen ? 'bg-[#2FA084] animate-pulse shadow-[0_0_8px_rgba(47,160,132,0.6)]' : 'bg-gray-400'}`}></span>
                    <span className="text-sm font-bold" style={{ color: valveOpen ? '#2FA084' : '#6b7280' }}>
                      {valveOpen ? 'Đang cấp nước' : 'Đã ngắt'}
                    </span>
                  </div>
                  <div className="font-extrabold text-[#1F6F5F] text-xl">
                    {currentFlowRate} <span className="text-sm font-semibold text-gray-500">L/phút</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Confirmation Modal ─────────────────────────── */}
        {confirmAction && createPortal(
          <div className="fixed inset-0 z-99999 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="p-6">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: confirmAction === 'open' ? '#2FA08420' : '#F2C94C20' }}>
                  <span className="text-xl font-bold" style={{ color: confirmAction === 'open' ? '#2FA084' : '#F2C94C' }}>
                    {confirmAction === 'open' ? '💧' : '🛑'}
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-gray-900 mb-1">Xác nhận thao tác</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-1">
                  Bạn có chắc chắn muốn <strong style={{ color: confirmAction === 'open' ? '#2FA084' : '#1F6F5F' }}>{confirmAction === 'open' ? 'MỞ' : 'ĐÓNG'}</strong>
                  {controlScope === 'all' ? ' TẤT CẢ van tưới' : ' van tưới '}
                  <span className="font-mono bg-gray-100 px-1 rounded text-gray-800">{activeValveDisplay}</span> không?
                </p>
              </div>
              <div className="flex border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-4 text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors border-r border-gray-100"
                >
                  Hủy Bỏ
                </button>
                <button
                  onClick={executeValveToggle}
                  className="flex-1 py-4 text-sm font-bold text-white transition-colors"
                  style={{ background: confirmAction === 'open' ? '#2FA084' : '#1F6F5F' }}
                >
                  Đồng Ý
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* ── Sensor Stats Grid ─────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
            Số Liệu Cảm Biến Hiện Tại
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <StatCard icon="💧" label="Độ Mặn" value={readings.salinity.toFixed(1)} unit="‰" color={salinityColor} bg={`${salinityColor}20`} />
            <StatCard icon="🌡️" label="Nhiệt Độ" value={readings.temperature.toFixed(1)} unit="°C" color="#F2994A" bg="#F2994A20" />
            <StatCard icon="💦" label="Độ Ẩm KK" value={readings.humidity} unit="%" color="#2FA084" bg="#2FA08420" />
            <StatCard icon="🌱" label="Độ Ẩm Đất" value={readings.soilMoisture} unit="%" color="#6FCF97" bg="#6FCF9720" />
            <StatCard icon="⚗️" label="Độ pH" value={readings.ph.toFixed(1)} unit="pH" color="#9B59B6" bg="#9B59B620" />
            <StatCard icon="🌤️" label="Thời Tiết" value={readings.weather} unit="" color="#1F6F5F" bg="#1F6F5F20" />
          </div>
        </div>

        {/* ── Salinity Trend Chart ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>LỊCH SỬ ĐỘ MẶN (12 giờ qua)</h2>
              <p className="text-xs text-gray-400">Cập nhật mỗi 30 phút — đơn vị: ‰ PSU</p>
            </div>
            <div className="flex gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#6FCF97' }} />An toàn</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#EB5757' }} />Nguy hiểm</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: '400px', height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salinGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2FA084" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2FA084" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={3} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={4} stroke="#6FCF97" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Giới hạn an toàn', position: 'right', fontSize: 9, fill: '#6FCF97' }} />
                  <ReferenceLine y={6} stroke="#EB5757" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Ngưỡng nguy hiểm', position: 'right', fontSize: 9, fill: '#EB5757' }} />
                  <Area type="monotone" dataKey="salinity" stroke="#2FA084" strokeWidth={2.5} fill="url(#salinGrad)" dot={false} activeDot={{ r: 5, fill: '#2FA084' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Field Health Overview ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <h2 className="font-bold text-base mb-4" style={{ color: '#1F6F5F' }}>ĐÁNH GIÁ TÌNH TRẠNG ĐỒNG RUỘNG</h2>
          <div className="space-y-3">
            {[
              { label: 'Chất lượng nước', value: 78, color: '#6FCF97', status: 'Tốt' },
              { label: 'Độ pH đất', value: 85, color: '#2FA084', status: 'Lý tưởng' },
              { label: 'Độ ẩm đất', value: 62, color: '#F2C94C', status: 'Trung bình' },
              { label: 'Rủi ro ngập mặn', value: 32, color: '#EB5757', status: 'Thấp' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium" style={{ color: '#374151' }}>{item.label}</span>
                  <span className="font-bold text-xs px-2 py-0.5 rounded-full" style={{ background: `${item.color}20`, color: item.color }}>
                    {item.status} — {item.value}%
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: '#f0f0f0' }}>
                  <div
                    className="h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${item.value}%`, background: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
