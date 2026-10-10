param([ValidatePattern('^[A-Za-z0-9_-]+\.zip$')][string]$FileName = 'Voltway-Final.zip')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputPath = Join-Path (Split-Path $projectRoot -Parent) $FileName
Push-Location -LiteralPath $projectRoot
try {
    & node scripts/privacy-check.js
    if ($LASTEXITCODE -ne 0) { throw 'Privacy check failed. Archive was not created.' }
    Add-Type -AssemblyName System.IO.Compression
    $roots = @('src', 'public', 'scripts', 'tests', 'docs', 'README.md', 'package.json', 'package-lock.json', '.env.example', '.gitignore', '.prettierrc.json', '.prettierignore')
    $files = foreach ($root in $roots) {
        $item = Get-Item -LiteralPath (Join-Path $projectRoot $root)
        if ($item.PSIsContainer) { Get-ChildItem -LiteralPath $item.FullName -File -Recurse } else { $item }
    }
    $stream = [IO.File]::Open($outputPath, [IO.FileMode]::CreateNew)
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked source files are not allowed in the archive.' }
            $relative = [IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
            if ($relative.StartsWith('../') -or $relative -eq '.env' -or $relative.StartsWith('.git/')) { throw 'Excluded path encountered.' }
            $entry = $archive.CreateEntry('voltway/' + $relative, [IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            $sourceStream = [IO.File]::OpenRead($file.FullName)
            try { $sourceStream.CopyTo($entryStream) } finally { $sourceStream.Dispose(); $entryStream.Dispose() }
        }
    } finally { $archive.Dispose(); $stream.Dispose() }
    $verify = [IO.Compression.ZipFile]::OpenRead($outputPath)
    try {
        if ($verify.Entries.FullName -contains 'voltway/.env') { throw 'Private .env found in archive.' }
        Write-Output ('Verified archive entries: ' + $verify.Entries.Count)
    } finally { $verify.Dispose() }
    Get-FileHash -LiteralPath $outputPath -Algorithm SHA256 | Select-Object Algorithm, Hash, Path
} finally { Pop-Location }
