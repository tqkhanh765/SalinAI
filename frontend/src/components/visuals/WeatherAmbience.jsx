import React, { useMemo } from 'react';

/**
 * WeatherAmbience component
 * Provides a fixed-position background overlay with atmospheric animations.
 * @param {number} weatherCode - WMO weather code from sensor data.
 */
const WeatherAmbience = ({ weatherCode = 0 }) => {
  const ambience = useMemo(() => {
    const isRain = (weatherCode >= 61 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);
    const isStorm = weatherCode >= 95;

    if (isStorm) {
      return {
        type: 'storm',
        className: 'bg-indigo-950/70 backdrop-blur-[4px]',
        elements: Array.from({ length: 80 }).map((_, i) => ({
          id: i,
          left: `${Math.random() * 120 - 10}%`,
          delay: `${Math.random() * 1}s`,
          duration: `${0.2 + Math.random() * 0.2}s`,
          opacity: 0.4 + Math.random() * 0.5
        })),
        hasLightning: true,
        isSlanted: true
      };
    }

    if (isRain) {
      return {
        type: 'rain',
        className: 'bg-slate-800/40 backdrop-blur-[2px]',
        elements: Array.from({ length: 40 }).map((_, i) => ({
          id: i,
          left: `${Math.random() * 100}%`,
          delay: `${Math.random() * 2}s`,
          duration: `${0.6 + Math.random() * 0.4}s`,
          opacity: 0.2 + Math.random() * 0.3
        })),
        hasLightning: false,
        isSlanted: false
      };
    }

    if (weatherCode === 0) {
      return { type: 'sunny', className: 'bg-transparent', hasSunMood: true };
    }

    return { type: 'cloudy', className: 'bg-[#2FA084]/5 backdrop-blur-[1px]', hasCloudMood: true };
  }, [weatherCode]);

  return (
    <div className={`fixed inset-0 pointer-events-none z-[1] transition-all duration-1000 ${ambience.className}`}>
      
      {/* --- SUNNY MOOD (Intense Focal Glow) --- */}
      {ambience.hasSunMood && (
        <div className="absolute inset-0 overflow-hidden">
          {/* 
              TĂNG MẠNH ĐỘ ĐẬM (OPACITY) CHO TÂM VÀ VÒNG TRUNG GIAN
          */}
          <div 
            className="absolute inset-0"
            style={{ 
              background: `radial-gradient(circle at 100% 0%, 
                rgba(255, 140, 0, 0.7) 0%,     /* Tâm Cam cực rực */
                rgba(255, 140, 0, 0.55) 15%,    
                rgba(255, 195, 0, 0.45) 35%,    /* Vàng Cam sáng mạnh */
                rgba(255, 212, 0, 0.2) 65%,     /* Vàng Nắng nhẹ nhàng loang ra */
                rgba(255, 212, 0, 0.05) 100%)`
            }} 
          />
          
          {/* Lớp làm rực màu (Saturation boost) */}
          <div className="absolute inset-0 bg-orange-400/5 mix-blend-color-dodge" />
        </div>
      )}

      {/* --- CLOUDY MOOD (SalinAI Green Atmosphere) --- */}
      {ambience.hasCloudMood && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#1F6F5F]/10 to-transparent" />
          {/* Large soft green/mint blobs */}
          <div className="absolute top-[10%] left-[-10%] w-[120%] h-[40%] bg-[#6FCF97]/20 blur-[140px] rounded-[100%] animate-[cloudMove_150s_linear_infinite]" />
          <div className="absolute top-[40%] right-[-20%] w-[100%] h-[50%] bg-[#2FA084]/15 blur-[120px] rounded-[100%] animate-[cloudMove_100s_linear_infinite_reverse]" />
          
          {/* Brand integration tint */}
          <div className="absolute inset-0 bg-[#1F6F5F]/5 mix-blend-multiply" />
        </div>
      )}

      {/* --- RAIN / STORM ELEMENTS --- */}
      {(ambience.type === 'rain' || ambience.type === 'storm') && (
        <div className="absolute inset-0 overflow-hidden">
          {ambience.elements.map(drop => (
            <div key={drop.id} className="absolute w-[2px] h-20 bg-gradient-to-b from-transparent to-sky-200/50"
                 style={{ left: drop.left, top: '-15%', opacity: drop.opacity, animation: `${ambience.isSlanted ? 'stormRain' : 'rainFall'} ${drop.duration} linear infinite`, animationDelay: drop.delay }} />
          ))}
          {ambience.hasLightning && <div className="absolute inset-0 bg-white/40 opacity-0" style={{ animation: 'lightningFlash 4s infinite' }} />}
        </div>
      )}
    </div>
  );
};

export default WeatherAmbience;
