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
import { API_BASE_URL } from '../lib/apiClient';

import * as FarmIcons from '../components/FarmIcons';

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

// ─── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, unit, color, bg }) => (
  <div className="bg-white rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-sm border" style={{ borderColor: '#1F6F5F15' }}>
    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg, color }}>
      <span className="flex items-center justify-center" style={{ width: 24, height: 24 }}>{icon}</span>
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-gray-400 font-medium truncate">{label}</p>
      <div className="font-extrabold text-xl tabular-nums leading-tight" style={{ color }}>
        {value}{unit && <span className="text-sm font-semibold ml-1 text-gray-400">{unit}</span>}
      </div>
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
  const {
    sensorData,
    actuator,
    aiStatus,
    actionLogs,
    sensorHistory,
    setControlMode: setRemoteControlMode,
    setValveState: setRemoteValveState,
    setCropStage: setRemoteCropStage,
  } = useRealtimeFarmState();
  const [controlScope, setControlScope] = useState('all'); // 'all' | 'single'
  const [activeValveId, setActiveValveId] = useState(INITIAL_VALVES[0].id);

  const [isToggling, setIsToggling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [notification, setNotification] = useState(null);
  const [uiControlMode, setUiControlMode] = useState('manual');
  const [isModeUpdating, setIsModeUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [decisionDetails, setDecisionDetails] = useState(null);
  const [cropStageDraft, setCropStageDraft] = useState('VEGETATIVE');
  const [isCropStageUpdating, setIsCropStageUpdating] = useState(false);

  const CROP_STAGE_OPTIONS = [
    { value: 'SEEDLING', label: 'Mạ non (Seedling)' },
    { value: 'VEGETATIVE', label: 'Sinh trưởng dinh dưỡng (Vegetative)' },
    { value: 'FLOWERING', label: 'Ra hoa (Flowering)' },
    { value: 'FRUITING', label: 'Tạo hạt / kết trái (Fruiting)' },
    { value: 'HARVEST', label: 'Thu hoạch (Harvest)' },
  ];

  const cropStageLabelMap = CROP_STAGE_OPTIONS.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {});

  const getCropStageLabel = (stageValue) => {
    const normalized = String(stageValue || '').toUpperCase();
    return cropStageLabelMap[normalized] || normalized || '--';
  };

  const realtimeValveOpen = (actuator.valve_state || 'CLOSED') === 'OPEN';

  // Derived logical states based on Scope
  const valveOpen = realtimeValveOpen;
  const controlledValveCount = controlScope === 'all' ? INITIAL_VALVES.length : 1;
  // Use the real water_flow value from the Wokwi ESP32 sensor (via Firebase → SSE)
  const currentFlowRate = (Number(sensorData.water_flow ?? 0)).toFixed(1);

  const activeValveDisplay = controlScope === 'all' ? 'TẤT CẢ VAN' : activeValveId;
  const controlModeVi = (actuator.control_mode || 'AUTO').toUpperCase() === 'AUTO' ? 'TỰ ĐỘNG' : 'THỦ CÔNG';

  const readings = {
    // Salinity & moisture come from wokwi sensor readings (live)
    salinity: Number(sensorData.salinity ?? 0),
    soilMoisture: Number(sensorData.soil_moisture ?? sensorData.moisture ?? 0),
    // Weather: sensorData now has these flattened from external_forecast by the mapper
    temperature: sensorData.temperature ?? decisionDetails?.weatherMetrics?.temperature?.value ?? null,
    humidity: sensorData.humidity ?? decisionDetails?.weatherMetrics?.humidity?.value ?? null,
    rainfall24h: sensorData.rainfall_24h ?? decisionDetails?.weatherMetrics?.rainfall_24h?.value ?? null,
    tideStatus: sensorData.tide_status ?? decisionDetails?.tideInfo?.status ?? null,
    // crop_stage was moved to the actuator state since it's a user-configurable setting
    cropStage: actuator.crop_stage ?? decisionDetails?.sensorMetrics?.crop_stage?.value ?? 'VEGETATIVE',
    riverWaterLevel: sensorData.river_water_level ?? decisionDetails?.sensorMetrics?.water_level?.value ?? null,
    ph: sensorData.ph ?? null,
    weather: sensorData.weather || '--',
  };

  useEffect(() => {
    const mode = (actuator.control_mode || 'AUTO').toLowerCase();
    setUiControlMode(mode);
  }, [actuator.control_mode]);

  useEffect(() => {
    if (!sensorData.timestamp) return;
    setLastUpdated(new Date(sensorData.timestamp));
  }, [sensorData.timestamp]);

  useEffect(() => {
    const nextStage = String(sensorData.crop_stage || readings.cropStage || 'VEGETATIVE').toUpperCase();
    setCropStageDraft(nextStage);
  }, [sensorData.crop_stage, readings.cropStage]);

  useEffect(() => {
    let mounted = true;

    const fetchDecisionDetails = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/decision-details`);
        if (!res.ok) return;
        const json = await res.json();
        if (mounted && json?.data) {
          setDecisionDetails(json.data);
        }
      } catch {
        // Keep dashboard usable when the details endpoint is temporarily unavailable.
      }
    };

    fetchDecisionDetails();
    const interval = setInterval(fetchDecisionDetails, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleControlModeChange = async (nextMode) => {
    setUiControlMode(nextMode);
    setIsModeUpdating(true);
    try {
      await setRemoteControlMode(nextMode.toUpperCase());
      setNotification({
        type: 'success',
        text: nextMode === 'manual' ? '🛠️ Đã chuyển sang chế độ THỦ CÔNG.' : '🤖 Đã chuyển sang chế độ TỰ ĐỘNG.',
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      setNotification({
        type: 'warning',
        text: `❌ Không thể cập nhật chế độ điều khiển: ${error.message}`,
      });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsModeUpdating(false);
    }
  };

  const executeValveToggle = async () => {
    setIsToggling(true);
    const action = confirmAction;
    setConfirmAction(null);

    try {
      const isOpening = action === 'open';
      await setRemoteValveState(isOpening ? 'OPEN' : 'CLOSED');

      setLastUpdated(new Date());

      const msg = controlScope === 'all'
        ? (isOpening ? '✅ Tất cả van đã được mở.' : '🔒 Tất cả van đã được đóng.')
        : (isOpening ? `✅ Van ${activeValveId} đã được mở.` : `🔒 Van ${activeValveId} đã được đóng.`);

      setNotification({
        type: isOpening ? 'success' : 'warning',
        text: msg,
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      setNotification({
        type: 'warning',
        text: `❌ Không thể cập nhật trạng thái van: ${error.message}`,
      });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsToggling(false);
    }
  };

  const handleCropStageUpdate = async () => {
    if (!cropStageDraft || cropStageDraft === String(readings.cropStage || '').toUpperCase()) {
      return;
    }

    setIsCropStageUpdating(true);
    try {
      await setRemoteCropStage(cropStageDraft);
      setNotification({
        type: 'success',
        text: `🌾 Đã cập nhật giai đoạn cây sang ${getCropStageLabel(cropStageDraft)}.`,
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      setNotification({
        type: 'warning',
        text: `❌ Không thể cập nhật giai đoạn cây: ${error.message}`,
      });
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setIsCropStageUpdating(false);
    }
  };

  const salinityColor = readings.salinity <= 4 ? '#6FCF97' : readings.salinity <= 6 ? '#F2C94C' : '#EB5757';
  const trendData = sensorHistory.map((item) => ({
    time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--',
    salinity: Number(item.salinity || 0),
    moisture: Number(item.moisture || 0),
  }));

  const historyChartData = trendData.length >= 2
    ? trendData
    : [
      {
        time: new Date(Date.now() - 10 * 60 * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        salinity: Number(readings.salinity || 0),
        moisture: Number(readings.soilMoisture || 0),
      },
      {
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        salinity: Number(readings.salinity || 0),
        moisture: Number(readings.soilMoisture || 0),
      },
    ];

  const formatTime = (d) =>
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatActionLabel = (action) => {
    const normalized = String(action || '').toUpperCase();
    if (!normalized) return 'KHÔNG HÀNH ĐỘNG';
    if (normalized.includes('OPEN')) return 'MỞ VAN';
    if (normalized.includes('CLOSE')) return 'ĐÓNG VAN';
    if (normalized.includes('OVERRIDE')) return 'GHI ĐÈ ĐIỀU KHIỂN';
    if (normalized.includes('NO_ACTION')) return 'KHÔNG HÀNH ĐỘNG';
    return 'HÀNH ĐỘNG HỆ THỐNG';
  };

  const formatActorLabel = (actor) => {
    const normalized = String(actor || '').toUpperCase();
    if (!normalized) return 'HỆ THỐNG';
    if (normalized.includes('AI')) return 'TRỢ LÝ AI';
    if (normalized.includes('MANUAL') || normalized.includes('USER')) return 'NGƯỜI DÙNG';
    return 'HỆ THỐNG';
  };

  const buildLogSummary = (log) => {
    const action = String(log?.action || '').toUpperCase();
    const reason = String(log?.reason || 'Không có mô tả chi tiết.');

    if (action.includes('OPEN')) {
      return {
        headline: 'Đã mở van cấp nước',
        impact: 'Nước bắt đầu chảy vào ruộng. Theo dõi độ ẩm và mực nước để tránh dư nước.',
      };
    }
    if (action.includes('CLOSE')) {
      return {
        headline: 'Đã đóng van cấp nước',
        impact: 'Ngừng cấp nước tạm thời để giảm rủi ro ngập hoặc nhiễm mặn.',
      };
    }
    if (action.includes('NO_ACTION')) {
      return {
        headline: 'Giữ nguyên trạng thái hệ thống',
        impact: 'Hệ thống chưa đổi van. Tiếp tục theo dõi các chỉ số môi trường.',
      };
    }

    return {
      headline: 'Hệ thống ghi nhận một hành động mới',
      impact: reason,
    };
  };

  const formatTideStatusVi = (status) => {
    const normalized = String(status || '').trim().toUpperCase();
    if (!normalized) return '--';

    const tideMap = {
      HIGH: 'Triều cao',
      LOW: 'Triều thấp',
      RISING: 'Triều đang lên',
      FALLING: 'Triều đang xuống',
      FLOOD: 'Triều dâng',
      EBB: 'Triều rút',
      SLACK: 'Nước đứng',
      NORMAL: 'Bình thường',
    };

    return tideMap[normalized] || String(status);
  };

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

        {/* ── Unified Environment Grid ───────────────────────────────── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
            Tổng Quan Môi Trường Hiện Tại
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard icon={<FarmIcons.Droplets />} label="Độ Mặn" value={readings.salinity.toFixed(1)} unit="‰" color={salinityColor} bg={`${salinityColor}20`} />
            <StatCard icon={<FarmIcons.Thermometer />} label="Nhiệt Độ" value={readings.temperature != null ? Number(readings.temperature).toFixed(1) : '--'} unit="°C" color="#F2994A" bg="#F2994A20" />
            <StatCard icon={<FarmIcons.Droplet />} label="Độ Ẩm KK" value={readings.humidity != null ? Number(readings.humidity).toFixed(0) : '--'} unit="%" color="#2FA084" bg="#2FA08420" />
            <StatCard icon={<FarmIcons.Sprout />} label="Độ Ẩm Đất" value={Number(readings.soilMoisture || 0).toFixed(0)} unit="%" color="#6FCF97" bg="#6FCF9720" />
            <StatCard icon={<FarmIcons.Beaker />} label="Độ pH" value={readings.ph != null ? Number(readings.ph).toFixed(1) : '--'} unit="pH" color="#9B59B6" bg="#9B59B620" />
            <StatCard icon={<FarmIcons.CloudRain />} label="Mưa 24h" value={readings.rainfall24h != null ? Number(readings.rainfall24h).toFixed(1) : '--'} unit="mm" color="#2D9CDB" bg="#2D9CDB20" />
            <StatCard icon={<FarmIcons.Waves />} label="Thủy Triều" value={formatTideStatusVi(readings.tideStatus)} unit="" color="#1F6F5F" bg="#1F6F5F20" />
            <StatCard icon={<FarmIcons.Wheat />} label="Giai Đoạn Cây" value={getCropStageLabel(readings.cropStage)} unit="" color="#1F6F5F" bg="#1F6F5F20" />
            <StatCard icon={<FarmIcons.Ruler />} label="Mực Nước Sông" value={readings.riverWaterLevel != null ? Number(readings.riverWaterLevel).toFixed(2) : '--'} unit="m" color="#56CCF2" bg="#56CCF220" />
            <StatCard icon={<FarmIcons.CloudSun />} label="Điều Kiện Trời" value={readings.weather} unit="" color="#1F6F5F" bg="#1F6F5F20" />
          </div>

          <div className="mt-4 bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: '#1F6F5F20' }}>
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
              <div className="md:flex-1">
                <p className="text-sm font-bold" style={{ color: '#1F6F5F' }}>CHỌN GIAI ĐOẠN CÂY TRỒNG</p>
                <p className="text-xs text-gray-500 mt-1">Chỉnh giai đoạn sinh trưởng để AI đánh giá ngưỡng mục tiêu phù hợp hơn.</p>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={cropStageDraft}
                  onChange={(e) => setCropStageDraft(String(e.target.value || 'VEGETATIVE').toUpperCase())}
                  disabled={isCropStageUpdating}
                  className="h-10 rounded-xl border px-3 text-sm font-semibold text-[#1F6F5F] bg-white min-w-45"
                  style={{ borderColor: '#1F6F5F33', fontFamily: 'var(--font-vn)' }}
                >
                  {CROP_STAGE_OPTIONS.map((stage) => (
                    <option key={stage.value} value={stage.value}>{stage.label}</option>
                  ))}
                </select>

                <button
                  onClick={handleCropStageUpdate}
                  disabled={isCropStageUpdating || cropStageDraft === String(readings.cropStage || '').toUpperCase()}
                  className="h-10 px-4 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: '#1F6F5F', fontFamily: 'var(--font-vn)' }}
                >
                  {isCropStageUpdating ? 'Đang lưu...' : 'Lưu Giai Đoạn'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Field Map Section ─────────────────────────────────────────── */}
        {/* <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
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

              {INITIAL_VALVES.map(v => (
                <Marker
                  key={v.id}
                  position={[v.lat, v.lng]}
                  icon={createCustomIcon(realtimeValveOpen, controlScope === 'single' && activeValveId === v.id)}
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
                      <span className={`text-xs font-bold mt-1 inline-block ${realtimeValveOpen ? 'text-[#2FA084]' : 'text-gray-500'}`}>
                        {realtimeValveOpen ? 'TRẠNG THÁI: ĐANG MỞ' : 'TRẠNG THÁI: ĐANG ĐÓNG'}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div> */}

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

        {/* ── Theo Doi AI Theo Thoi Gian Thuc ────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-lg" style={{ color: '#1F6F5F' }}>DỮ LIỆU THEO THỜI GIAN THỰC</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#1F6F5F10', color: '#1F6F5F' }}>
                Chế độ: {controlModeVi}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: aiStatus.is_processing ? '#F2C94C20' : '#6FCF9720', color: aiStatus.is_processing ? '#B45309' : '#1F6F5F' }}>
                {aiStatus.is_processing ? 'AI đang xử lý...' : 'AI đang chờ'}
              </span>
            </div>
          </div>

          {/* <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard icon={<FarmIcons.Valve />} label="Trạng Thái Van" value={realtimeValveOpen ? 'MỞ' : 'ĐÓNG'} unit="" color={realtimeValveOpen ? '#2FA084' : '#1F6F5F'} bg={realtimeValveOpen ? '#2FA08420' : '#1F6F5F20'} />
            <StatCard icon={<FarmIcons.Robot />} label="Chế Độ Điều Khiển" value={controlModeVi} unit="" color="#1F6F5F" bg="#1F6F5F20" />
            <StatCard icon={<FarmIcons.Cpu />} label="Trạng Thái AI" value={aiStatus.is_processing ? 'ĐANG XỬ LÝ' : 'ĐANG CHỜ'} unit="" color={aiStatus.is_processing ? '#B45309' : '#2FA084'} bg={aiStatus.is_processing ? '#F2C94C20' : '#2FA08420'} />
            <StatCard icon={<FarmIcons.MapPin />} label="Vùng Điều Khiển" value={controlScope === 'all' ? 'TOÀN VÙNG' : 'ĐƠN VAN'} unit="" color="#1F6F5F" bg="#1F6F5F20" />
          </div> */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border p-3" style={{ borderColor: '#1F6F5F20' }}>
              <p className="text-xs text-gray-400 mb-2">BIỂU ĐỒ DỮ LIỆU THỜI GIAN THỰC (Dữ liệu Cảm biến)</p>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyChartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
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
              <p className="text-xs text-gray-400 mb-2">NHẬT KÝ HÀNH ĐỘNG CỦA AI</p>
              <div className="space-y-3 max-h-60 overflow-auto pr-1">
                {actionLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="rounded-xl p-3 border" style={{ background: '#f8faf9', borderColor: '#1F6F5F1A' }}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-bold" style={{ color: '#1F6F5F' }}>
                        {buildLogSummary(log).headline}
                      </p>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 mb-2">
                      Người thực hiện: <strong>{formatActorLabel(log.actor)}</strong>
                    </p>

                    <p className="text-xs leading-relaxed text-gray-700 mb-2">
                      {log.reason || 'Không có mô tả chi tiết.'}
                    </p>

                    <div className="rounded-lg px-2.5 py-2" style={{ background: '#2FA08412' }}>
                      <p className="text-[11px] font-semibold" style={{ color: '#1F6F5F' }}>
                        Ảnh hưởng:
                      </p>
                      <p className="text-[11px] text-gray-700 leading-relaxed">
                        {buildLogSummary(log).impact}
                      </p>
                    </div>

                    <p className="mt-2 text-[11px] text-gray-500">
                      Loại hành động: {formatActionLabel(log.action)}
                    </p>
                  </div>
                ))}
                {!actionLogs.length && (
                  <p className="text-xs text-gray-400">Chưa có nhật ký hành động từ máy chủ.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Field Map Section ─────────────────────────────────────────── */}
        {/* <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
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

              {INITIAL_VALVES.map(v => (
                <Marker
                  key={v.id}
                  position={[v.lat, v.lng]}
                  icon={createCustomIcon(realtimeValveOpen, controlScope === 'single' && activeValveId === v.id)}
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
                      <span className={`text-xs font-bold mt-1 inline-block ${realtimeValveOpen ? 'text-[#2FA084]' : 'text-gray-500'}`}>
                        {realtimeValveOpen ? 'TRẠNG THÁI: ĐANG MỞ' : 'TRẠNG THÁI: ĐANG ĐÓNG'}
                      </span>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div> */}

        {/* ── Salinity Trend Chart ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-base" style={{ color: '#1F6F5F' }}>LỊCH SỬ ĐỘ MẶN</h2>
              <p className="text-xs text-gray-400">Đơn vị: ‰ PSU</p>
            </div>
            <div className="flex gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#6FCF97' }} />An toàn</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#EB5757' }} />Nguy hiểm</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: '400px', height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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

      </div>
    </div>
  );
}
