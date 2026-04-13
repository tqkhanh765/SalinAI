export const NAV_TABS = [
  {
    id: 'dashboard',
    label: 'Bảng Điều Khiển',
    sublabel: 'Nông Dân',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'simulator',
    label: 'Mô Phỏng',
    sublabel: 'Mô Phỏng + Hậu Trường',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20" />
        <path d="M5 9l7-7 7 7" />
        <path d="M5 15l7 7 7-7" />
      </svg>
    ),
  },
];
