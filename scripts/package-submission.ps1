$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputPath = Join-Path $projectRoot 'pulse-submission.zip'
$temporaryBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingPath = Join-Path $temporaryBase ("pulse-submission-" + [guid]::NewGuid().ToString('N'))
$stagingPath = [System.IO.Path]::GetFullPath($stagingPath)

if (-not $stagingPath.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to use a staging directory outside the system temporary directory.'
}

try {
  New-Item -ItemType Directory -Path $stagingPath | Out-Null

  $files = @('.gitignore', 'package.json', 'README.md', 'server.js', 'scoring.js', 'market-data.js')
  foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stagingPath $file)
  }

  foreach ($directory in @('public', 'test', 'scripts')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $stagingPath -Recurse
  }

  New-Item -ItemType Directory -Path (Join-Path $stagingPath 'data') | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot 'data\store.seed.json') -Destination (Join-Path $stagingPath 'data\store.seed.json')

  if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
  }
  $archiveItems = Get-ChildItem -LiteralPath $stagingPath -Force
  Compress-Archive -Path $archiveItems.FullName -DestinationPath $outputPath -CompressionLevel Optimal
  Write-Output "Created $outputPath"
}
finally {
  if ((Test-Path -LiteralPath $stagingPath) -and $stagingPath.StartsWith($temporaryBase, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $stagingPath -Recurse -Force
  }
}
