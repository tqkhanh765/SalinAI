# SalinAI Master Test V3 — Comprehensive Architecture Validation

param(
  [string]$BaseUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"
$passCount = 0
$failCount = 0

function Pass($msg) { $script:passCount++; Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { $script:failCount++; Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Header($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

function Assert-True($cond, $passMsg, $failMsg) {
  if ($cond) { Pass $passMsg } else { Fail $failMsg; throw $failMsg }
}

function Invoke-Checked {
  param([string]$Method, [string]$Url, [object]$Body = $null)
  try {
    if ($null -eq $Body) { return Invoke-RestMethod -Uri $Url -Method $Method }
    $json = $Body | ConvertTo-Json -Depth 10
    return Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body $json
  } catch { throw "Request failed: $Method $Url :: $($_.Exception.Message)" }
}

$latestLogId = $null

Header "1. CORE PIPELINE: Sensor Ingestion and AI Decision"
try {
    # Use the reset script in the tests directory
    $null = node ./tests/reset_system.js

    $payload = @{
        salinity = 4.5
        moisture = 42
        crop_stage = "VEGETATIVE"
        external_forecast = @{ rainfall_24h = 0; temperature = 35; tide_status = "RISING" }
    }
    $ingest = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/ingest" -Body $payload
    Assert-True ($ingest.status -eq "OK") "Ingest accepted" "Ingest failed"
    
    Write-Host "Waiting for AI processing (30s)..." -ForegroundColor Gray
    Start-Sleep -Seconds 30
    
    $state = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/farm-state?logLimit=1"
    if ($state.actionLogs -and $state.actionLogs.Count -gt 0) {
        $latestLogId = $state.actionLogs[0].id
        Pass "AI Orchestrator produced action: $($state.actionLogs[0].action)"
    } else {
        Fail "AI Orchestrator did not respond after ingest."
    }
} catch { Fail "Core Pipeline failed: $_" }


Header "2. EPIC 2: Feedback Loop and Evaluator Agent"
try {
    if ($null -eq $latestLogId) { throw "No action log ID available for feedback test" }
    
    $feedback = @{
        action_log_id = $latestLogId
        verdict = "incorrect"
        notes = "Temp is 35C and Salinity is 4.5ppt, should close valve immediately to keep fresh water. AI opening valve is wrong."
    }
    Write-Host "Sending negative feedback to trigger Evaluator..." -ForegroundColor Gray
    $eval = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/evaluate-feedback" -Body $feedback
    
    if ($eval.status -eq "OK" -and $null -ne $eval.lesson) {
        Pass "Evaluator Agent extracted lesson: '$($eval.lesson.lesson_text)'"
    } else {
        Fail "Evaluator Agent failed to produce a lesson."
    }
    
    $lessons = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/lessons-learned?limit=1"
    if ($lessons.count -gt 0) {
        Pass "Lesson successfully saved to MongoDB."
    } else {
        Fail "Lesson not found in MongoDB."
    }
} catch { Fail "Epic 2 Feedback Loop failed: $_" }


Header "3. EPIC 3: Proactive Planning"
try {
    Write-Host "Triggering 5-day proactive planning..." -ForegroundColor Gray
    $null = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/irrigation-plan/trigger"
    
    Write-Host "Waiting for GLM-4.7 reasoning (25s)..." -ForegroundColor Gray
    Start-Sleep -Seconds 25
    
    $plan = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/irrigation-plan"
    if ($null -ne $plan -and $plan.plan.Count -eq 5) {
        Pass "GLM-4.7 generated 5-day plan successfully."
    } else {
        Fail "Failed to fetch 5-day plan."
    }
} catch { Fail "Epic 3 Proactive Planning failed: $_" }


Header "4. INTELLIGENCE CONSOLIDATION: Policy Summary"
try {
    $policy = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/policy-summary"
    if ($policy.status -eq "OK" -and $null -ne $policy.summary) {
        Pass "System updated Policy Summary based on new lessons."
    } else {
        Fail "Policy Summary unavailable."
    }
} catch { Fail "Policy Consolidation failed: $_" }


Header "FINAL REGRESSION SUMMARY"
Write-Host "PASS: $passCount" -ForegroundColor Green
Write-Host "FAIL: $failCount" -ForegroundColor Red

if ($failCount -gt 0) { exit 1 } else { exit 0 }
