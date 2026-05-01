/**
 * CROP CONFIGURATION & PROFILES
 * 
 * Tác dụng: Quản lý danh sách các giai đoạn sinh trưởng của lúa và các ngưỡng 
 * an toàn (mặn, ẩm, mục tiêu) tương ứng cho từng giai đoạn. 
 * Được sử dụng bởi Outcome Service (để chấm điểm) và Mapper (để kiểm tra dữ liệu).
 */

const CROP_STAGES = [
    "GERMINATION",
    "SEEDLING",
    "VEGETATIVE",
    "FLOWERING", // Added matching outcomeService
    "HARVEST",   // Added matching outcomeService
];

const DEFAULT_STAGE_PROFILE = {
    moistureTarget: { min: 40, max: 80, ideal: 60 },
    salinityMaxSafe: 6.0,
    salinityDeltaTolerance: 0.5,
    weights: {
        moisture: 0.7,
        salinity: 0.3,
    },
};

const CROP_STAGE_PROFILES = {
    GERMINATION: {
        moistureTarget: { min: 60, max: 90, ideal: 75 },
        salinityMaxSafe: 1.5,
        salinityDeltaTolerance: 0.2,
        weights: { moisture: 0.8, salinity: 0.2 },
    },
    SEEDLING: {
        moistureTarget: { min: 55, max: 85, ideal: 70 },
        salinityMaxSafe: 2.0,
        salinityDeltaTolerance: 0.3,
        weights: { moisture: 0.8, salinity: 0.2 },
    },
    VEGETATIVE: {
        moistureTarget: { min: 45, max: 80, ideal: 62 },
        salinityMaxSafe: 2.5,
        salinityDeltaTolerance: 0.4,
        weights: { moisture: 0.75, salinity: 0.25 },
    },
    FLOWERING: {
        moistureTarget: { min: 50, max: 82, ideal: 66 },
        salinityMaxSafe: 1.5,
        salinityDeltaTolerance: 0.3,
        weights: { moisture: 0.78, salinity: 0.22 },
    },
    HARVEST: {
        moistureTarget: { min: 35, max: 70, ideal: 52 },
        salinityMaxSafe: 3.0,
        salinityDeltaTolerance: 0.5,
        weights: { moisture: 0.65, salinity: 0.35 },
    },
};

module.exports = {
    CROP_STAGES,
    DEFAULT_STAGE_PROFILE,
    CROP_STAGE_PROFILES,
};
