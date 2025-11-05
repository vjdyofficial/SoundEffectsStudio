Add-Type -AssemblyName System.Windows.Forms

$cd = New-Object System.Windows.Forms.ColorDialog
$cd.FullOpen = $true   # Shows full advanced color options

$result = $cd.ShowDialog()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    $color = $cd.Color
    # Convert to #RRGGBB hex format
    $hex = "#{0:X2}{1:X2}{2:X2}" -f $color.R, $color.G, $color.B
    Write-Output $hex
}
else {
    Write-Output "cancel"
}
