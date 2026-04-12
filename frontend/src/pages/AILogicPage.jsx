import { useState, useEffect, useRef } from 'react';

// ─── Log Section Tags ──────────────────────────────────────────────────────────

const TAG_STYLES = {
  DATA_RECEIVED: {
    label: 'DỮ LIỆU ĐẦU VÀO',
    bg: '#1e3a5f',
    text: '#60a5fa',
    border: '#2563eb40',
    icon: '📡',
  },
  CONTEXT_MATCHED: {
    label: 'QUY TẮC KHỚP',
    bg: '#1a3a2a',
    text: '#4ade80',
    border: '#16a34a40',
    icon: '🔍',
  },
  AGENT_REASONING: {
    label: 'LUẬN GIẢI CỦA AI',
    bg: '#2d1f3a',
    text: '#c084fc',
    border: '#9333ea40',
    icon: '🧠',
  },
  FUNCTION_EXECUTION: {
    label: 'GỌI HÀM ĐIỀU KHIỂN',
    bg: '#3a2a1a',
    text: '#fb923c',
    border: '#ea580c40',
    icon: '⚡',
  },
};

// ─── Typing Effect Hook ────────────────────────────────────────────────────────

function useTypingEffect(text, speed = 18, active = false) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setDisplayed('');
      setDone(false);
      indexRef.current = 0;
      return;
    }
    setDisplayed('');
    setDone(false);
    indexRef.current = 0;

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed((prev) => prev + text[indexRef.current]);
        indexRef.current++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, active, speed]);

  return { displayed, done };
}

// ─── Individual Log Section ────────────────────────────────────────────────────

