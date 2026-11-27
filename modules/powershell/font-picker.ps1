
param(
    [long]$OwnerHandle = 0
)

# ---------------------------------------------------------------------------
# Initialize Windows Forms
# ---------------------------------------------------------------------------

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

# Set default WinForms UI font to Segoe UI
$uiFont = New-Object System.Drawing.Font(
    "Segoe UI",
    9,
    [System.Drawing.FontStyle]::Regular
)

[System.Windows.Forms.Control]::DefaultFont = $uiFont

# ---------------------------------------------------------------------------
# Create Font Dialog
# ---------------------------------------------------------------------------

$dialog = New-Object System.Windows.Forms.FontDialog

$dialog.ShowColor = $false
$dialog.ShowEffects = $false
$dialog.AllowVectorFonts = $true
$dialog.AllowScriptChange = $false

# ---------------------------------------------------------------------------
# Assign Electron window as dialog owner
# ---------------------------------------------------------------------------

$owner = $null

if ($OwnerHandle -ne 0) {
    $owner = New-Object System.Windows.Forms.NativeWindow
    $owner.AssignHandle([IntPtr]$OwnerHandle)
}

# ---------------------------------------------------------------------------
# Persistent request loop
# ---------------------------------------------------------------------------

while ($true) {

    # Read request from Electron
    $line = [Console]::In.ReadLine()

    # Exit when Electron closes stdin
    if ($null -eq $line) {
        break
    }

    try {

        $request = ConvertFrom-Json $line

        # Configure font size range
        $dialog.MinSize = [int]$request.minSize
        $dialog.MaxSize = [int]$request.maxSize

        # Display native FontDialog
        if ($owner) {
            $dialogResult = $dialog.ShowDialog($owner)
        }
        else {
            $dialogResult = $dialog.ShowDialog()
        }

        $result = @()

        if ($dialogResult -eq [System.Windows.Forms.DialogResult]::OK) {

            $font = $dialog.Font

            $italic = [int]$font.Italic
            $weight = if ($font.Bold) { 700 } else { 400 }

            $axes = "wght=$weight,ital=$italic"

            $result = @(
                $font.FontFamily.Name
                $font.Size
                $italic
                $weight
                $axes
            )
        }

        # Send result to Electron
        $json = ConvertTo-Json -InputObject @($result) -Compress

        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()

    }
    catch {

        [Console]::Error.WriteLine($_.Exception.Message)

        # Return empty array on failure
        [Console]::Out.WriteLine("[]")
        [Console]::Out.Flush()
    }
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

if ($owner) {
    $owner.ReleaseHandle()
    $owner.Dispose()
}

$dialog.Dispose()
$uiFont.Dispose()
