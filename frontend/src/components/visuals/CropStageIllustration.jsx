import React from 'react';

/**
 * CropStageIllustration component
 * Visualizes the current growth stage of the rice crop with creative SVG art.
 * @param {string} stage - GERMINATION, SEEDLING, VEGETATIVE, FLOWERING, FRUITING, HARVEST
 */
const CropStageIllustration = ({ stage = 'VEGETATIVE' }) => {
  const stageConfig = {
    GERMINATION: {
      color: '#a3e635', // Lime 400
      scale: 0.25,
      leaves: 1,
      glow: 'rgba(163, 230, 53, 0.2)'
    },
    SEEDLING: {
      color: '#4ade80', // Green 400
      scale: 0.45,
      leaves: 2,
      glow: 'rgba(74, 222, 128, 0.2)'
    },
    VEGETATIVE: {
      color: '#22c55e', // Green 500
      scale: 0.65,
      leaves: 4,
      glow: 'rgba(34, 197, 94, 0.2)'
    },
    FLOWERING: {
      color: '#84cc16', // Lime 500
      scale: 0.85,
      leaves: 5,
      hasFlowers: true,
      glow: 'rgba(132, 204, 22, 0.3)'
    },
    FRUITING: {
      color: '#10b981', // Emerald 500
      scale: 0.92,
      leaves: 6,
      hasFruits: true,
      glow: 'rgba(16, 185, 129, 0.3)'
    },
    HARVEST: {
      color: '#f59e0b', // Amber 500
      scale: 1.0,
      leaves: 6,
      isGolden: true,
      glow: 'rgba(245, 158, 11, 0.3)'
    }
  };

  const config = stageConfig[stage] || stageConfig.VEGETATIVE;

  return (
    <div className="relative w-full h-44 bg-slate-900/40 rounded-3xl border border-white/5 flex flex-col items-center justify-end pb-4 overflow-hidden group transition-all duration-1000">
      
      {/* Background Ambience */}
      <div 
        className="absolute inset-0 opacity-20 transition-colors duration-1000"
        style={{ background: `radial-gradient(circle at center bottom, ${config.glow}, transparent 70%)` }}
      />

      {/* Ground Line with subtle glow */}
      <div className="absolute bottom-6 left-8 right-8 h-[1px] bg-white/10" />
      
      {/* Plant SVG Wrapper */}
      <div 
        className="relative transition-all duration-1000 ease-in-out flex items-end justify-center"
        style={{ 
          height: '80%', 
          width: '100%',
          transform: `scale(${config.scale})`,
          transformOrigin: 'bottom center',
          willChange: 'transform, opacity'
        }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full preserve-3d">
          {/* Main Stalk - Curved for natural look */}
          <path
            d="M50 100 C48 70 45 40 50 10"
            stroke={config.color}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            className="transition-all duration-1000"
          />

          {/* Dynamic Leaves based on stage */}
          {config.leaves >= 1 && (
            <path d="M50 90 Q30 75 20 85" stroke={config.color} strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
          {config.leaves >= 2 && (
            <path d="M50 90 Q70 75 80 85" stroke={config.color} strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
          {config.leaves >= 4 && (
            <>
              <path d="M50 65 Q25 45 15 55" stroke={config.color} strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M50 65 Q75 45 85 55" stroke={config.color} strokeWidth="2" fill="none" strokeLinecap="round" />
            </>
          )}
          {config.leaves >= 6 && (
            <>
              <path d="M50 40 Q35 20 25 30" stroke={config.color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M50 40 Q65 20 75 30" stroke={config.color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* Flowering / Fruiting Details */}
          {(config.hasFlowers || config.hasFruits || config.isGolden) && (
            <g className="animate-pulse">
              <circle cx="50" cy="10" r="3" fill={config.isGolden ? '#fbbf24' : '#fef08a'} />
              <circle cx="55" cy="5" r="2" fill={config.isGolden ? '#f59e0b' : '#fff'} />
              <path d="M50 10 L55 5" stroke={config.color} strokeWidth="1" />
            </g>
          )}

          {/* "Magic Dust" particles for higher stages */}
          {(config.scale > 0.7) && Array.from({ length: 5 }).map((_, i) => (
            <circle
              key={i}
              cx={20 + Math.random() * 60}
              cy={20 + Math.random() * 60}
              r="0.8"
              fill="white"
              className="animate-pulse opacity-40"
              style={{ animationDelay: `${i * 0.5}s` }}
            />
          ))}
        </svg>
      </div>

      {/* Subtle indicator of health at bottom */}
      <div className="absolute bottom-2 flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div 
            key={i} 
            className="w-1 h-1 rounded-full bg-white/20" 
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
};

export default CropStageIllustration;