const LogSection = ({ type, content, visible, isTyping = false, typingText = '' }) => {
  const style = TAG_STYLES[type];
  const { displayed, done } = useTypingEffect(typingText, 20, isTyping && visible);

  if (!visible) return null;

  return (
    <div
      className="log-entry rounded-xl overflow-hidden"
      style={{ border: `1px solid ${style.border}`, background: style.bg }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5"
        style={{ background: 'rgba(0,0,0,0.2)', borderBottom: `1px solid ${style.border}` }}
      >
        <span className="text-base">{style.icon}</span>
        <span className="text-xs font-bold tracking-[0.15em]" style={{ color: style.text }}>
          [{style.label}]
        </span>
        <div className="ml-auto flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full opacity-40" style={{ background: style.text }} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 overflow-x-auto">
        {isTyping && visible ? (
          <p
            className="text-xs sm:text-sm leading-relaxed font-mono whitespace-pre-wrap"
            style={{ color: style.text }}
          >
            {displayed}
            {!done && <span className="typing-cursor" />}
          </p>
        ) : (
          <pre
            className="text-xs sm:text-sm leading-relaxed font-mono whitespace-pre-wrap break-words"
            style={{ color: style.text, margin: 0 }}
          >
            {content}
          </pre>
        )}
      </div>
    </div>
  );
};

// ─── Empty State ───────────────────────────────────────────────────────────────

const EmptyTerminal = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-4">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: 'rgba(47,160,132,0.15)', border: '1px solid rgba(47,160,132,0.2)' }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2FA084" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    </div>
    <div className="text-center">
      <p className="font-semibold text-sm" style={{ color: '#4ade80' }}>Terminal Sẵn Sàng</p>
      <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
        Kích hoạt SalinAI Agentic từ tab{' '}
        <span style={{ color: '#2FA084' }}>Mô Phỏng</span> để xem nhật ký.
      </p>
    </div>
    {/* Blinking cursor line */}
    <div className="flex items-center gap-2 mt-2">
      <span style={{ color: '#2FA084', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
        $
      </span>
      <span
        className="w-2 h-4 rounded-sm inline-block"
        style={{ background: '#2FA084', animation: 'typing-cursor 1s ease-in-out infinite' }}
      />
    </div>
  </div>
);

// ─── Main AILogicPage ──────────────────────────────────────────────────────────

export default function AILogicPage({ lastTriggerData }) {
  const [logs, setLogs] = useState([]);
  const [visibleSections, setVisibleSections] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [timestamp, setTimestamp] = useState('');
  const logContainerRef = useRef(null);

  // Scroll to bottom when new log appears
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [visibleSections]);

  // When a new trigger comes in from the Simulator
  useEffect(() => {
    if (!lastTriggerData) return;

    const { salinityLevel, weatherCondition, valveOpen } = lastTriggerData;
    const ts = new Date().toISOString();
    setTimestamp(ts);
    setIsRunning(true);
    setRunCount((c) => c + 1);

    // Reset
    setVisibleSections({});
    setLogs([]);

    const roundedSalinity = parseFloat(salinityLevel.toFixed(2));
    const isSafe = valveOpen;

    // Determine matched rule
    let matchedRule = '';
    if (roundedSalinity <= 4 && weatherCondition === 'Sunny') {
      matchedRule = 'QUY_TẮc_01: độ_mặn <= 4‰ VÀ thời_tiết == "Nắng" → MỞ_VAN';
    } else if (roundedSalinity <= 6 && weatherCondition === 'Sunny') {
      matchedRule = 'QUY_TẮc_02: 4 < độ_mặn <= 6‰ VÀ thời_tiết == "Nắng" → MỞ_VAN (có điều kiện)';
    } else if (weatherCondition === 'Heavy Rain') {
      matchedRule = 'QUY_TẮc_03: thời_tiết == "Mưa To" → ĐÓNG_VAN (nguy cơ ngập lụt)';
    } else if (weatherCondition === 'Drought') {
      matchedRule = 'QUY_TẮc_04: thời_tiết == "Hạn Hán" → ĐÓNG_VAN (bảo tồn nước)';
    } else {
      matchedRule = 'QUY_TẮc_05: độ_mặn > 6‰ → ĐÓNG_VAN (nguy cơ tổn thương mùa vụ)';
    }

    const reasoningText = isSafe
      ? `Đang phân tích điều kiện đồng ruộng hiện tại...

Số liệu độ mặn ${roundedSalinity}‰ nằm trong ngưỡng chấp nhận được cho tưới tiêu (tối đa 4.0‰ để lúa phát triển tốt nhất). Điều kiện thời tiết hiện tại (${weatherCondition}) không gây nguy cơ ngập lụt hay hạn hán.

Đối chiếu với dữ liệu lịch sử của mảnh ruộng này:
→ Điều kiện tương tự ngày 14/03/2024: đã mở van, năng suất tăng +12%
→ Điều kiện tương tự ngày 22/07/2024: đã mở van, không có thiệt hại mùa vụ

Độ tin cậy: 94.7%

Quyết định: MỞ VAN. Điều kiện đang tối ưu cho việc tưới tiêu. Nông dân có thể tiến hành tưới theo lịch định.`
      : `Đang phân tích điều kiện đồng ruộng hiện tại...

Số liệu độ mặn ${roundedSalinity}‰ ${roundedSalinity > 6 ? 'vượt ngưỡng an toàn (tối đa 6.0‰)' : 'trong mức chấp nhận, TUY NHIÊN'}. Điều kiện thời tiết "${weatherCondition}" ${weatherCondition === 'Heavy Rain' ? 'gây nguy cơ cao ngập lụt và rửa trôi đất' : weatherCondition === 'Drought' ? 'cho thấy thiếu nước — tưới lúc này lãng phí và không hiệu quả' : 'kết hợp với độ mặn cao gây nguy hại cho mùa vụ'}.

Đánh giá rủi ro:
→ Xác suất thiệt hại cây trồng: ${roundedSalinity > 8 ? '87%' : '65%'}
→ Dự đoán giảm năng suất nếu tưới: ~${roundedSalinity > 8 ? '35-50%' : '15-30%'}

Độ tin cậy: 96.2%

Quyết định: ĐÓNG VAN. Không khuyến cáo tưới tiêu trong điều kiện hiện tại.`;

    const functionCall = isSafe
      ? `dieu_khien_van(hanh_dong="MO", van_id="CANH_DONG_01_CHINH", thoi_gian_phut=45, luu_luong_L_phut=12.5)`
      : `dieu_khien_van(hanh_dong="DONG", van_id="CANH_DONG_01_CHINH", canh_bao_nong_dan=True, ly_do="${weatherCondition === 'Heavy Rain' ? 'nguy_co_ngap_lut' : weatherCondition === 'Drought' ? 'bao_ton_nuoc_han_han' : 'do_man_cao'}")`;

    // Build all log data
    const allLogs = [
      {
        id: 'DATA_RECEIVED',
        content: JSON.stringify({
          timestamp: ts,
          sensor_id: 'SALIN-CẢM-BIẾN-001',
          field_id: 'CANH_DONG_01',
          payload: {
            salinity_ppt: roundedSalinity,
            weather_condition: weatherCondition,
            temperature_c: weatherCondition === 'Sunny' ? 32.4 : weatherCondition === 'Heavy Rain' ? 24.1 : 38.6,
            humidity_pct: weatherCondition === 'Sunny' ? 65 : weatherCondition === 'Heavy Rain' ? 92 : 28,
            soil_moisture: weatherCondition === 'Drought' ? 12 : 55,
          },
          agent: 'SalinAI-v2.1',
        }, null, 2),
      },
      {
        id: 'CONTEXT_MATCHED',
        content: `Nội Dung Hệ Thống (System Prompt):\n─────────────────────────────────\n"Bạn là SalinAI, một AI Agentic thông minh kiểm soát tưới tiêu. Nhiệm vụ của bạn là phân tích dữ liệu cảm biến thời gian thực và đưa ra quyết định an toàn, dựa trên dữ liệu về việc kiểm soát van tưới tiêu.\n\nQuy TẮc An Toàn:\n  QUY_TẮc_01: độ_mặn <= 4‰ VÀ nắng   → MỞ\n  QUY_TẮc_02: 4 < độ_mặn <= 6‰ + nắng → MỞ (theo dõi)\n  QUY_TẮc_03: Mưa To                  → ĐÓNG  \n  QUY_TẮc_04: Hạn Hán                 → ĐÓNG  \n  QUY_TẮc_05: độ_mặn > 6‰             → ĐÓNG"\n─────────────────────────────────\nKhớp: ${matchedRule}\nĐộ ưu tiên: CAO\nYêu cầu lệnh ghi đè: không`,
      },
      {
        id: 'AGENT_REASONING',
        isTyping: true,
        content: reasoningText,
      },
      {
        id: 'FUNCTION_EXECUTION',
        content: `> Gọi hàm: dieu_khien_van()\n> ${functionCall}\n\n✓ Cổng IoT: CANH_DONG_01_CHINH đã xác nhận\n✓ Trạng thái van vật lý: ${isSafe ? 'ĐÃ MỞ' : 'ĐÃ ĐÓNG'}\n✓ Mã xác nhận: van_ack_${Math.random().toString(36).substring(2, 9).toUpperCase()}\n✓ Thông báo SMS gửi nông dân: ĐÃ GỬi\n\nThời gian thực thi: ${(120 + Math.random() * 80).toFixed(0)}ms\nTrạng thái: THÀNH CÔNG`,
      },
    ];

    setLogs(allLogs);

    // Reveal sections with delays
    const delays = [0, 1000, 2200, 5500];
    allLogs.forEach((log, i) => {
      setTimeout(() => {
        setVisibleSections((prev) => ({ ...prev, [log.id]: true }));
        if (i === allLogs.length - 1) {
          setIsRunning(false);
        }
      }, delays[i]);
    });
  }, [lastTriggerData]);

  const hasLogs = logs.length > 0;

  return (
    <div className="min-h-[calc(100vh-64px)] py-6 px-4 sm:px-6 lg:px-8" style={{ background: '#EEEEEE' }}>
      <div className="max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-widest"
              style={{ background: '#1F6F5F20', color: '#1F6F5F' }}
            >
              Góc Nhìn Ban Giám Khảo
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold leading-tight" style={{ color: '#1F6F5F' }}>
            Bảng Điều Khiển Logic AI
          </h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            Xem theo thời gian thực quy trình ra quyết định của SalinAI — từ dữ liệu cảm biến đến điều khiển van.
          </p>
        </div>

        {/* Terminal Window */}
        <div
          className="rounded-2xl overflow-hidden shadow-xl"
          style={{ border: '1px solid #1F6F5F30' }}
        >
          {/* Terminal Title Bar */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: '#0f1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2">
              {/* Traffic lights */}
              <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
              <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-80" />
              <div className="w-3 h-3 rounded-full bg-green-400 opacity-80" />
              <span
                className="ml-3 text-xs font-mono hidden sm:block"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                salinai@agent ~ /nhat-ky-suy-luan
              </span>
            </div>
            <div className="flex items-center gap-3">
              {isRunning && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#2FA084' }} />
                  <span style={{ color: '#2FA084', fontSize: '11px', fontFamily: 'monospace' }}>
                    ĐANG XỬ LÝ
                  </span>
                </div>
              )}
              {!isRunning && hasLogs && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: '#6FCF97' }} />
                  <span style={{ color: '#6FCF97', fontSize: '11px', fontFamily: 'monospace' }}>
                    XONG — Lần chạy #{runCount}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Terminal Body */}
          <div
            ref={logContainerRef}
            className="overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4"
            style={{
              background: '#111827',
              minHeight: '500px',
              maxHeight: '70vh',
            }}
          >
            {/* Prompt line */}
            <div className="flex items-center gap-2 font-mono text-xs sm:text-sm mb-2">
              <span style={{ color: '#2FA084' }}>salinai</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>@</span>
              <span style={{ color: '#60a5fa' }}>agent</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>:~$</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                {hasLogs ? `chay_agent --thoi-diem ${timestamp}` : 'dang cho lenh...'}
              </span>
            </div>

            {!hasLogs ? (
              <EmptyTerminal />
            ) : (
              <>
                {logs.map((log) => (
                  <LogSection
                    key={log.id}
                    type={log.id}
                    content={log.content}
                    visible={!!visibleSections[log.id]}
                    isTyping={!!log.isTyping}
                    typingText={log.isTyping ? log.content : ''}
                  />
                ))}

                {!isRunning && hasLogs && (
                  <div className="log-entry flex items-center gap-2 font-mono text-xs pt-2">
                    <span style={{ color: '#6FCF97' }}>✓</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Agent hoàn thành sau ~5.2 giây · Mã thoát: 0
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Terminal Footer */}
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ background: '#0f1117', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-3">
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontFamily: 'monospace' }}>
                SalinAI v2.1 · Node: LLM-GEMINI-FLASH
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontFamily: 'monospace' }}>
                {runCount > 0 ? `${runCount} lần chạy` : 'chờ'}
              </span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(TAG_STYLES).map(([key, style]) => (
            <div
              key={key}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ background: 'white', border: `1px solid ${style.border}` }}
            >
              <span className="text-sm">{style.icon}</span>
              <div>
                <p className="text-xs font-bold leading-tight" style={{ color: style.text, filter: 'brightness(0.8)' }}>
                  {style.label}
                </p>
                <p className="text-xs text-gray-400 leading-tight">
                  {key === 'DATA_RECEIVED' && 'Dữ liệu cảm biến đầu vào'}
                  {key === 'CONTEXT_MATCHED' && 'Quy tắc được kích hoạt'}
                  {key === 'AGENT_REASONING' && 'Suy luận của LLM'}
                  {key === 'FUNCTION_EXECUTION' && 'Gọi hàm IoT'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
