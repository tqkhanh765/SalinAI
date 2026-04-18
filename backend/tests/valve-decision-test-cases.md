# Comprehensive Valve Decision Test Cases

Based on the decision rules in `/backend/agent/prompt.js` (orchestratorPromptTemplate) and fallback rules in `/backend/agent/agentUtils.js`.

## Decision Rules Summary

**Priority Order:**
1. SAFETY FIRST: If any guideline says "CLOSE", strongly consider it
2. RAINFALL ALERT: If rainfall_24h > 40mm → CLOSE (prevent flooding)
3. TIDE ALERT: If tide RISING AND salinity > 1.0 → CLOSE (prevent salt intrusion)
4. HUMIDITY/MOLD: If humidity > 80% AND moisture > 75% → CLOSE or NO_ACTION (reduce disease)
5. DROUGHT: If rainfall < 2mm AND water_level LOW AND moisture < 40% → OPEN (save crop)
6. DEFAULT: SALINITY CHECK: If salinity > 2.0 → CLOSE, Else → OPEN

**Fallback Rule:** If salinity >= 2.0 → CLOSE, Else → OPEN

**Control Modes:** AUTO, MANUAL
**Valve States:** OPEN, CLOSED, NO_ACTION
**Crop Stages:** SEEDLING, VEGETATIVE, FLOWERING, FRUITING, HARVEST

---

## Test Cases

### Category 1: Default Salinity Check (Rule 6)

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-001 | Safe salinity | salinity=1.0, moisture=50, control_mode=AUTO | OPEN | Salinity below 2.0 threshold |
| TC-002 | High salinity | salinity=2.5, moisture=50, control_mode=AUTO | CLOSED | Salinity exceeds 2.0 threshold |
| TC-003 | Boundary - exactly 2.0 | salinity=2.0, moisture=50, control_mode=AUTO | CLOSED | Salinity at threshold (>= 2.0) |
| TC-004 | Boundary - just below 2.0 | salinity=1.99, moisture=50, control_mode=AUTO | OPEN | Salinity just below threshold |
| TC-005 | Extreme high salinity | salinity=10.0, moisture=50, control_mode=AUTO | CLOSED | Extreme salinity danger |
| TC-006 | Very low salinity | salinity=0.1, moisture=50, control_mode=AUTO | OPEN | Very safe salinity level |

### Category 2: Rainfall Alert (Rule 2)

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-007 | Heavy rain | rainfall_24h=50mm, salinity=1.0, control_mode=AUTO | CLOSED | Rainfall > 40mm threshold |
| TC-008 | Light rain | rainfall_24h=30mm, salinity=1.0, control_mode=AUTO | OPEN | Rainfall below 40mm threshold |
| TC-009 | Boundary - exactly 40mm | rainfall_24h=40mm, salinity=1.0, control_mode=AUTO | CLOSED | Rainfall at threshold (>= 40mm) |
| TC-010 | Boundary - just below 40mm | rainfall_24h=39.9mm, salinity=1.0, control_mode=AUTO | OPEN | Rainfall just below threshold |
| TC-011 | Extreme rainfall | rainfall_24h=100mm, salinity=1.0, control_mode=AUTO | CLOSED | Extreme flooding risk |
| TC-012 | Rain + high salinity | rainfall_24h=50mm, salinity=3.0, control_mode=AUTO | CLOSED | Both rainfall and salinity risks |
| TC-013 | Rain + low salinity | rainfall_24h=50mm, salinity=0.5, control_mode=AUTO | CLOSED | Rainfall takes priority over salinity |
| TC-014 | No rain data | rainfall_24h=null, salinity=1.0, control_mode=AUTO | OPEN | No rainfall data, default to salinity check |

