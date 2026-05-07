import React, { useState, useEffect, useRef } from 'react';
import { onAiToken, onAiStatus } from '../services/socket';

/**
 * StreamingText Component
 * 
 * Supports two modes:
 * 1. Static (Default): Simulates typing effect character by character from a full string.
 * 2. Real-time (streamMode=true): Appends tokens received from Socket.io in real-time.
 */
const StreamingText = ({ 
  text = "", 
  speed = 10, 
  enabled = true, 
  startTrigger = true, 
  streamMode = false,
  // streamKey: optional string to correlate socket streaming events to a specific session/log
  streamKey = null,
  onComplete, 
  className = "" 
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const onCompleteRef = useRef(onComplete);

  // Update onComplete ref
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Handle Real-time Streaming Mode
  useEffect(() => {
    if (!streamMode || !enabled) return;

    // Defer initial state updates to avoid synchronous setState-in-effect warnings
    const initHandle = setTimeout(() => {
      setDisplayedText("");
      setCurrentStatus("Đang khởi động pipeline...");
      setIsTyping(true);
    }, 0);

    const unsubscribeToken = onAiToken((payload) => {
      // payload may include sessionId and sensorTimestamp (added server-side)
      const token = payload?.token || payload;
      const sensorTimestamp = payload?.sensorTimestamp || null;
      if (streamKey && sensorTimestamp && sensorTimestamp !== streamKey) return; // ignore tokens for other sessions
      // Once we get real tokens, clear the status placeholder
      setCurrentStatus("");
      setDisplayedText((prev) => prev + token);
      setIsTyping(true);
    });

    const unsubscribeStatus = onAiStatus((payload) => {
      // payload may include sessionId / sensorTimestamp
      const status = payload?.status || payload?.status === 0 ? payload.status : payload;
      const message = payload?.message || payload?.currentMessage || null;
      const sensorTimestamp = payload?.sensorTimestamp || null;
      if (streamKey && sensorTimestamp && sensorTimestamp !== streamKey) return; // ignore status for other sessions
      if (status === "processing" && message) {
        setCurrentStatus(message);
      }
      if (status === "done" || status === "error") {
        setIsTyping(false);
        setCurrentStatus("");
        if (onCompleteRef.current) onCompleteRef.current();
      }
    });

    return () => {
      unsubscribeToken();
      unsubscribeStatus();
      clearTimeout(initHandle);
    };
  }, [streamMode, enabled]);

  // Handle Static Typing Mode (Existing logic)
  useEffect(() => {
    if (streamMode) return; // Skip if in streaming mode

    if (!enabled) {
      setTimeout(() => {
        setDisplayedText(text || "");
        setIsTyping(false);
      }, 0);
      return;
    }

    if (!startTrigger) {
      setTimeout(() => {
        setDisplayedText("");
        setIsTyping(false);
      }, 0);
      return;
    }

    // Defer initial typing start to avoid cascading renders
    setTimeout(() => {
      setDisplayedText("");
      setIsTyping(true);
      indexRef.current = 0;
    }, 0);
    if (timerRef.current) clearInterval(timerRef.current);

    const fullText = text || "";
    
    timerRef.current = setInterval(() => {
      if (indexRef.current < fullText.length) {
        setDisplayedText(fullText.substring(0, indexRef.current + 1));
        indexRef.current += 1;
      } else {
        setIsTyping(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (onCompleteRef.current) onCompleteRef.current();
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed, enabled, startTrigger, streamMode]);

  return (
    <div className={className}>
      {displayedText}
      {currentStatus && (
        <span className="text-gray-400 italic animate-pulse">{currentStatus}</span>
      )}
      {isTyping && (
        <span className="inline-block w-1.5 h-4 ml-0.5 bg-blue-500 animate-pulse align-middle" style={{ verticalAlign: 'middle' }}></span>
      )}
    </div>
  );
};

export default StreamingText;
