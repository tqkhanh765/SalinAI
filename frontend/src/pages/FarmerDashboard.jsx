import { useState, useEffect, useCallback } from 'react';
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
import {
  SalinityIcon, TemperatureIcon, HumidityIcon, SoilMoistureIcon,
  PhIcon, RainIcon, TideIcon, CropStageIcon, WaterLevelIcon,
  WeatherIcon, ValveIcon, ControlModeIcon, AiStatusIcon, ControlScopeIcon,
} from '../components/icons/SensorIcons';
import IrrigationPlanPanel from '../components/IrrigationPlanPanel';
import { initSocket } from '../services/socket';
import toast from 'react-hot-toast';
import WeatherAmbience from '../components/visuals/WeatherAmbience';
import WaterFlowSVG from '../components/visuals/WaterFlowSVG';
import CropStageIllustration from '../components/visuals/CropStageIllustration';

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

const StatCard = ({ icon: IconComponent, label, value, unit, color, bg }) => (
  <div className="bg-white rounded-2xl p-4 md:p-5 flex items-center gap-4 shadow-sm border" style={{ borderColor: '#1F6F5F15' }}>
    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
      {IconComponent ? <IconComponent color={color} size={24} /> : null}
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

  const seriesMeta = {
    salinity: { label: 'Độ mặn', unit: '‰ PSU' },
    moisture: { label: 'Độ ẩm', unit: '%' },
  };

  return (
    <div className="bg-white rounded-xl shadow-lg px-3 py-2 border" style={{ borderColor: '#1F6F5F20' }}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="space-y-1">
        {payload
          .filter((item) => item && item.value != null)
          .map((item) => {
            const meta = seriesMeta[item.dataKey] || { label: String(item.name || item.dataKey || '--'), unit: '' };
            return (
              <p key={item.dataKey} className="text-sm font-semibold flex items-center gap-2" style={{ color: item.color || '#1F6F5F' }}>
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: item.color || '#1F6F5F' }} />
                <span>{meta.label}:</span>
                <span className="font-extrabold tabular-nums">{Number(item.value).toFixed(1)} {meta.unit}</span>
              </p>
            );
          })}
      </div>
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
    cropProfiles,
    setControlMode: setRemoteControlMode,
    setValveState: setRemoteValveState,
    setCropStage: setRemoteCropStage,
  } = useRealtimeFarmState();
  const [controlScope, _setControlScope] = useState('single'); // 'all' | 'single'
  const [activeValveId, _setActiveValveId] = useState(INITIAL_VALVES[0].id);

  const [isToggling, setIsToggling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [uiControlMode, setUiControlMode] = useState('manual');
  const [_isModeUpdating, setIsModeUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [decisionDetails, setDecisionDetails] = useState(null);
  const [cropStageDraft, setCropStageDraft] = useState('VEGETATIVE');
  const [isCropStageUpdating, setIsCropStageUpdating] = useState(false);

  // Initialize Socket.io
  useEffect(() => {
    initSocket();
  }, []);

  // Epic 2 states
  const [feedbackModal, setFeedbackModal] = useState(null); // { actionLogId: string }
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('Sai ngưỡng mặn');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [hiddenFeedbackLogIds, setHiddenFeedbackLogIds] = useState([]);
  const [lessonsLearned, setLessonsLearned] = useState([]);
  const [isLessonsExpanded, setIsLessonsExpanded] = useState(true);

  const CROP_STAGE_OPTIONS = [
    { value: 'GERMINATION', label: 'Nảy mầm' },
    { value: 'SEEDLING', label: 'Cây con' },
    { value: 'VEGETATIVE', label: 'Phát triển thân, lá' },
    { value: 'FLOWERING', label: 'Ra hoa' },
    { value: 'FRUITING', label: 'Kết trái' },
    { value: 'HARVEST', label: 'Thu hoạch' },
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
  const _controlledValveCount = controlScope === 'all' ? INITIAL_VALVES.length : 1;
  const currentFlowRate = valveOpen
    ? (Number(sensorData.water_flow ?? 0)).toFixed(1)
    : '0.0';

  const activeValveDisplay = controlScope === 'all' ? 'TẤT CẢ VAN' : activeValveId;
  const controlModeVi = (actuator.control_mode || 'AUTO').toUpperCase() === 'AUTO' ? 'TỰ ĐỘNG' : 'THỦ CÔNG';
  const latestActionLogId = actionLogs?.[0]?.id || actionLogs?.[0]?._id || null;

  const formatVnTime = (value, opts = {}) => {
    if (!value) return '--:--';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '--:--';

    const isToday = date.toDateString() === new Date().toDateString();

    const timeStr = date.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    if (isToday) return timeStr;

    const dateStr = date.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
    });

    return `${dateStr} ${timeStr.split(':').slice(0, 2).join(':')}`; // Format: DD/MM HH:mm
  };

  const readings = {
    salinity: Number(sensorData.salinity ?? 0),
    soilMoisture: Number(sensorData.soil_moisture ?? sensorData.moisture ?? 0),
    temperature: sensorData.temperature ?? decisionDetails?.weatherMetrics?.temperature?.value ?? null,
    humidity: sensorData.humidity ?? decisionDetails?.weatherMetrics?.humidity?.value ?? null,
    rainfall24h: sensorData.rainfall_24h ?? decisionDetails?.weatherMetrics?.rainfall_24h?.value ?? null,
    tideStatus: sensorData.tide_status ?? null,
    cropStage: sensorData.crop_stage ?? decisionDetails?.sensorMetrics?.crop_stage?.value ?? 'VEGETATIVE',
    riverWaterLevel: sensorData.river_water_level ?? decisionDetails?.sensorMetrics?.water_level?.value ?? null,
    ph: sensorData.ph ?? null,
    weather: sensorData.weather || '--',
  };

  const activeProfile = cropProfiles?.[String(readings.cropStage || '').toUpperCase()] || {
    salinityMaxSafe: 2.5,
    salinityDeltaTolerance: 0.5,
    moistureTarget: { min: 40 }
  };

  const chartThresholds = {
    salinitySafe: activeProfile.salinityMaxSafe,
    salinityDanger: activeProfile.salinityMaxSafe + (activeProfile.salinityDeltaTolerance || 0.5),
    moistureSafe: activeProfile.moistureTarget?.min ?? 40,
    moistureDanger: Math.max(10, (activeProfile.moistureTarget?.min ?? 40) - 15)
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

  const fetchLessons = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/lessons-learned`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.lessons) {
        setLessonsLearned(json.lessons);
      }
    } catch (err) {
      console.debug('[Dashboard] lessons fetch failed:', err?.message || err);
    }
  }, []);

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
      } catch (err) {
        console.debug('[Dashboard] decision-details fetch failed:', err?.message || err);
      }
    };


    fetchDecisionDetails();
    fetchLessons();
    const interval = setInterval(fetchDecisionDetails, 5000);
    const intervalLessons = setInterval(fetchLessons, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(intervalLessons);
    };
  }, [fetchLessons]);

  const submitPositiveFeedback = async (actionLogId) => {
    if (!actionLogId) return;
    try {
      toast.loading('Đang gửi phản hồi...', { id: `feedback-${actionLogId}` });
      const res = await fetch(`${API_BASE_URL}/api/decision-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_log_id: actionLogId, verdict: 'correct' }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      toast.success('Cảm ơn! Phản hồi tích cực đã được ghi nhận.', { id: `feedback-${actionLogId}` });
      setHiddenFeedbackLogIds((prev) => (prev.includes(actionLogId) ? prev : [...prev, actionLogId]));
      setFeedbackModal(null);
    } catch (e) {
      console.error(e);
      toast.error('Lỗi kết nối khi gửi phản hồi.', { id: `feedback-${actionLogId}` });
    }
  };

  const submitNegativeFeedback = async () => {
    if (!feedbackModal?.actionLogId) return;
    setIsSubmittingFeedback(true);
    toast.loading('Đang mở luồng phản hồi cho AI...', { id: `negative-feedback-${feedbackModal.actionLogId}` });
    try {
      const evalResponse = await fetch(`${API_BASE_URL}/api/evaluate-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_log_id: feedbackModal.actionLogId,
          verdict: 'incorrect',
          notes: `[${feedbackCategory}] ${feedbackReason}`
        }),
      });
      if (!evalResponse.ok) {
        throw new Error(`Evaluator HTTP ${evalResponse.status}`);
      }

      const feedbackResponse = await fetch(`${API_BASE_URL}/api/decision-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_log_id: feedbackModal.actionLogId,
          verdict: 'incorrect',
          notes: `[${feedbackCategory}] ${feedbackReason}`
        }),
      });
      if (!feedbackResponse.ok) {
        throw new Error(`Feedback HTTP ${feedbackResponse.status}`);
      }

      setFeedbackModal(null);
      setFeedbackReason('');
      toast.success('Cảm ơn! AI sẽ học từ phản hồi này.', { id: `negative-feedback-${feedbackModal.actionLogId}` });
      setHiddenFeedbackLogIds((prev) => (prev.includes(feedbackModal.actionLogId) ? prev : [...prev, feedbackModal.actionLogId]));
      
      // AI Evaluator takes time, so we poll after a delay
      setTimeout(fetchLessons, 5000);
      setTimeout(fetchLessons, 15000);
      setTimeout(fetchLessons, 30000);
    } catch (error) {
      toast.error('Không thể gửi phản hồi: ' + error.message, { id: `negative-feedback-${feedbackModal.actionLogId}` });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleControlModeChange = async (nextMode) => {
    setUiControlMode(nextMode);
    setIsModeUpdating(true);
    try {
      await setRemoteControlMode(nextMode.toUpperCase());
      toast.success(nextMode === 'manual' ? '🛠️ Đã chuyển sang chế độ THỦ CÔNG.' : '🤖 Đã chuyển sang chế độ TỰ ĐỘNG.');
    } catch (error) {
      toast.error(`❌ Không thể cập nhật chế độ điều khiển: ${error.message}`);
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
      if (isOpening) {
        toast.success(msg);
      } else {
        toast(msg);
      }
    } catch (error) {
      toast.error(`❌ Không thể cập nhật trạng thái van: ${error.message}`);
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
      toast.success(`🌾 Đã cập nhật giai đoạn cây sang ${getCropStageLabel(cropStageDraft)}.`);
    } catch (error) {
      toast.error(`❌ Không thể cập nhật giai đoạn cây: ${error.message}`);
    } finally {
      setIsCropStageUpdating(false);
    }
  };

  const salinityColor = readings.salinity <= 4 ? '#6FCF97' : readings.salinity <= 6 ? '#F2C94C' : '#EB5757';
  const trendData = sensorHistory.map((item) => ({
    time: item.timestamp ? formatVnTime(item.timestamp, { hour: '2-digit', minute: '2-digit' }) : '--:--',
    salinity: Number(item.salinity || 0),
    moisture: Number(item.moisture || 0),
  }));

  const historyChartData = trendData.length >= 2
    ? trendData
    : [
      {
        time: formatVnTime(new Date(Date.now() - 10 * 60 * 1000), { hour: '2-digit', minute: '2-digit' }),
        salinity: Number(readings.salinity || 0),
        moisture: Number(readings.soilMoisture || 0),
      },
      {
        time: formatVnTime(new Date(), { hour: '2-digit', minute: '2-digit' }),
        salinity: Number(readings.salinity || 0),
        moisture: Number(readings.soilMoisture || 0),
      },
    ];

  const formatTime = (d) => formatVnTime(d);

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
    if (!normalized) return 'SalinAI';
    if (normalized.includes('AI') || normalized.includes('AGENT')) return 'SalinAI';
    if (normalized.includes('MANUAL') || normalized.includes('USER')) return 'Người dùng';
    return 'SalinAI';
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

  const getLogReasoning = (log) => {
    let reasoning = log?.model_insights?.orchestrator_reasoning_summary
      || log?.model_insights?.orchestrator_tool_reason
      || log?.reason
      || buildLogSummary(log).impact;

    reasoning = String(reasoning || 'Chưa có lý do được ghi nhận.').trim();

    if (reasoning.includes('Manual override from frontend dashboard')) {
      reasoning = 'Người dùng điều chỉnh thủ công từ bảng điều khiển';
    }

    return reasoning;
  };

  const getLogMetrics = (log, liveData = sensorData) => {
    const sensor = log?.sensor_snapshot || {};
    const temp = sensor.temperature ?? liveData?.temperature ?? null;
    const weather = sensor.weather ?? liveData?.weather ?? '--';
    const rainfall = sensor.rainfall_24h ?? liveData?.rainfall_24h ?? null;

    return [
      {
        label: 'Độ mặn',
        value: sensor.salinity != null ? `${Number(sensor.salinity).toFixed(1)} ppt` : '--',
        tone: '#2FA084',
      },
      {
        label: 'Độ ẩm đất',
        value: sensor.moisture != null ? `${Number(sensor.moisture).toFixed(0)}%` : '--',
        tone: '#1F6F5F',
      },
      {
        label: 'Nhiệt độ',
        value: temp != null ? `${Number(temp).toFixed(1)}°C` : '--',
        tone: '#F2994A',
      },
      {
        label: 'Thời tiết',
        value: weather ? String(weather) : '--',
        tone: '#2D9CDB',
      },
      {
        label: 'Mưa 24h',
        value: rainfall != null ? `${Number(rainfall).toFixed(1)} mm` : '--',
        tone: '#2D9CDB',
      },
      {
        label: 'Giai đoạn cây',
        value: sensor.crop_stage ? getCropStageLabel(sensor.crop_stage) : '--',
        tone: '#6FCF97',
      },
    ];
  };

  const formatTideStatusVi = (status) => {
    const normalized = String(status || '').trim().toUpperCase();
    if (!normalized) return '--';

    const tideMap = {
      HIGH: 'Triều cao',
      LOW: 'Triều thấp',
      RISING: 'Triều lên',
      FALLING: 'Triều xuống',
      FLOOD: 'Triều dâng',
      EBB: 'Triều rút',
      SLACK: 'Nước đứng',
      NORMAL: 'Bình thường',
    };

    return tideMap[normalized] || String(status);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] py-6 px-4 sm:px-6 lg:px-8 relative" style={{ background: '#EEEEEE' }}>
      <WeatherAmbience weatherCode={sensorData.weather_code || 0} />

      <div className="max-w-5xl mx-auto space-y-5 relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold leading-tight mt-1" style={{ color: '#1F6F5F' }}>
              Trạm Gateway SAL-84
            </h1>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm border self-start sm:self-auto"
            style={{ borderColor: '#1F6F5F20' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#6FCF97' }} />
            <span className="text-xs text-gray-500 font-medium">Cập nhật: {formatTime(lastUpdated)}</span>
          </div>

        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: '#9ca3af' }}>
            Tổng Quan Môi Trường Hiện Tại
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard icon={SalinityIcon} label="Độ Mặn" value={readings.salinity.toFixed(1)} unit="‰" color={salinityColor} bg={`${salinityColor}20`} />
            <StatCard icon={TemperatureIcon} label="Nhiệt Độ" value={readings.temperature != null ? Number(readings.temperature).toFixed(1) : '--'} unit="°C" color="#1F6F5F" bg="#1F6F5F15" />
            <StatCard icon={HumidityIcon} label="Độ Ẩm KK" value={readings.humidity != null ? Number(readings.humidity).toFixed(0) : '--'} unit="%" color="#2FA084" bg="#2FA08415" />
            <StatCard icon={SoilMoistureIcon} label="Độ Ẩm Đất" value={Number(readings.soilMoisture || 0).toFixed(0)} unit="%" color="#6FCF97" bg="#6FCF9715" />
            <StatCard icon={RainIcon} label="Mưa 24h" value={readings.rainfall24h != null ? Number(readings.rainfall24h).toFixed(1) : '--'} unit="mm" color="#2FA084" bg="#2FA08415" />
            <StatCard icon={TideIcon} label="Thủy Triều" value={formatTideStatusVi(readings.tideStatus)} unit="" color="#1F6F5F" bg="#1F6F5F15" />
            <StatCard icon={CropStageIcon} label="Giai Đoạn Cây" value={getCropStageLabel(readings.cropStage)} unit="" color="#1F6F5F" bg="#1F6F5F15" />
            <StatCard icon={WeatherIcon} label="Điều Kiện Trời" value={readings.weather} unit="" color="#1F6F5F" bg="#1F6F5F15" />
          </div>

          <div className="mt-4 mb-5 bg-white rounded-2xl p-4 shadow-sm border overflow-hidden" style={{ borderColor: '#1F6F5F20' }}>
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div className="w-full md:w-48 shrink-0">
                <CropStageIllustration stage={readings.cropStage} />
              </div>

              <div className="flex-1 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                <div className="md:flex-1">
                  <p className="text-sm font-bold" style={{ color: '#1F6F5F' }}> CHỌN GIAI ĐOẠN PHÁT TRIỂN CỦA CÂY</p>
                  <p className="text-xs text-gray-500 mt-1">Chọn giai đoạn sinh trưởng để AI đánh giá ngưỡng mục tiêu phù hợp hơn.</p>
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

          <IrrigationPlanPanel />
        </div>

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

            <div className="shrink-0 w-full md:w-32">
              <WaterFlowSVG isOpen={valveOpen} />
            </div>

            <div className="flex-1 w-full space-y-4">
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

        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <div>
            <h2 className="font-bold text-lg" style={{ color: '#1F6F5F' }}>BIỂU ĐỒ DỮ LIỆU CẢM BIẾN</h2>
          </div>

          <div className="overflow-x-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ minWidth: '720px' }}>
              <div className="rounded-xl border p-4" style={{ borderColor: '#1F6F5F14', background: '#fbfefe' }}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#1F6F5F' }}>ĐỘ MẶN</p>
                    <div className="flex flex-wrap gap-3 text-[11px] font-semibold mt-1">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#6FCF97' }} />An toàn</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#EB5757' }} />Nguy hiểm</span>
                    </div>
                  </div>
                </div>
                <div style={{ height: '220px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historyChartData} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salinGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2FA084" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#2FA084" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#9ca3af' }} interval="preserveStartEnd" minTickGap={50} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={chartThresholds.salinitySafe} stroke="#6FCF97" strokeDasharray="4 4" strokeWidth={1.5} />
                      <ReferenceLine y={chartThresholds.salinityDanger} stroke="#EB5757" strokeDasharray="4 4" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="salinity" stroke="#2FA084" strokeWidth={2.5} fill="url(#salinGrad)" dot={false} activeDot={{ r: 5, fill: '#2FA084' }} name="Độ mặn" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: '#1F6F5F14', background: '#fbfefe' }}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#1F6F5F' }}>ĐỘ ẨM</p>
                    <div className="flex flex-wrap gap-3 text-[11px] font-semibold mt-1">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#6FCF97' }} />An toàn</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#EB5757' }} />Nguy hiểm</span>
                    </div>
                  </div>
                </div>
                <div style={{ height: '220px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyChartData} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#9ca3af' }} interval="preserveStartEnd" minTickGap={50} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={chartThresholds.moistureSafe} stroke="#6FCF97" strokeDasharray="4 4" strokeWidth={1.5} />
                      <ReferenceLine y={chartThresholds.moistureDanger} stroke="#EB5757" strokeDasharray="4 4" strokeWidth={1.5} />
                      <Line type="monotone" dataKey="moisture" stroke="#1F6F5F" strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: '#1F6F5F' }} name="Độ ẩm" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
          <h2 className="font-bold text-lg" style={{ color: '#1F6F5F' }}>NHẬT KÝ HÀNH ĐỘNG</h2>
          <div className="space-y-5 overflow-auto pr-2 mt-4" style={{ maxHeight: '750px' }}>
            {actionLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="rounded-2xl p-5 md:p-6 border shadow-sm" style={{ background: '#f8faf9', borderColor: '#1F6F5F1A' }}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-base font-bold" style={{ color: '#1F6F5F' }}>
                      {formatActionLabel(log.action)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {log.timestamp ? formatVnTime(log.timestamp, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </span>
                </div>

                <div className="rounded-xl px-4 py-4 mb-5" style={{ background: '#2FA08412', borderLeft: '4px solid #2FA084' }}>
                  <p className="text-[11px] font-semibold text-gray-500 mb-1">SUY LUẬN CỦA SALINAI</p>
                  <p className="text-[15px] leading-relaxed text-gray-800" style={{ whiteSpace: 'pre-line' }}>
                    {getLogReasoning(log)}
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                  {getLogMetrics(log, sensorData).map((metric) => (
                    <div key={`${log.id}-${metric.label}`} className="rounded-xl px-3 py-2.5 border" style={{ background: '#ffffff', borderColor: '#1F6F5F14' }}>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{metric.label}</p>
                      <p className="text-sm font-semibold" style={{ color: metric.tone }}>
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 text-xs text-gray-500">
                  <span>Người thực hiện: <strong>{formatActorLabel(log.actor)}</strong></span>
                </div>

                {formatActorLabel(log.actor) === 'SalinAI' && !hiddenFeedbackLogIds.includes(log.id || log._id) && (
                  <div className="mt-4 flex items-center gap-2 pt-3 border-t" style={{ borderColor: '#1F6F5F10' }}>
                    <span className="text-xs font-semibold text-gray-500">Quyết định này có đúng không?</span>
                    <button
                      type="button"
                      onClick={() => submitPositiveFeedback(log.id || log._id)}
                      className="px-3 py-1.5 bg-green-50 text-green-700 rounded-md text-xs font-bold hover:bg-green-100 transition-colors"
                    >👍 Đúng</button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = log.id || log._id;
                        toast('Đã mở form góp ý cho AI.');
                        setFeedbackModal({ actionLogId: targetId });
                      }}
                      className="px-3 py-1.5 bg-red-50 text-red-700 rounded-md text-xs font-bold hover:bg-red-100 transition-colors"
                    >👎 Sai</button>
                  </div>
                )}
              </div>
            ))}
            {!actionLogs.length && (
              <p className="text-xs text-gray-400">Chưa có nhật ký hành động từ máy chủ.</p>
            )}
          </div>
        </div>

        {lessonsLearned.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: '#1F6F5F20' }}>
            <button
              onClick={() => setIsLessonsExpanded(!isLessonsExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">💡</span>
                <span className="font-bold text-sm" style={{ color: '#1F6F5F' }}>BÀI HỌC AI ĐÃ HỌC TỪ PHẢN HỒI NÔNG DÂN</span>
              </div>
              <svg className={`w-5 h-5 text-gray-500 transition-transform ${isLessonsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>

            {isLessonsExpanded && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {lessonsLearned.slice(0, 4).map((lesson, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-100 p-3 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">{formatVnTime(lesson.created_at_vn)}</span>
                      <span className="text-[10px] bg-[#1F6F5F15] text-[#1F6F5F] px-1.5 py-0.5 rounded font-bold uppercase">{lesson.feedback_source || 'AI'}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 mb-2 leading-relaxed">{lesson.lesson_text}</p>
                    <div className="flex items-center gap-2 text-[11px] mb-2">
                      <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Thực tế: {lesson.action_taken}</span>
                      <span className="text-gray-400">→</span>
                      <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">Nên là: {lesson.correct_action}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                      <p className="text-[11px] text-gray-600 font-medium">🗣️ Lý do từ nông dân:</p>
                      <p className="text-[11px] text-gray-800 mt-0.5 italic">"{lesson.farmer_notes}"</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── Feedback Modal (Epic 2) ─────────────────────────── */}
        {feedbackModal && createPortal(
          <div className="fixed inset-0 z-99999 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-50">
                    <span className="text-lg">👎</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Phản hồi quyết định sai</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Phân loại lỗi</label>
                    <select
                      value={feedbackCategory}
                      onChange={e => setFeedbackCategory(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#1F6F5F] outline-none bg-gray-50 font-medium"
                    >
                      <option value="Sai ngưỡng mặn">Sai ngưỡng mặn</option>
                      <option value="Sai thông tin thời tiết">Sai thông tin thời tiết</option>
                      <option value="Sai giai đoạn cây">Sai giai đoạn cây</option>
                      <option value="Khác">Lý do khác</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Tại sao quyết định này không đúng?</label>
                    <textarea
                      value={feedbackReason}
                      onChange={e => setFeedbackReason(e.target.value)}
                      placeholder="Giải thích lý do thực tế tại ruộng để AI học hỏi..."
                      className="w-full border border-gray-200 rounded-xl p-3 text-sm min-h-25 focus:ring-2 focus:ring-[#1F6F5F] outline-none bg-gray-50 resize-none font-medium"
                    ></textarea>
                  </div>
                </div>
              </div>
              <div className="flex bg-gray-50">
                <button
                  onClick={() => { setFeedbackModal(null); setFeedbackReason(''); }}
                  className="flex-1 py-4 text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors border-r border-gray-100"
                >
                  Hủy
                </button>
                <button
                  onClick={submitNegativeFeedback}
                  disabled={isSubmittingFeedback || !feedbackReason.trim()}
                  className="flex-1 py-4 text-sm font-bold text-white transition-colors disabled:opacity-50"
                  style={{ background: '#EB5757' }}
                >
                  {isSubmittingFeedback ? 'Đang gửi...' : 'Gửi phản hồi'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
