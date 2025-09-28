# --- Detect resources folder ---
$scriptPath = $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $scriptPath
$sfxFolder = Join-Path $parentDir "sfx"
$sfxUrl = "https://github.com/vjdyofficial/SoundEffectsStudio/releases/download/sfxpack-cumulative/sfx.zip"
$appPath = Join-Path $parentDir ""
$sfxZipPath = "$PSScriptRoot\sfx.zip"

# --- Delay and Message ---
Start-Sleep -Seconds 2

try {
    $remoteFileSize = (Invoke-WebRequest -Uri $sfxUrl -Method Head).Headers["Content-Length"]
} catch {
    Write-Host "Failed to get remote file size. Exiting." -ForegroundColor Red
    exit 6
}

do {
    $downloadNeeded = $true

    if (Test-Path $sfxZipPath) {
        $localFileSize = (Get-Item $sfxZipPath).Length
        if ($localFileSize -eq $remoteFileSize) {
            Write-Host "SFX Pack already exists and is complete: $sfxZipPath" -ForegroundColor Green
            $downloadNeeded = $false
        } else {
            Write-Host "Existing file is incomplete or corrupted. Re-downloading..." -ForegroundColor Yellow
            Remove-Item $sfxZipPath -Force
        }
    }

    if ($downloadNeeded) {
        Write-Host "Downloading Sound Effects Cumulative Pack..."
        try {
            Start-BitsTransfer -Source $sfxUrl -Destination $sfxZipPath -ErrorAction Stop
        } catch {
            Write-Host "Download failed. Retrying..." -ForegroundColor Red
            Start-Sleep -Seconds 5
        }
    }

} until ((Test-Path $sfxZipPath) -and ((Get-Item $sfxZipPath).Length -eq $remoteFileSize))

Write-Host "Download complete and verified: $sfxZipPath" -ForegroundColor Green

Start-Sleep -Seconds 5

if (Test-Path $sfxFolder) {
    Write-Host "Sound Effects folder detected at: $sfxFolder" -ForegroundColor Cyan
    Write-Host "Sound Effects folder found in parent directory." -ForegroundColor Yellow
    Remove-Item $sfxFolder -Recurse -Force
    Write-Host "Let's proceed to the cumulative pack updates." -ForegroundColor Yellow
} else {
    Write-Host "SFX Pack folder detected at: $sfxFolder" -ForegroundColor Cyan
    Write-Host "SFX Pack folder not found in parent directory. Download process started..." -ForegroundColor Yellow
}

Start-Sleep -Seconds 5

# --- Extract sfx.zip (or another archive) ---
$sevenZipExe = "$PSScriptRoot\7zG.exe"  # Make sure this exists
$extractTo = $appPath

if (-not (Test-Path $sevenZipExe)) {
    Write-Host "7zG.exe not found. Exiting installer." -ForegroundColor Red
    exit 4
}

$archivePath = "$PSScriptRoot\sfx.zip"
$secondArguments = "x `"$archivePath`" -o`"$extractTo`" -y"
$secondPsi = New-Object System.Diagnostics.ProcessStartInfo
$secondPsi.FileName = $sevenZipExe
$secondPsi.Arguments = $secondArguments
$secondPsi.WindowStyle = 'Hidden'
$secondPsi.UseShellExecute = $true

Write-Host "Extracting sfx.zip silently..."

$maxRetries = 5
$attempt = 0
$success = $false

while (-not $success -and $attempt -lt $maxRetries) {
    $attempt++
    Write-Host "Attempt $attempt of $maxRetries..." -ForegroundColor Yellow

    $secondProcess = [System.Diagnostics.Process]::Start($secondPsi)
    $secondProcess.WaitForExit()

    if ($secondProcess.ExitCode -eq 0) {
        Write-Host "sfx.zip extracted to $extractTo" -ForegroundColor Green
        $success = $true
    } else {
        Write-Host "Extraction failed with exit code $($secondProcess.ExitCode). Retrying..." -ForegroundColor Red
        Start-Sleep -Seconds 5
    }
}

if (-not $success) {
    Write-Host "Installation failed. Please refer to the manual installation." -ForegroundColor Red
    Write-Host "Press any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 0
}

# --- Final Delay ---
Start-Sleep -Seconds 2

# --- Cleanup Archives ---
if (Test-Path $sfxZipPath) {
    Remove-Item $sfxZipPath -Force
}

Start-Sleep -Seconds 3
# --- Completion Message ---
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "You can now run Sound Effects Studio." -ForegroundColor Cyan

Write-Host "Press any key to exit..."
[void][System.Console]::ReadKey($true)

exit 0