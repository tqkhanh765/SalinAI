import React, { useState, useEffect } from 'react';
import axios from 'axios';

const IrrigationPlanPanel = () => {
    const [planData, setPlanData] = useState(null);
    const [loading, setLoading] = useState(true);

    const isToday = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const today = new Date();
        return (
            d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear()
        );
    };

    const fetchPlan = async () => {
        try {
            const response = await axios.get('http://localhost:3001/api/irrigation-plan');
            setPlanData(response.data);
        } catch (err) {
            console.error('Failed to fetch irrigation plan:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlan();
        
        // Tối ưu hóa tần suất gọi API:
        // - Nếu là ngày cũ: gọi mỗi 10 giây để chờ AI lập kế hoạch mới.
        // - Nếu đã là ngày mới: chỉ gọi lại sau mỗi 4 tiếng (14,400,000ms).
        const isStale = !planData || !isToday(planData.created_at);
        const pollInterval = isStale ? 10000 : 14400000;
        
        const interval = setInterval(fetchPlan, pollInterval);
        return () => clearInterval(interval);
    }, [planData?.created_at]);

    if (loading) return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#1F6F5F15] animate-pulse">
            <div className="h-6 w-48 bg-gray-200 rounded mb-4"></div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[1,2,3,4,5].map(i => <div key={i} className="h-32 bg-gray-100 rounded-xl"></div>)}
            </div>
        </div>
    );
    
    if (!planData || !planData.plan) return null;

    const getRiskStyles = (level) => {
        switch (level) {
            case 'HIGH': return { color: '#EB5757', bg: '#EB575715', label: 'RỦI RO CAO' };
            case 'MEDIUM': return { color: '#F2994A', bg: '#F2994A15', label: 'TRUNG BÌNH' };
            case 'LOW': return { color: '#2FA084', bg: '#2FA08415', label: 'AN TOÀN' };
            default: return { color: '#9ca3af', bg: '#f3f4f6', label: 'CHƯA RÕ' };
        }
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        const day = d.getDate();
        const weekday = d.toLocaleDateString('vi-VN', { weekday: 'short' });
        return { day, weekday };
    };

    const planDateObj = new Date(planData.created_at);
    const planStale = !isToday(planData.created_at);

    return (
        <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-[#1F6F5F15] transition-all">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner" 
                         style={{ background: 'linear-gradient(135deg, #1F6F5F 0%, #2FA084 100%)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-extrabold" style={{ color: '#1F6F5F' }}>Kế hoạch Tưới tiêu Chủ động</h2>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-0.5">Dự báo 5 ngày tới bởi SalinAI Brain</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-[10px] text-gray-400 font-bold uppercase text-right">Thời điểm lập kế hoạch</p>
                        <p className="text-sm font-extrabold text-[#1F6F5F]">
                            {planDateObj.toLocaleDateString('vi-VN')} - {planDateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                {planData.plan.map((day, idx) => {
                    const { day: dNum, weekday } = formatDate(day.date);
                    const styles = getRiskStyles(day.risk_level);
                    const isDayToday = isToday(day.date);
                    
                    return (
                        <div 
                            key={idx}
                            className="relative overflow-hidden rounded-2xl border transition-all duration-300 hover:shadow-md hover:-translate-y-1 group"
                            style={{ borderColor: isDayToday ? '#1F6F5F30' : '#1F6F5F10', background: isDayToday ? '#F8FBFA' : '#FFFFFF' }}
                        >
                            {/* Header Day */}
                            <div className="p-4 pb-2 flex justify-between items-start">
                                <div className="text-center">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">{weekday}</p>
                                    <p className="text-2xl font-black mt-1" style={{ color: '#1F6F5F' }}>{dNum}</p>
                                </div>
                                <div className="px-2 py-1 rounded-lg text-[9px] font-black tracking-tighter"
                                     style={{ color: styles.color, background: styles.bg }}>
                                    {styles.label}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-4 pb-4">
                                <div className="h-[2px] w-8 mb-3 rounded-full" style={{ background: styles.color }}></div>
                                <p className="text-[13px] font-bold text-gray-700 leading-snug mb-2 group-hover:text-black">
                                    {day.recommendation}
                                </p>
                                <p className="text-[11px] text-gray-400 leading-relaxed italic border-t border-gray-50 pt-2 mt-2">
                                    {day.reason}
                                </p>
                            </div>
                            
                            {isDayToday && (
                                <div className="absolute top-0 right-0">
                                    <div className="bg-[#1F6F5F] text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase">Hôm nay</div>
                                </div>
                            )}
                            {idx === 0 && !isDayToday && (
                                <div className="absolute top-0 right-0">
                                    <div className="bg-[#EB5757] text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase">Ngày cũ</div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default IrrigationPlanPanel;