### Category 3: Tide Alert (Rule 3)

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-015 | Rising tide + high salinity | tide=RISING, salinity=1.5, control_mode=AUTO | CLOSED | Tide rising + salinity > 1.0 |
| TC-016 | Rising tide + low salinity | tide=RISING, salinity=0.5, control_mode=AUTO | OPEN | Tide rising but salinity safe |
| TC-017 | Falling tide + high salinity | tide=FALLING, salinity=1.5, control_mode=AUTO | OPEN | Tide not rising |
| TC-018 | Boundary - salinity exactly 1.0 | tide=RISING, salinity=1.0, control_mode=AUTO | CLOSED | Salinity at threshold (>= 1.0) |
| TC-019 | Boundary - salinity just below 1.0 | tide=RISING, salinity=0.99, control_mode=AUTO | OPEN | Salinity just below threshold |
| TC-020 | No tide data + high salinity | tide=null, salinity=1.5, control_mode=AUTO | CLOSED | No tide data, default to salinity check |
| TC-021 | Tide + rain + salinity | tide=RISING, rainfall=50mm, salinity=1.5, control_mode=AUTO | CLOSED | Multiple risk factors |

### Category 4: Humidity/Mold (Rule 4)

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-022 | High humidity + high moisture | humidity=85%, moisture=80%, control_mode=AUTO | CLOSED or NO_ACTION | Mold risk prevention |
| TC-023 | High humidity + low moisture | humidity=85%, moisture=60%, control_mode=AUTO | OPEN | Moisture not excessive |
| TC-024 | Low humidity + high moisture | humidity=70%, moisture=80%, control_mode=AUTO | OPEN | Humidity not excessive |
| TC-025 | Boundary - humidity exactly 80% | humidity=80%, moisture=80%, control_mode=AUTO | CLOSED or NO_ACTION | Humidity at threshold |
| TC-026 | Boundary - humidity just below 80% | humidity=79%, moisture=80%, control_mode=AUTO | OPEN | Humidity just below threshold |
| TC-027 | Boundary - moisture exactly 75% | humidity=85%, moisture=75%, control_mode=AUTO | CLOSED or NO_ACTION | Moisture at threshold |
| TC-028 | Boundary - moisture just below 75% | humidity=85%, moisture=74%, control_mode=AUTO | OPEN | Moisture just below threshold |
| TC-029 | Extreme humidity + extreme moisture | humidity=95%, moisture=90%, control_mode=AUTO | CLOSED or NO_ACTION | Extreme mold risk |

### Category 5: Drought (Rule 5)

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-030 | Drought conditions | rainfall=1mm, water_level=LOW, moisture=35%, control_mode=AUTO | OPEN | Crop needs water |
| TC-031 | Sufficient rain | rainfall=5mm, water_level=LOW, moisture=35%, control_mode=AUTO | OPEN | Rainfall adequate |
| TC-032 | Adequate water level | rainfall=1mm, water_level=NORMAL, moisture=35%, control_mode=AUTO | OPEN | Water level adequate |
| TC-033 | Adequate moisture | rainfall=1mm, water_level=LOW, moisture=50%, control_mode=AUTO | OPEN | Moisture adequate |
| TC-034 | Boundary - rainfall exactly 2mm | rainfall=2mm, water_level=LOW, moisture=35%, control_mode=AUTO | OPEN | Rainfall at threshold (>= 2mm) |
| TC-035 | Boundary - rainfall just below 2mm | rainfall=1.9mm, water_level=LOW, moisture=35%, control_mode=AUTO | OPEN | Rainfall just below threshold |
| TC-036 | Boundary - moisture exactly 40% | rainfall=1mm, water_level=LOW, moisture=40%, control_mode=AUTO | OPEN | Moisture at threshold |
| TC-037 | Boundary - moisture just below 40% | rainfall=1mm, water_level=LOW, moisture=39%, control_mode=AUTO | OPEN | Moisture just below threshold |
| TC-038 | Extreme drought | rainfall=0mm, water_level=CRITICAL, moisture=20%, control_mode=AUTO | OPEN | Critical crop rescue |

