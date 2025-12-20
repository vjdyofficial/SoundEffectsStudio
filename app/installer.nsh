# Force per-user installation only
!macro customInstallDir
  # Set the default install directory
  InstallDir "$LOCALAPPDATA\\VJDY FM Sound Effects Studio"
!macroend

# Disable changing the install directory
!macro customComponents
  !insertmacro MUI_INSTALLOPTIONS_WRITE "ioSpecial.ini" "Field 2" "State" "0"
!macroend
