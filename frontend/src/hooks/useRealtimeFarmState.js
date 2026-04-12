import { useEffect, useMemo, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { db } from '../lib/firebaseClient';

const DEFAULT_SENSOR = { salinity: 0, moisture: 0, timestamp: null };
const DEFAULT_ACTUATOR = { valve_state: 'CLOSED', control_mode: 'AUTO' };
const DEFAULT_AI_STATUS = { is_processing: false, last_reasoning: '' };

export function useRealtimeFarmState() {
  const [sensorData, setSensorData] = useState(DEFAULT_SENSOR);
  const [actuator, setActuator] = useState(DEFAULT_ACTUATOR);
  const [aiStatus, setAiStatus] = useState(DEFAULT_AI_STATUS);
  const [actionLogs, setActionLogs] = useState([]);
  const [sensorHistory, setSensorHistory] = useState([]);

  useEffect(() => {
    const offSensor = onValue(ref(db, 'sensor_data'), (snapshot) => {
      const val = snapshot.val();
      if (!val) return;

      const next = {
        salinity: Number(val.salinity ?? 0),
        moisture: Number(val.moisture ?? 0),
        timestamp: val.timestamp || new Date().toISOString(),
      };

      setSensorData(next);
      setSensorHistory((prev) => {
        if (prev.length && prev[prev.length - 1].timestamp === next.timestamp) {
          return prev;
        }
        return [...prev.slice(-29), next];
      });
    });

    const offActuator = onValue(ref(db, 'actuator'), (snapshot) => {
      const val = snapshot.val();
      if (!val) return;
      setActuator({
        valve_state: val.valve_state || 'CLOSED',
        control_mode: val.control_mode || 'AUTO',
      });
    });

    const offAiStatus = onValue(ref(db, 'ai_status'), (snapshot) => {
      const val = snapshot.val();
      if (!val) return;
      setAiStatus({
        is_processing: Boolean(val.is_processing),
        last_reasoning: val.last_reasoning || '',
      });
    });

    const offLogs = onValue(ref(db, 'action_logs'), (snapshot) => {
      const val = snapshot.val() || {};
      const parsed = Object.entries(val)
        .map(([id, item]) => ({ id, ...item }))
        .sort((a, b) => {
          const at = new Date(a.timestamp || 0).getTime();
          const bt = new Date(b.timestamp || 0).getTime();
          return bt - at;
        });

      setActionLogs(parsed);
    });

    return () => {
      offSensor();
      offActuator();
      offAiStatus();
      offLogs();
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
    await set(ref(db, 'actuator/control_mode'), mode);
  };

  return {
    sensorData,
    actuator,
    aiStatus,
    actionLogs,
    sensorHistory,
    liveSummary,
    setControlMode,
  };
}
