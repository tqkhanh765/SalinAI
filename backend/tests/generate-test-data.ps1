param(
  [string]$BaseUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

function Call-Api {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null
  )

  if ($null -eq $Body) {
    return Invoke-RestMethod -Uri $Url -Method $Method
  }

  $json = $Body | ConvertTo-Json -Depth 8
  return Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body $json
}

Write-Host "Generating SalinAI test data..." -ForegroundColor Cyan

$null = Call-Api -Method "PATCH" -Url "$BaseUrl/api/control-mode" -Body @{ control_mode = "AUTO" }
$null = Call-Api -Method "PATCH" -Url "$BaseUrl/api/crop-stage" -Body @{ crop_stage = "FLOWERING" }

$scenarios = @(
  @{ name = "Baseline safe"; payload = @{ salinity = 1.2; moisture = 60; crop_stage = "FLOWERING"; river_water_level = 1.10; ph = 6.8; external_forecast = @{ rainfall_24h = 3; temperature = 29; humidity = 72; weather_code = 2; tide_status = "FALLING"; weather = "Partly cloudy" } } },
  @{ name = "Salinity spike"; payload = @{ salinity = 3.5; moisture = 58; crop_stage = "FLOWERING"; river_water_level = 1.15; ph = 6.7; external_forecast = @{ rainfall_24h = 4; temperature = 30; humidity = 74; weather_code = 3; tide_status = "RISING"; weather = "Hot" } } },
  @{ name = "Heavy rain risk"; payload = @{ salinity = 1.9; moisture = 76; crop_stage = "FLOWERING"; river_water_level = 1.28; ph = 6.6; external_forecast = @{ rainfall_24h = 48; temperature = 27; humidity = 89; weather_code = 96; tide_status = "RISING"; weather = "Thunderstorm" } } },
  @{ name = "Drought pressure"; payload = @{ salinity = 2.4; moisture = 33; crop_stage = "FLOWERING"; river_water_level = 0.72; ph = 6.9; external_forecast = @{ rainfall_24h = 0; temperature = 34; humidity = 58; weather_code = 0; tide_status = "LOW"; weather = "Clear" } } },
  @{ name = "Recovery"; payload = @{ salinity = 1.5; moisture = 52; crop_stage = "FLOWERING"; river_water_level = 1.05; ph = 7.0; external_forecast = @{ rainfall_24h = 8; temperature = 28; humidity = 70; weather_code = 1; tide_status = "FALLING"; weather = "Mild" } } }
)

$results = @()
foreach ($scenario in $scenarios) {
  try {
    $resp = Call-Api -Method "POST" -Url "$BaseUrl/api/ingest" -Body $scenario.payload
    $results += [PSCustomObject]@{
      scenario = $scenario.name
      status = $resp.status
      message = $resp.message
      trigger = $resp.trigger
    }
    Write-Host "[OK] $($scenario.name)" -ForegroundColor Green
  }
  catch {
    $results += [PSCustomObject]@{
      scenario = $scenario.name
      status = "ERROR"
      message = $_.Exception.Message
      trigger = ""
    }
    Write-Host "[ERR] $($scenario.name): $($_.Exception.Message)" -ForegroundColor Red
  }
}

$state = Call-Api -Method "GET" -Url "$BaseUrl/api/farm-state?logLimit=8"
$latest = if ($state.actionLogs.Count -gt 0) { $state.actionLogs[0] } else { $null }

Write-Host ""
Write-Host "Generation summary:" -ForegroundColor Cyan
$results | Format-Table -AutoSize

if ($null -ne $latest) {
  Write-Host ""
  Write-Host "Latest action log:" -ForegroundColor Cyan
  [PSCustomObject]@{
    actor = $latest.actor
    action = $latest.action
    reason = $latest.reason
    timestamp = $latest.timestamp
    retrieval_hits = $latest.retrieval.hit_count
    retrieval_sources = ($latest.retrieval.source_ids -join ", ")
  } | Format-List
}

Write-Host "Done." -ForegroundColor Cyan
