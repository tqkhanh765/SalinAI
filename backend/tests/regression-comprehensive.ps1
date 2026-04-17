param(
  [string]$BaseUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

$passCount = 0
$failCount = 0
$warnCount = 0
$logWindowSize = 80

function Pass($msg) {
  $script:passCount++
  Write-Host "[PASS] $msg" -ForegroundColor Green
}

function Fail($msg) {
  $script:failCount++
  Write-Host "[FAIL] $msg" -ForegroundColor Red
}

function Warn($msg) {
  $script:warnCount++
  Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Assert-True($cond, $passMsg, $failMsg) {
  if ($cond) { Pass $passMsg } else { Fail $failMsg }
}

function Invoke-Checked {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null
  )

  try {
    if ($null -eq $Body) {
      return Invoke-RestMethod -Uri $Url -Method $Method
    }

    $json = $Body | ConvertTo-Json -Depth 8
    return Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body $json
  }
  catch {
    throw "Request failed: $Method $Url :: $($_.Exception.Message)"
  }
}

function Get-NewActionLogs {
  param(
    [string]$BaseUrl,
    [System.Collections.Generic.HashSet[string]]$BaselineIds,
    [int]$LogLimit = 40
  )

  $state = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/farm-state?logLimit=$LogLimit"
  $logs = @($state.actionLogs)
  $newLogs = @($logs | Where-Object {
    $id = [string]($_.id)
    -not [string]::IsNullOrWhiteSpace($id) -and -not $BaselineIds.Contains($id)
  })

  return @($newLogs)
}

Write-Host "Starting SalinAI comprehensive regression..." -ForegroundColor Cyan
$testStart = Get-Date

# API-001
try {
  $health = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/health"
  Assert-True ($null -ne $health) "API-001 health reachable" "API-001 health response null"
} catch { Fail "API-001 health failed: $_" }

# API-002
try {
  $state0 = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/farm-state?logLimit=$logWindowSize"
  Assert-True ($null -ne $state0.sensorData) "API-002 farm-state has sensorData" "API-002 missing sensorData"
  Assert-True ($null -ne $state0.aiStatus) "API-002 farm-state has aiStatus" "API-002 missing aiStatus"
  Assert-True ($null -ne $state0.actionLogs) "API-002 farm-state has actionLogs" "API-002 missing actionLogs"
} catch { Fail "API-002 farm-state failed: $_" }

$baselineLogIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
if ($state0 -and $state0.actionLogs) {
  foreach ($log in @($state0.actionLogs)) {
    $id = [string]($log.id)
    if (-not [string]::IsNullOrWhiteSpace($id)) {
      [void]$baselineLogIds.Add($id)
    }
  }
}

# API-003 decision-details
try {
  $details = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/decision-details"
  Assert-True ($null -ne $details.data) "API-003 decision-details data returned" "API-003 decision-details missing data"
} catch { Fail "API-003 decision-details failed: $_" }

# API-004 control mode toggle
try {
  $toManual = Invoke-Checked -Method "PATCH" -Url "$BaseUrl/api/control-mode" -Body @{ control_mode = "MANUAL" }
  Assert-True (($toManual.updated.control_mode -eq "MANUAL") -or ($toManual.updated.control_mode -eq "manual")) "API-004 set MANUAL" "API-004 failed to set MANUAL"

  $toAuto = Invoke-Checked -Method "PATCH" -Url "$BaseUrl/api/control-mode" -Body @{ control_mode = "AUTO" }
  Assert-True (($toAuto.updated.control_mode -eq "AUTO") -or ($toAuto.updated.control_mode -eq "auto")) "API-004 set AUTO" "API-004 failed to set AUTO"
} catch { Fail "API-004 control mode failed: $_" }

# API-005 crop stage
try {
  $crop = Invoke-Checked -Method "PATCH" -Url "$BaseUrl/api/crop-stage" -Body @{ crop_stage = "FLOWERING" }
  Assert-True ($crop.updated.crop_stage -eq "FLOWERING") "API-005 crop stage updated" "API-005 crop stage not updated"
} catch { Fail "API-005 crop stage failed: $_" }

# API-006 invalid ingest validation
try {
  $badPayload = @{ salinity = 0; moisture = 0; crop_stage = "FLOWERING" }
  $null = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/ingest" -Body $badPayload
  Fail "API-006 invalid ingest should fail but succeeded"
} catch {
  Pass "API-006 invalid ingest rejected"
}

# AGT/RAG trigger attempts
$payloadA = @{
  salinity = 2.1
  moisture = 58
  crop_stage = "FLOWERING"
  river_water_level = 1.2
  ph = 6.8
  external_forecast = @{
    rainfall_24h = 6
    temperature = 29
    humidity = 75
    weather_code = 2
    tide_status = "FALLING"
  }
}

$payloadB = @{
  salinity = 3.0
  moisture = 74
  crop_stage = "FLOWERING"
  river_water_level = 1.28
  ph = 6.7
  external_forecast = @{
    rainfall_24h = 16
    temperature = 30
    humidity = 82
    weather_code = 96
    tide_status = "RISING"
  }
}

$payloadC = @{
  salinity = 1.1
  moisture = 42
  crop_stage = "FLOWERING"
  river_water_level = 1.05
  ph = 7.0
  external_forecast = @{
    rainfall_24h = 1
    temperature = 33
    humidity = 61
    weather_code = 1
    tide_status = "FALLING"
  }
}

$payloadD = @{
  salinity = 4.4
  moisture = 86
  crop_stage = "FLOWERING"
  river_water_level = 1.35
  ph = 6.5
  external_forecast = @{
    rainfall_24h = 28
    temperature = 31
    humidity = 89
    weather_code = 99
    tide_status = "RISING"
  }
}

try {
  $ingA = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/ingest" -Body $payloadA
  Assert-True ($ingA.status -eq "OK") "AGT-001 ingest A accepted" "AGT-001 ingest A failed"

  $ingB = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/ingest" -Body $payloadB
  Assert-True ($ingB.status -eq "OK") "AGT-002 ingest B accepted" "AGT-002 ingest B failed"
} catch { Fail "AGT ingest flow failed: $_" }

# Read latest state and inspect logs
try {
  $state1 = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/farm-state?logLimit=$logWindowSize"
  $logs = @($state1.actionLogs)
  Assert-True ($logs.Count -ge 1) "AGT-003 has action logs" "AGT-003 no action logs"

  # Poll up to 30s to wait for async pipeline to write fresh action logs.
  $pollStart = Get-Date
  $pollTimeoutSeconds = 30
  $pollIntervalSeconds = 3
  $kickSent = $false
  $recentLogs = @($logs | Where-Object {
    $id = [string]($_.id)
    -not [string]::IsNullOrWhiteSpace($id) -and -not $baselineLogIds.Contains($id)
  })

  while ($recentLogs.Count -eq 0 -and ((Get-Date) -lt $pollStart.AddSeconds($pollTimeoutSeconds))) {
    if (-not $kickSent -and ((Get-Date) -ge $pollStart.AddSeconds(12))) {
      try {
        $null = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/ingest" -Body $payloadC
        $null = Invoke-Checked -Method "POST" -Url "$BaseUrl/api/ingest" -Body $payloadD
        Write-Host "[INFO] Sent additional trigger burst to force async action log creation." -ForegroundColor Cyan
      } catch {
        Write-Host "[INFO] Additional trigger burst failed: $_" -ForegroundColor Cyan
      }
      $kickSent = $true
    }

    Start-Sleep -Seconds $pollIntervalSeconds
    $recentLogs = Get-NewActionLogs -BaseUrl $BaseUrl -BaselineIds $baselineLogIds -LogLimit $logWindowSize
  }

  if ($recentLogs.Count -gt 0) {
    Pass "RAG-001 recent action log detected within 30s polling"
  } else {
    Fail "RAG-001 no recent action log detected after 30s polling"
    throw "RAG-001 gating failed"
  }

  $recentWithRetrieval = @($recentLogs | Where-Object { $_.retrieval -and $_.retrieval.source_ids -and $_.retrieval.source_ids.Count -gt 0 })
  if ($recentWithRetrieval.Count -gt 0) {
    Pass "RAG-002 recent log contains retrieval source_ids"
  } else {
    Fail "RAG-002 recent logs missing retrieval source_ids"
    throw "RAG-002 gating failed"
  }

  $invalidIds = @()
  foreach ($log in $recentWithRetrieval) {
    $invalidIds += @($log.retrieval.source_ids | Where-Object { -not ($_.ToString().StartsWith("paper-")) })
  }
  Assert-True ($invalidIds.Count -eq 0) "RAG-003 retrieval source_ids are paper-only" "RAG-003 found non-paper source_ids"

  $traceOk = $false
  foreach ($log in $recentLogs) {
    if ($log.agent_trace -and $log.agent_trace.Count -gt 0) {
      $phases = @($log.agent_trace | ForEach-Object { $_.phase })
      if (($phases -contains "researcher") -and ($phases -contains "retrieval") -and ($phases -contains "orchestrator")) {
        $traceOk = $true
        break
      }
    }
  }
  if ($traceOk) { Pass "AGT-004 agent trace includes researcher/retrieval/orchestrator" } else { Warn "AGT-004 trace phases incomplete in recent logs" }

  $loop = $state1.aiStatus.feedback_loop
  if ($null -eq $loop) {
    Warn "FB-001 feedback loop state not present yet"
  } else {
    Assert-True ($loop.status -in @("PENDING_OUTCOME", "EVALUATED", "IDLE", "PROCESSING")) "FB-001 feedback status valid" "FB-001 invalid feedback status"
    Assert-True ([int]$loop.min_action_age_hours -ge 1) "FB-002 feedback delay metadata valid" "FB-002 feedback delay metadata invalid"
  }
} catch { Fail "State/log inspection failed: $_" }

# API-007 policy summary
try {
  $policy = Invoke-Checked -Method "GET" -Url "$BaseUrl/api/policy-summary"
  Assert-True ($policy.status -eq "OK") "API-007 policy summary reachable" "API-007 policy summary failed"
} catch { Fail "API-007 policy summary failed: $_" }

Write-Host ""
Write-Host "Regression summary:" -ForegroundColor Cyan
Write-Host "PASS: $passCount" -ForegroundColor Green
Write-Host "WARN: $warnCount" -ForegroundColor Yellow
Write-Host "FAIL: $failCount" -ForegroundColor Red

if ($failCount -gt 0) {
  exit 1
}

exit 0