### Category 6: Manual Override

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-039 | Manual mode + high salinity | salinity=3.0, control_mode=MANUAL | NO_ACTION (blocked) | Manual override blocks AI |
| TC-040 | Manual mode + heavy rain | rainfall=50mm, control_mode=MANUAL | NO_ACTION (blocked) | Manual override blocks AI |
| TC-041 | Auto mode + high salinity | salinity=3.0, control_mode=AUTO | CLOSED | Auto mode allows AI decision |
| TC-042 | Switch from manual to auto | salinity=3.0, control_mode=AUTO (was MANUAL) | CLOSED | Auto mode restored, AI decides |
| TC-043 | Manual mode + drought | rainfall=1mm, water_level=LOW, moisture=35%, control_mode=MANUAL | NO_ACTION (blocked) | Manual override blocks AI |

### Category 7: Crop Stage Variations

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-044 | Seedling + moderate salinity | salinity=1.2, crop_stage=SEEDLING, control_mode=AUTO | CLOSED | Seedlings more sensitive (safe < 1.5) |
| TC-045 | Vegetative + moderate salinity | salinity=1.2, crop_stage=VEGETATIVE, control_mode=AUTO | OPEN | Vegetative can tolerate (safe < 2.0) |
| TC-046 | Flowering + high salinity | salinity=2.5, crop_stage=FLOWERING, control_mode=AUTO | CLOSED | Exceeds safe threshold |
| TC-047 | Fruiting + moderate salinity | salinity=1.8, crop_stage=FRUITING, control_mode=AUTO | OPEN | Within safe threshold |
| TC-048 | Harvest + any salinity | salinity=3.0, crop_stage=HARVEST, control_mode=AUTO | CLOSED | High salinity always unsafe |
| TC-049 | Seedling + rain | rainfall=50mm, crop_stage=SEEDLING, control_mode=AUTO | CLOSED | Rainfall risk for seedlings |
| TC-050 | Seedling + drought | rainfall=1mm, water_level=LOW, moisture=35%, crop_stage=SEEDLING, control_mode=AUTO | OPEN | Seedlings need water |

### Category 8: Edge Cases - Multiple Risk Factors

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-051 | Rain + Tide + Salinity | rainfall=50mm, tide=RISING, salinity=1.5, control_mode=AUTO | CLOSED | All three risk factors |
| TC-052 | Rain + Humidity + Moisture | rainfall=50mm, humidity=85%, moisture=80%, control_mode=AUTO | CLOSED | Multiple risk factors |
| TC-053 | Tide + Humidity + Moisture | tide=RISING, humidity=85%, moisture=80%, salinity=1.2, control_mode=AUTO | CLOSED | Multiple risk factors |
| TC-054 | Drought + High Salinity | rainfall=1mm, water_level=LOW, moisture=35%, salinity=2.5, control_mode=AUTO | CLOSED | Salinity danger overrides drought |
| TC-055 | Drought + Moderate Salinity | rainfall=1mm, water_level=LOW, moisture=35%, salinity=1.5, control_mode=AUTO | OPEN | Drought takes priority over moderate salinity |
| TC-056 | All safe conditions | rainfall=10mm, tide=FALLING, humidity=70%, moisture=50%, salinity=1.0, control_mode=AUTO | OPEN | All conditions safe |
| TC-057 | All dangerous conditions | rainfall=100mm, tide=RISING, humidity=90%, moisture=85%, salinity=3.0, control_mode=AUTO | CLOSED | Extreme danger |

### Category 9: Fallback Scenarios

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-058 | AI quota error + high salinity | salinity=2.5, AI quota exceeded | CLOSED | Fallback: salinity >= 2.0 |
| TC-059 | AI timeout + low salinity | salinity=1.0, AI timeout | OPEN | Fallback: salinity < 2.0 |
| TC-060 | MongoDB disconnected + high salinity | salinity=2.5, MongoDB down | CLOSED | Fallback: salinity >= 2.0 |
| TC-061 | Agent failure + boundary salinity | salinity=2.0, agent failure | CLOSED | Fallback: salinity >= 2.0 |
| TC-062 | No tool action returned + low salinity | salinity=1.5, no tool action | OPEN | Fallback: salinity < 2.0 |

### Category 10: AI Trigger Thresholds

