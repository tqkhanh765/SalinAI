import React, { useMemo } from 'react';

/**
 * WeatherAmbience component
 * Provides a fixed-position background overlay with atmospheric animations.
 * @param {number} weatherCode - WMO weather code from sensor data.
 */
const WeatherAmbience = ({ weatherCode = 0 }) => {
  const ambience = useMemo(() => {
    // Rain: 61, 63, 65 (Rain), 66, 67 (Freezing rain)
    if (weatherCode >= 61 && weatherCode <= 67) {
      return {
        type: 'rain',
        className: 'bg-slate-900/20',
        elements: Array.from({ length: 40 }).map((_, i) => ({
          id: i,
          left: `${Math.random() * 100}%`,
          delay: `${Math.random() * 2}s`,
          duration: `${0.5 + Math.random() * 0.5}s`,
          opacity: 0.1 + Math.random() * 0.3
        }))
      };
    }

    // Storm: 95, 96, 99
    if (weatherCode >= 95) {
      return {
        type: 'storm',
        className: 'bg-indigo-950/30 backdrop-blur-[1px]',
        elements: Array.from({ length: 60 }).map((_, i) => ({
          id: i,
          left: `${Math.random() * 100}%`,
          delay: `${Math.random() * 1}s`,
          duration: `${0.3 + Math.random() * 0.3}s`,
          opacity: 0.2 + Math.random() * 0.4
        })),
        hasLightning: true
      };
    }

    // Sunny/Clear: 0, 1
    if (weatherCode <= 1) {
      return {
        type: 'sunny',
        className: 'bg-transparent',
        hasGlow: true
      };
    }

    // Cloudy/Fog: 2, 3, 45, 48
    return {
      type: 'cloudy',
      className: 'bg-slate-500/10 backdrop-blur-[2px]',
      hasMist: true
    };
  }, [weatherCode]);

  return (
    <div className={`fixed inset-0 pointer-events-none z-0 transition-colors duration-1000 ${ambience.className}`}>
      
      {/* Rain Particles */}
      {(ambience.type === 'rain' || ambience.type === 'storm') && (
        <div className="absolute inset-0 overflow-hidden">
          {ambience.elements.map(drop => (
            <div
              key={drop.id}
              className="absolute w-[1px] h-12 bg-sky-400/40"
              style={{
                left: drop.left,
                top: '-50px',
                opacity: drop.opacity,
                animation: `rainFall ${drop.duration} linear infinite`,
                animationDelay: drop.delay
              }}
            />
          ))}
        </div>
      )}

      {/* Storm Lightning */}
      {ambience.hasLightning && (
        <div className="absolute inset-0 bg-white/10 animate-[lightningFlash_5s_infinite]" />
      )}

      {/* Sunny Glow */}
      {ambience.hasGlow && (
        <div className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] bg-amber-400/10 rounded-full blur-[120px] animate-[glowPulse_8s_ease-in-out_infinite]" />
      )}

      {/* Mist/Fog for Cloudy */}
      {ambience.hasMist && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50" />
      )}
    </div>
  );
};

export default WeatherAmbience;
