param(
  [string]$BaseUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

function Pass($msg) { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; throw $msg }

function Assert-True($cond, $msg) {
  if ($cond) { Pass $msg } else { Fail $msg }
}

Write-Host "Running SalinAI smoke comprehensive checks..." -ForegroundColor Cyan
$testStart = Get-Date

# 1) Health
$health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get
Assert-True($null -ne $health) "Health endpoint reachable"

# 2) Ingest trigger candidate
$payload = @{
  salinity = 3.4
  moisture = 62
  crop_stage = "FLOWERING"
  river_water_level = 1.25
  ph = 6.9
  external_forecast = @{
    rainfall_24h = 12
    temperature = 29
    humidity = 78
    weather_code = 96
    tide_status = "RISING"
  }
} | ConvertTo-Json -Depth 6

$ingest = Invoke-RestMethod -Uri "$BaseUrl/api/ingest" -Method Post -ContentType "application/json" -Body $payload
Assert-True($ingest.status -eq "OK") "Ingest accepted"

# 3) Read state
Start-Sleep -Seconds 2
$state = Invoke-RestMethod -Uri "$BaseUrl/api/farm-state?logLimit=10" -Method Get
Assert-True($null -ne $state.aiStatus) "Farm state includes aiStatus"
Assert-True($null -ne $state.actionLogs) "Farm state includes action logs"

# 4) Retrieval source check (paper-only)
if ($state.actionLogs.Count -gt 0) {
  $recentLogs = @($state.actionLogs | Where-Object {
    $_.timestamp -and ([datetime]$_.timestamp -ge $testStart.AddSeconds(-5))
  })

  if ($recentLogs.Count -gt 0) {
    $recentWithRetrieval = @($recentLogs | Where-Object { $_.retrieval -and $_.retrieval.source_ids -and $_.retrieval.source_ids.Count -gt 0 })
    if ($recentWithRetrieval.Count -gt 0) {
      $invalidIds = @()
      foreach ($log in $recentWithRetrieval) {
        $invalidIds += @($log.retrieval.source_ids | Where-Object { -not ($_.ToString().StartsWith("paper-")) })
      }
      Assert-True($invalidIds.Count -eq 0) "Recent retrieval source_ids are paper-only"
    } else {
      Write-Host "[WARN] Recent logs have no retrieval ids; check vector hit threshold/dataset" -ForegroundColor Yellow
    }
  } else {
    Write-Host "[WARN] No recent action log produced in current run" -ForegroundColor Yellow
  }
}

# 5) Feedback loop state check
$loop = $state.aiStatus.feedback_loop
if ($null -ne $loop) {
  Assert-True($loop.min_action_age_hours -ge 1) "Feedback loop has min_action_age_hours"
  Assert-True($loop.status -in @("PENDING_OUTCOME", "EVALUATED", "IDLE", "PROCESSING")) "Feedback loop status is valid"
} else {
  Write-Host "[WARN] feedback_loop not populated yet" -ForegroundColor Yellow
}

Write-Host "Smoke checks completed." -ForegroundColor Cyan