| Test ID | Scenario | Input Conditions | Expected AI Trigger | Reason |
|---------|----------|------------------|---------------------|--------|
| TC-063 | Salinity delta trigger | previous salinity=1.0, current salinity=1.6, delta=0.6 | TRIGGERED | Delta > 0.5 threshold |
| TC-064 | Salinity delta no trigger | previous salinity=1.0, current salinity=1.4, delta=0.4 | NOT TRIGGERED | Delta <= 0.5 threshold |
| TC-065 | Moisture delta trigger | previous moisture=50, current moisture=65, delta=15 | TRIGGERED | Delta > 10 threshold |
| TC-066 | Moisture delta no trigger | previous moisture=50, current moisture=58, delta=8 | NOT TRIGGERED | Delta <= 10 threshold |
| TC-067 | Initial data point | no previous data, current salinity=1.0 | TRIGGERED | First data point always triggers |
| TC-068 | Extreme weather trigger | weather_code=96, previous weather_code=0 | TRIGGERED | Weather code >= 95 |
| TC-069 | Extreme rainfall trigger | rainfall_24h=15mm, previous rainfall=5mm | TRIGGERED | Rainfall > 10mm threshold |
| TC-070 | Weather changed + extreme | weather_code changed from 0 to 95 | TRIGGERED | Extreme weather + change |

### Category 11: Data Validation Edge Cases

| Test ID | Scenario | Input Conditions | Expected Result | Reason |
|---------|----------|------------------|----------------|--------|
| TC-071 | Invalid salinity (zero) | salinity=0, moisture=50 | REJECTED | Salinity must be > 0 |
| TC-072 | Invalid salinity (negative) | salinity=-1, moisture=50 | REJECTED | Negative error code |
| TC-073 | Invalid moisture (zero) | salinity=1.0, moisture=0 | REJECTED | Moisture must be 1-100 |
| TC-074 | Invalid moisture (over 100) | salinity=1.0, moisture=101 | REJECTED | Moisture must be 1-100 |
| TC-075 | Invalid moisture (negative) | salinity=1.0, moisture=-1 | REJECTED | Negative error code |
| TC-076 | Invalid control mode | salinity=1.0, control_mode="AUTO_MODE" | REJECTED | Invalid control mode |
| TC-077 | Invalid valve state | valve_state="OPENING" | REJECTED | Invalid valve state |
| TC-078 | Invalid crop stage | crop_stage="GROWING" | REJECTED | Invalid crop stage |
| TC-079 | Missing salinity | moisture=50, salinity=null | REJECTED | Required field missing |
| TC-080 | Missing moisture | salinity=1.0, moisture=null | REJECTED | Required field missing |

### Category 12: Temperature and Environmental Factors

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-081 | High temp + low moisture | temperature=40°C, moisture=30%, control_mode=AUTO | OPEN | Heat stress needs water |
| TC-082 | Low temp + high moisture | temperature=10°C, moisture=80%, control_mode=AUTO | CLOSED or NO_ACTION | Cold + wet risk |
| TC-083 | Normal temp + normal moisture | temperature=25°C, moisture=50%, control_mode=AUTO | OPEN | Optimal conditions |
| TC-084 | Extreme heat + drought | temperature=45°C, rainfall=1mm, water_level=LOW, moisture=30%, control_mode=AUTO | OPEN | Critical heat stress |
| TC-085 | Freezing temp | temperature=0°C, moisture=50%, control_mode=AUTO | CLOSED or NO_ACTION | Frost protection |

### Category 13: River Water Level Variations

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-086 | High water level + safe salinity | river_water_level=5.0m, salinity=1.0, control_mode=AUTO | OPEN | Abundant water available |
| TC-087 | Low water level + safe salinity | river_water_level=0.5m, salinity=1.0, control_mode=AUTO | OPEN | Water available but low |
| TC-088 | Critical water level + drought | river_water_level=0.1m, rainfall=1mm, moisture=35%, control_mode=AUTO | OPEN | Critical water shortage |
| TC-089 | High water level + high salinity | river_water_level=5.0m, salinity=3.0, control_mode=AUTO | CLOSED | Salinity danger regardless of level |
| TC-090 | No water level data | river_water_level=null, salinity=1.0, control_mode=AUTO | OPEN | No level data, default to salinity |

