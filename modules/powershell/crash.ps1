
param(
    [string]$Reason = "unknown",
    [string]$ExitCode = "Unknown"
)

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()

# --------------------------------------------------
# APPLICATION INFORMATION
# --------------------------------------------------

$AppName = "ANDROMEDA CRASHED!"

$Title = "Sound Effects Studio detected an unexpected problem to the rendering process of the main workspace and the app is now terminated."

$Reason = $Reason.ToLowerInvariant()

# --------------------------------------------------
# CRASH REASON MESSAGES
# --------------------------------------------------

switch ($Reason) {

    "killed" {
        $Message = "The application was terminated by Windows or another process."
    }

    "crashed" {
        $Message = "The application encountered an unexpected error and stopped working."
    }

    "oom" {
        $Message = "The application ran out of available memory. please ensure that you have more available memory to run the app properly."
    }

    "unresponsive" {
        $Message = "The application stopped responding. It may have become unresponsive or hung."
    }

    "launch-failed" {
        $Message = "The application failed to launch a required process."
    }

    "integrity-failure" {
        $Message = "The application process failed an integrity check."
    }

    "clean-exit" {
        $Message = "The application process exited normally."
    }

    default {
        $Reason = "unknown"
        $Message = "The application encountered an unknown problem and stopped unexpectedly."
    }
}

# --------------------------------------------------
# TECHNICAL DETAILS
# --------------------------------------------------

$Details = @"
Crash reason: $Reason
Exit code: $ExitCode
"@

# --------------------------------------------------
# NATIVE WINDOWS TASK DIALOG
# --------------------------------------------------

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class NativeTaskDialog
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct TASKDIALOGCONFIG
    {
        public uint cbSize;
        public IntPtr hwndParent;
        public IntPtr hInstance;
        public uint dwFlags;
        public uint dwCommonButtons;
        public string pszWindowTitle;
        public IntPtr hMainIcon;
        public string pszMainInstruction;
        public string pszContent;
        public uint cButtons;
        public IntPtr pButtons;
        public int nDefaultButton;
        public uint cRadioButtons;
        public IntPtr pRadioButtons;
        public int nDefaultRadioButton;
        public string pszVerificationText;
        public string pszExpandedInformation;
        public string pszExpandedControlText;
        public string pszCollapsedControlText;
        public IntPtr hFooterIcon;
        public string pszFooter;
        public IntPtr pfCallback;
        public IntPtr lpCallbackData;
        public uint cxWidth;
    }

    [DllImport("comctl32.dll", CharSet = CharSet.Unicode)]
    public static extern int TaskDialogIndirect(
        ref TASKDIALOGCONFIG pTaskConfig,
        out int pnButton,
        out int pnRadioButton,
        out bool pfVerificationFlagChecked
    );
}
"@

# --------------------------------------------------
# DIALOG CONFIGURATION
# --------------------------------------------------

$config = New-Object NativeTaskDialog+TASKDIALOGCONFIG

$config.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($config)

$config.hwndParent = [IntPtr]::Zero
$config.hInstance = [IntPtr]::Zero

# Flags:
# 0x0008 = Expandable information
# 0x0020 = Allow cancellation
# 0x0800 = Size to content

$config.dwFlags = 0x0008 -bor 0x0020 -bor 0x0800

# Common buttons:
# 0x0001 = OK

$config.dwCommonButtons = 0x0001

$config.pszWindowTitle = $AppName

# Main instruction: large title
$config.pszMainInstruction = $Title

# Main message
$config.pszContent = $Message

# Expanded technical information
$config.pszExpandedInformation = $Details

$config.pszExpandedControlText = "Hide details"
$config.pszCollapsedControlText = "Show details"

# Main icon: error
$config.hMainIcon = [IntPtr](-1)

# --------------------------------------------------
# SHOW DIALOG
# --------------------------------------------------

try {

    $button = 0
    $radio = 0
    $verification = $false

    $result = [NativeTaskDialog]::TaskDialogIndirect(
        [ref]$config,
        [ref]$button,
        [ref]$radio,
        [ref]$verification
    )

    if ($result -ne 0) {
        throw "TaskDialogIndirect failed. HRESULT: $result"
    }

}
catch {

    # Fallback if native Task Dialog is unavailable
    [System.Windows.Forms.MessageBox]::Show(
        "$Title`r`n`r`n$Message`r`n`r`n$Details",
        $AppName,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null

}
