import React, { useState, useEffect, useRef } from 'react';

/**
 * StreamingText Component
 * Simulates a typing effect character by character.
 * 
 * @param {string} text - The full text to display.
 * @param {number} speed - Milliseconds per character (default: 20ms).
 * @param {boolean} enabled - Whether the typing effect is active.
 * @param {boolean} startTrigger - If false, waits before starting (only when enabled).
 * @param {function} onComplete - Callback when typing finished.
 * @param {string} className - Optional CSS classes.
 */
const StreamingText = ({ text, speed = 20, enabled = true, startTrigger = true, onComplete, className = "" }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // If typing is disabled, show the full text immediately
  useEffect(() => {
    if (!enabled) {
      setDisplayedText(text || "");
      setIsTyping(false);
      return;
    }

    // Don't start if trigger is false
    if (!startTrigger) {
      setDisplayedText("");
      setIsTyping(false);
      return;
    }

    // Reset and start typing when text or trigger changes
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
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed, enabled, startTrigger]);

  return (
    <div className={className}>
      {displayedText}
      {isTyping && (
        <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse align-middle" style={{ verticalAlign: 'middle' }}></span>
      )}
    </div>
  );
};

export default StreamingText;
