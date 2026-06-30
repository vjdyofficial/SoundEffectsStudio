Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.FontDialog
$dialog.ShowColor = $false

if ($dialog.ShowDialog() -eq "OK") {
    $dialog.Font.Name
}