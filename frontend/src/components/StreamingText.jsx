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
  speed = 15, 
  enabled = true, 
  startTrigger = true, 
  streamMode = false,
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

    setDisplayedText("");
    setCurrentStatus("Đang khởi động pipeline...");
    setIsTyping(true);

    const unsubscribeToken = onAiToken(({ token }) => {
      // Once we get real tokens, clear the status placeholder
      setCurrentStatus("");
      setDisplayedText((prev) => prev + token);
      setIsTyping(true);
    });

    const unsubscribeStatus = onAiStatus(({ status, message }) => {
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
    };
  }, [streamMode, enabled]);

  // Handle Static Typing Mode (Existing logic)
  useEffect(() => {
    if (streamMode) return; // Skip if in streaming mode

    if (!enabled) {
      setDisplayedText(text || "");
      setIsTyping(false);
      return;
    }

    if (!startTrigger) {
      setDisplayedText("");
      setIsTyping(false);
      return;
    }

    setDisplayedText("");
    setIsTyping(true);
    indexRef.current = 0;
    
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
