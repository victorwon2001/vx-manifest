param(
  [Parameter(Mandatory = $true)][string]$ScriptId,
  [Parameter(Mandatory = $true)][string]$Message,
  [ValidateSet("patch", "minor", "major")][string]$Level = "patch",
  [string[]]$ExtraPaths = @()
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string]$PathValue
  )

  $fullPath = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $PathValue))
  if (-not $fullPath.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "저장소 밖 경로는 허용되지 않습니다: $PathValue"
  }
  return $fullPath.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')
}

function Assert-NoOutOfScopeStagedChanges {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][string[]]$AllowedPaths
  )

  $staged = git -C $RepoRoot diff --cached --name-only
  if (-not $staged) { return }

  $unexpected = @($staged | Where-Object { $_ -and ($_ -notin $AllowedPaths) })
  if ($unexpected.Count -gt 0) {
    throw ("허용 범위를 벗어난 staged 변경이 있습니다: " + ($unexpected -join ", "))
  }
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$metaPath = Join-Path $repoRoot ("modules\" + $ScriptId + "\meta.json")
$mainPath = Join-Path $repoRoot ("modules\" + $ScriptId + "\main.js")
$changeLogPath = Join-Path $repoRoot "CHANGELOG.md"
$changeLogHeader = "# 변경 이력"

if (-not (Test-Path $metaPath)) {
  throw "meta.json not found: $metaPath"
}

$allowedPaths = @(
  ("modules/" + $ScriptId + "/meta.json"),
  ("modules/" + $ScriptId + "/main.js"),
  "CHANGELOG.md"
)

foreach ($extraPath in ($ExtraPaths | Where-Object { $_ -and $_.Trim() })) {
  $allowedPaths += Resolve-RepoRelativePath -RepoRoot $repoRoot -PathValue $extraPath
}
$allowedPaths = $allowedPaths | Select-Object -Unique

Assert-NoOutOfScopeStagedChanges -RepoRoot $repoRoot -AllowedPaths $allowedPaths

$meta = Get-Content -Path $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json
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
  if ($mainText -match 'const\s+MODULE_VERSION\s*=\s*"[^"]+"') {
    $mainText = [regex]::Replace($mainText, 'const\s+MODULE_VERSION\s*=\s*"[^"]+"', 'const MODULE_VERSION = "' + $nextVersion + '"', 1)
  }
  elseif ($mainText -match 'version:\s*"[^"]+"') {
    $mainText = [regex]::Replace($mainText, 'version:\s*"[^"]+"', 'version: "' + $nextVersion + '"', 1)
  }
  Set-Content -Path $mainPath -Value $mainText -Encoding UTF8
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$entry = node -e "const lib=require('./tools/release-lib.js'); process.stdout.write(lib.buildChangelogEntry({date:'$today', version:'$nextVersion', message:'$Message'}))" 2>$null
if (-not $entry) {
  throw "failed to build changelog entry"
}

$existing = if (Test-Path $changeLogPath) { Get-Content -Path $changeLogPath -Raw -Encoding UTF8 } else { $changeLogHeader + "`n`n" }
$normalizedExisting = $existing -replace '^\uFEFF', ''
$updatedChangeLog = if ($normalizedExisting -match '^# 변경 이력') {
  $changeLogHeader + "`n`n" + $entry + ($normalizedExisting -replace '^# 변경 이력\s*', '')
}
else {
  $changeLogHeader + "`n`n" + $entry + $normalizedExisting
}
Set-Content -Path $changeLogPath -Value $updatedChangeLog -Encoding UTF8

node (Join-Path $repoRoot "tools\validate-manifest.js")
node --test (Join-Path $repoRoot "tests\loader.test.js") (Join-Path $repoRoot "tests\validate-manifest.test.js")

git -C $repoRoot add -- $allowedPaths
Assert-NoOutOfScopeStagedChanges -RepoRoot $repoRoot -AllowedPaths $allowedPaths
git -C $repoRoot commit -m ("release: " + $ScriptId + " " + $nextVersion)
git -C $repoRoot push

Write-Output ("released " + $ScriptId + " " + $nextVersion)
