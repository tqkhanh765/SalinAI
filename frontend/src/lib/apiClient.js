import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

function normalizeApiError(error) {
  const apiError = error?.response?.data?.error;
  const apiDetails = error?.response?.data?.details;
  const status = error?.response?.status;

  if (apiError && apiDetails) {
    return new Error(`${apiError}: ${apiDetails}`);
  }
  if (apiError) {
    return new Error(apiError);
  }
  if (status) {
    return new Error(`Request failed with status ${status}`);
  }
  return new Error(error?.message || 'Network request failed');
}

export async function fetchFarmState(logLimit = 20) {
  try {
    const response = await http.get('/api/farm-state', {
      params: { logLimit },
    });
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export async function pushSensorData(payload) {
  try {
    const response = await http.post('/api/sensor-data', payload);
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export async function updateControlMode(control_mode) {
  try {
    const response = await http.patch('/api/control-mode', { control_mode });
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export async function overrideActuator(payload) {
  try {
    const response = await http.post('/api/override', payload);
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export { API_BASE_URL, http };
