export const SalinityIcon = ({ color = '#2FA084', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    <path d="M12 7v10" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="2" fill={color} />
  </svg>
);

export const TemperatureIcon = ({ color = '#F2994A', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    <circle cx="11.5" cy="17.5" r="2.5" fill={color} />
  </svg>
);

export const HumidityIcon = ({ color = '#2FA084', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    <path d="M12 7c-2 3-2 5 0 8" strokeDasharray="2 2" />
    <path d="M12 7c2 3 2 5 0 8" strokeDasharray="2 2" />
  </svg>
);

export const SoilMoistureIcon = ({ color = '#6FCF97', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v6" strokeDasharray="2 2" />
    <path d="M8 12h8" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="2" fill={color} />
  </svg>
);

export const PhIcon = ({ color = '#9B59B6', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 10v8" />
    <path d="M15 10v8" />
    <path d="M9 6a3 3 0 0 1 3 3v1" />
    <path d="M15 6a3 3 0 0 0-3 3v1" />
    <circle cx="12" cy="10" r="1" fill={color} />
  </svg>
);

export const RainIcon = ({ color = '#2D9CDB', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
    <line x1="16" y1="13" x2="16" y2="21" />
    <line x1="8" y1="13" x2="8" y2="21" />
    <line x1="12" y1="15" x2="12" y2="23" />
  </svg>
);

export const TideIcon = ({ color = '#1F6F5F', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" />
    <path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" />
    <path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0 4 2 6 0" />
  </svg>
);

export const CropStageIcon = ({ color = '#1F6F5F', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 20h10" />
    <path d="M10 20c5.5-2.5.8-6.4 3-10" />
    <path d="M14 20c-5.5-2.5-.8-6.4-3-10" />
    <path d="M12 4c-1-1-2-2-2-4" />
    <path d="M12 4c1-1 2-2 2-4" />
    <circle cx="12" cy="10" r="1" fill={color} />
  </svg>
);

export const WaterLevelIcon = ({ color = '#56CCF2', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16" />
    <path d="M4 16c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
    <path d="M4 12c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
    <path d="M4 8c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />
  </svg>
);

export const WeatherIcon = ({ color = '#1F6F5F', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

export const ValveIcon = ({ color = '#2FA084', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="M9 12l2 2 4-4" />
    <path d="M12 8v8" strokeDasharray="2 2" />
  </svg>
);

export const ControlModeIcon = ({ color = '#1F6F5F', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
    <circle cx="6" cy="6" r="1" fill={color} />
    <circle cx="12" cy="15" r="1" fill={color} />
  </svg>
);

export const AiStatusIcon = ({ color = '#2FA084', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72v5.56l4.5 2.6c.9.52 1.5 1.48 1.5 2.56V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-4.56c0-1.08.6-2.04 1.5-2.56l4.5-2.6V5.72c-.6-.34-1-.98-1-1.72a2 2 0 0 1 2-2z" />
    <circle cx="12" cy="20" r="1" fill={color} />
  </svg>
);

export const ControlScopeIcon = ({ color = '#1F6F5F', size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" fill={color} />
  </svg>
);
