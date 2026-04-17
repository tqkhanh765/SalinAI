import { useEffect, useMemo, useState } from 'react';
import {
  API_BASE_URL,
  fetchFarmState,
  overrideActuator,
  pushSensorData,
  updateControlMode,
} from '../lib/apiClient';

const DEFAULT_SENSOR = { salinity: 0, moisture: 0, water_flow: 0, timestamp: null };
const DEFAULT_ACTUATOR = { valve_state: 'CLOSED', control_mode: 'AUTO' };
const DEFAULT_AI_STATUS = { is_processing: false, last_reasoning: '' };

export function useRealtimeFarmState() {
  const [sensorData, setSensorData] = useState(DEFAULT_SENSOR);
  const [actuator, setActuator] = useState(DEFAULT_ACTUATOR);
  const [aiStatus, setAiStatus] = useState(DEFAULT_AI_STATUS);
  const [actionLogs, setActionLogs] = useState([]);
  const [sensorHistory, setSensorHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    let stream = null;

    const applyFarmPayload = (payload) => {
      const nextSensor = payload.sensorData || DEFAULT_SENSOR;
      setSensorData(nextSensor);
      setActuator(payload.actuator || DEFAULT_ACTUATOR);
      setAiStatus(payload.aiStatus || DEFAULT_AI_STATUS);
      setActionLogs(payload.actionLogs || []);

      if (Array.isArray(payload.sensorHistory) && payload.sensorHistory.length) {
        setSensorHistory(
          payload.sensorHistory.map((item) => ({
            salinity: Number(item.salinity || 0),
            moisture: Number(item.moisture || 0),
            water_flow: Number(item.water_flow || 0),
            timestamp: item.timestamp || new Date().toISOString(),
          })).slice(-30)
        );
        return;
      }

      setSensorHistory((prev) => {
        const point = {
          salinity: Number(nextSensor.salinity || 0),
          moisture: Number(nextSensor.moisture || 0),
          water_flow: Number(nextSensor.water_flow || 0),
          timestamp: nextSensor.timestamp || new Date().toISOString(),
        };

        if (prev.length && prev[prev.length - 1].timestamp === point.timestamp) {
          return prev;
        }
        return [...prev.slice(-29), point];
      });
    };

    const loadInitialState = async () => {
      try {
        const payload = await fetchFarmState(30);
        if (!mounted) return;

        applyFarmPayload(payload);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Unable to fetch farm state');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const connectRealtimeStream = () => {
      stream = new EventSource(`${API_BASE_URL}/api/farm-stream?logLimit=30`);

      stream.addEventListener('farm_state', (event) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse(event.data);
          applyFarmPayload(payload);
          setError(null);
          setLoading(false);
        } catch {
          setError('Invalid stream payload received from backend');
        }
      });

      stream.addEventListener('error', () => {
        if (!mounted) return;
        setError('Realtime stream disconnected. Reconnecting...');
      });
    };

    loadInitialState();
    connectRealtimeStream();

    return () => {
      mounted = false;
      if (stream) {
        stream.close();
      }
    };
  }, []);

  const liveSummary = useMemo(
    () => ({
      salinity: Number(sensorData.salinity || 0),
      moisture: Number(sensorData.moisture || 0),
      valveState: actuator.valve_state || 'CLOSED',
      controlMode: actuator.control_mode || 'AUTO',
      isProcessing: Boolean(aiStatus.is_processing),
    }),
    [sensorData, actuator, aiStatus]
  );

  const setControlMode = async (mode) => {
    await updateControlMode(mode);
  };

  const setValveState = async (state) => {
    await overrideActuator({ valve_state: state });
  };

  const setCropStage = async (stage) => {
    await overrideActuator({ crop_stage: stage });
  };

  const submitSensorData = async (payload) => {
    await pushSensorData(payload);
  };

  return {
    sensorData,
    actuator,
    aiStatus,
    actionLogs,
    sensorHistory,
    liveSummary,
    loading,
    error,
    setControlMode,
    setValveState,
    setCropStage,
    submitSensorData,
  };
}