### Category 14: Action History and Learning

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-091 | Repeated similar conditions | salinity=1.5, history shows CLOSED for similar | CLOSED | Learn from past actions |
| TC-092 | Repeated with different outcome | salinity=1.5, history shows OPEN for similar | OPEN (if no other risks) | Learn from past actions |
| TC-093 | No action history | salinity=1.5, no history | OPEN | No past data, use rules |
| TC-094 | Conflicting history | salinity=1.5, history shows both OPEN and CLOSED | Use current rules | Conflicting data, prioritize rules |

### Category 15: Concurrent Events

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-095 | Rapid salinity spike | salinity changes from 1.0 to 3.0 in < 1min | CLOSED | Immediate danger response |
| TC-096 | Rapid moisture drop | moisture changes from 60% to 30% in < 1min | OPEN | Immediate drought response |
| TC-097 | Sudden rain onset | rainfall changes from 0mm to 50mm in < 1min | CLOSED | Immediate flood prevention |
| TC-098 | Tide change + salinity | tide changes from FALLING to RISING, salinity=1.2 | CLOSED | Immediate salt intrusion prevention |

### Category 16: State Persistence and Recovery

| Test ID | Scenario | Input Conditions | Expected Decision | Reason |
|---------|----------|------------------|-------------------|--------|
| TC-099 | System restart + high salinity | salinity=2.5, system restarts | CLOSED | Maintain safety state |
| TC-100 | System restart + safe conditions | salinity=1.0, system restarts | OPEN | Restore to safe state |
| TC-101 | Valve stuck CLOSED | valve_state=CLOSED, safe conditions persist | OPEN (after detection) | Recovery from stuck state |
| TC-102 | Valve stuck OPEN | valve_state=OPEN, high salinity persists | CLOSED (after detection) | Recovery from stuck state |

---

## Test Execution Priority

### High Priority (Critical Safety)
- TC-002, TC-003, TC-005 (High salinity scenarios)
- TC-007, TC-011, TC-012 (Heavy rainfall scenarios)
- TC-015, TC-021 (Tide + salinity scenarios)
- TC-039, TC-040, TC-043 (Manual override blocking)
- TC-058, TC-060, TC-061 (Fallback scenarios)

### Medium Priority (Normal Operations)
- TC-001, TC-004, TC-006 (Normal salinity ranges)
- TC-008, TC-010, TC-014 (Normal rainfall)
- TC-016, TC-017, TC-020 (Normal tide conditions)
- TC-030, TC-031, TC-033 (Drought conditions)
- TC-044, TC-045, TC-047 (Crop stage variations)

### Low Priority (Edge Cases)
- TC-022 to TC-029 (Humidity/mold scenarios)
- TC-051 to TC-057 (Multiple risk factors)
- TC-063 to TC-070 (AI trigger thresholds)
- TC-071 to TC-080 (Data validation)
- TC-081 to TC-102 (Environmental and recovery scenarios)

---

## Test Data Format

Each test case should include:

```json
{
  "test_id": "TC-001",
  "description": "Safe salinity",
  "input": {
    "salinity": 1.0,
    "moisture": 50,
    "crop_stage": "VEGETATIVE",
    "control_mode": "AUTO",
    "external_forecast": {
      "rainfall_24h": 10,
      "temperature": 25,
      "humidity": 70,
      "tide_status": "FALLING"
    },
    "river_water_level": 2.0
  },
  "expected": {
    "valve_state": "OPEN",
    "reason": "Salinity below 2.0 threshold",
    "blocked_by_manual": false
  }
}
```

---

## Success Criteria

1. **Decision Accuracy**: System must match expected valve state in 95%+ of test cases
2. **Reasoning Quality**: System must provide clear, human-readable reasons
3. **Safety Priority**: All high-priority safety cases must pass 100%
4. **Fallback Reliability**: Fallback scenarios must always produce safe decisions
5. **Manual Override**: Manual mode must block AI decisions in 100% of cases
