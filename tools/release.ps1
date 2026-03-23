param(
  [Parameter(Mandatory = $true)][string]$ScriptId,
  [Parameter(Mandatory = $true)][string]$Message,
  [ValidateSet("patch", "minor", "major")][string]$Level = "patch"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$metaPath = Join-Path $repoRoot ("modules\" + $ScriptId + "\meta.json")
$mainPath = Join-Path $repoRoot ("modules\" + $ScriptId + "\main.js")
$changeLogPath = Join-Path $repoRoot "CHANGELOG.md"

if (-not (Test-Path $metaPath)) {
  throw "meta.json not found: $metaPath"
}

$meta = Get-Content -Path $metaPath -Encoding UTF8 | ConvertFrom-Json
$currentVersion = [string]$meta.version
$nextVersion = node -e "const lib=require('./tools/release-lib.js'); process.stdout.write(lib.bumpVersion('$currentVersion', '$Level'))" 2>$null

if (-not $nextVersion) {
  throw "failed to calculate next version"
}

$meta.version = $nextVersion
$meta.updatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$meta | ConvertTo-Json -Depth 10 | Set-Content -Path $metaPath -Encoding UTF8

if (Test-Path $mainPath) {
  $mainText = Get-Content -Path $mainPath -Raw -Encoding UTF8
  $mainText = [regex]::Replace($mainText, 'version:\s*"[^"]+"', 'version: "' + $nextVersion + '"', 1)
  Set-Content -Path $mainPath -Value $mainText -Encoding UTF8
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$entry = node -e "const lib=require('./tools/release-lib.js'); process.stdout.write(lib.buildChangelogEntry({date:'$today', version:'$nextVersion', message:'$Message'}))" 2>$null
if (-not $entry) {
  throw "failed to build changelog entry"
}

$existing = if (Test-Path $changeLogPath) { Get-Content -Path $changeLogPath -Raw -Encoding UTF8 } else { "# 변경 이력`n`n" }
$updatedChangeLog = if ($existing -match '^# 변경 이력') {
  "# 변경 이력`n`n" + $entry + ($existing -replace '^# 변경 이력\s*', '')
} else {
  "# 변경 이력`n`n" + $entry + $existing
}
Set-Content -Path $changeLogPath -Value $updatedChangeLog -Encoding UTF8

git -C $repoRoot add .
git -C $repoRoot commit -m ("release: " + $ScriptId + " " + $nextVersion)
git -C $repoRoot push

Write-Output ("released " + $ScriptId + " " + $nextVersion)
