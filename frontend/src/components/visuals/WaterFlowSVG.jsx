import React from 'react';

/**
 * WaterFlowSVG component
 * Animates water flow through a pipe using SVG stroke-dashoffset.
 * @param {boolean} isOpen - Whether the valve is open and flowing.
 */
const WaterFlowSVG = ({ isOpen = false }) => {
  return (
    <div className="relative w-full h-24 bg-slate-900/40 rounded-xl border border-white/5 overflow-hidden flex items-center justify-center group">
      {/* Pipe Background */}
      <svg
        viewBox="0 0 400 100"
        className="w-full h-full preserve-3d"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main Pipe Structure */}
        <path
          d="M0 50 H400"
          stroke="#334155"
          strokeWidth="12"
          strokeLinecap="round"
        />
        
        {/* Water Flow Path */}
        <path
          d="M0 50 H400"
          stroke={isOpen ? "#38bdf8" : "transparent"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="10 10"
          className={isOpen ? "animate-[waterFlow_1s_linear_infinite]" : ""}
          style={{
            filter: "drop-shadow(0 0 8px #0ea5e9)",
            transition: "stroke 0.5s ease"
          }}
        />

        {/* Valve Icon in the middle */}
        <circle
          cx="200"
          cy="50"
          r="16"
          fill={isOpen ? "#0ea5e9" : "#475569"}
          className="transition-colors duration-500"
        />
        <path
          d="M190 50 L210 50 M200 40 L200 60"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          className={`transition-transform duration-500 origin-center ${isOpen ? 'rotate-45' : 'rotate-0'}`}
        />
      </svg>

      {/* Label Overlay */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-sky-400 animate-pulse' : 'bg-slate-500'}`} />
        <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">
          {isOpen ? 'Water Flowing' : 'Valve Closed'}
        </span>
      </div>

      {/* Glow Effect when Open */}
      {isOpen && (
        <div className="absolute inset-0 bg-sky-500/5 pointer-events-none animate-pulse" />
      )}
    </div>
  );
};

export default WaterFlowSVG;
