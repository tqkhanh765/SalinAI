import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/apiClient';

const DEFAULT_PHASE_TEXT = {
  pipeline: '',
  retrieval: '',
  researcher: '',
  orchestrator: '',
};

const PHASE_ORDER = ['pipeline', 'retrieval', 'researcher', 'orchestrator'];

const useAIStream = (isProcessing = false) => {
  const [isConnected, setIsConnected] = useState(false);
  const [streamStatus, setStreamStatus] = useState('idle');
  const [currentPhase, setCurrentPhase] = useState('pipeline');
  const [currentMessage, setCurrentMessage] = useState('');
  const [streamText, setStreamText] = useState('');
  const [phaseText, setPhaseText] = useState(DEFAULT_PHASE_TEXT);
  const [sessionId, setSessionId] = useState(null);
  const sourceRef = useRef(null);

  const applySnapshot = (snapshot = {}) => {
    setSessionId(snapshot.id || null);
    setStreamStatus(snapshot.status || 'processing');
    setCurrentPhase(snapshot.currentPhase || 'pipeline');
    setCurrentMessage(snapshot.currentMessage || '');
    const reasoningByPhase = snapshot.reasoningByPhase || DEFAULT_PHASE_TEXT;
    const mergedPhaseText = {
      ...DEFAULT_PHASE_TEXT,
      ...reasoningByPhase,
    };
    setPhaseText(mergedPhaseText);
    setStreamText(PHASE_ORDER.map((phase) => mergedPhaseText[phase] || '').join(''));
  };

  useEffect(() => {
    if (!isProcessing) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      // Defer state updates to avoid synchronous setState-in-effect warnings
      setTimeout(() => {
        setIsConnected(false);
        setStreamStatus((prev) => (prev === 'error' ? prev : 'idle'));
      }, 0);
      return undefined;
    }

    if (sourceRef.current) return undefined;

    const source = new EventSource(`${API_BASE_URL}/api/ai-stream`);
    sourceRef.current = source;
    // Defer initial connection state updates to avoid sync setState-in-effect lint
    setTimeout(() => {
      setIsConnected(true);
      setStreamStatus('processing');
    }, 0);

    const closeStream = () => {
      source.close();
      sourceRef.current = null;
      setIsConnected(false);
    };

    const parsePayload = (event) => {
      try {
        return JSON.parse(event.data);
      } catch {
        return null;
      }
    };

    source.addEventListener('snapshot', (event) => {
      const payload = parsePayload(event);
      if (payload) {
        applySnapshot(payload);
      }
    });

    source.addEventListener('status', (event) => {
      const payload = parsePayload(event);
      if (!payload) return;
      setStreamStatus(payload.status || 'processing');
      if (payload.phase) setCurrentPhase(payload.phase);
      if (payload.message) setCurrentMessage(payload.message);
      if (payload.reasoningByPhase) {
        setPhaseText((prev) => ({ ...prev, ...payload.reasoningByPhase }));
      }
      if (payload.sessionId) setSessionId(payload.sessionId);
    });

    source.addEventListener('token', (event) => {
      const payload = parsePayload(event);
      if (!payload?.token) return;
      // Use functional updates to avoid stale closure over currentPhase
      setCurrentPhase((prev) => payload.phase || prev);
      setCurrentMessage('');
      setStreamStatus('processing');
      setStreamText((prev) => `${prev}${payload.token}`);
      setPhaseText((prev) => {
        const phaseKey = payload.phase || Object.keys(prev)[0] || 'pipeline';
        return {
          ...prev,
          [phaseKey]: `${prev[phaseKey] || ''}${payload.token}`,
        };
      });
      if (payload.sessionId) setSessionId(payload.sessionId);
    });

    source.addEventListener('complete', (event) => {
      const payload = parsePayload(event);
      if (payload?.sessionId) setSessionId(payload.sessionId);
      if (payload?.finalAction) {
        setCurrentMessage(`Quyết định cuối: ${payload.finalAction}`);
      }
      setStreamStatus('done');
      closeStream();
    });

    source.addEventListener('error', (event) => {
      const payload = parsePayload(event);
      if (payload?.message) {
        setCurrentMessage(payload.message);
      }
      setStreamStatus('error');
      closeStream();
    });

    source.onmessage = (event) => {
      if (event.data === '[DONE]') {
        setStreamStatus('done');
        closeStream();
      }
    };

    source.onerror = () => {
      setStreamStatus((prev) => (prev === 'done' ? prev : 'error'));
      closeStream();
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setIsConnected(false);
    };
  }, [isProcessing]);

  useEffect(() => () => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  return useMemo(() => ({
    isConnected,
    streamStatus,
    currentPhase,
    currentMessage,
    streamText,
    phaseText,
    sessionId,
  }), [isConnected, streamStatus, currentPhase, currentMessage, streamText, phaseText, sessionId]);
};

export default useAIStream;