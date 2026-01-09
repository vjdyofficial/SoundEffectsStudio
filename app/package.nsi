; Include MUI2
!include MUI2.nsh

;--------------------------------
; Macro to add a file association
; Usage: !insertmacro AddFileAssociation ".ext" "ProgID" "Description" "IconPath"
;--------------------------------
!macro AddFileAssociation EXT PROGID DESC ICON
    WriteRegStr HKCR "${EXT}" "" "${PROGID}"
    WriteRegStr HKCR "${PROGID}" "" "${DESC}"
    WriteRegStr HKCR "${PROGID}\DefaultIcon" "" "$INSTDIR\${ICON}"
    WriteRegStr HKCR "${PROGID}\Shell\Open\Command" "" '"$INSTDIR\${APP_EXEC}" "%1"'
!macroend

;--------------------------------
; App Definitions
;--------------------------------
!define APP_NAME "VJDY FM Sound Effects Studio"
!define MUI_PRODUCT "SFXStudio Package Installer"
!define APP_EXEC "VJDY FM Sound Effects Studio.exe"
!define APP_DIR "$LOCALAPPDATA\${APP_NAME}"
!define ICON_FILE "icons\\icon.ico"
!define BANNER_FILE "icons\\banner.bmp"

; General Installer Settings
Name "${MUI_PRODUCT}"
OutFile "dist\\sfxstudio-setup.exe"
InstallDir "${APP_DIR}"
RequestExecutionLevel user

; Installer icon
!define MUI_ICON "${ICON_FILE}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${BANNER_FILE}"

; Fonts
!define MUI_HEADERFONT "Segoe UI"
!define MUI_INSTFILEFONT "Segoe UI"

;--------------------------------
; Page Texts (define before page macros)
;--------------------------------
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${APP_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT  "This will install ${APP_NAME} on your user account.Click Next to continue."

!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT   "The installation of ${APP_NAME} is complete. Click Finish to exit the installer."

;--------------------------------
; Pages (insert first)
;--------------------------------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

;--------------------------------
; Language (insert AFTER pages)
;--------------------------------
!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Installer Section
;--------------------------------
Section "Install"

  ; Set output path
  SetOutPath "$INSTDIR"
  CreateDirectory "$INSTDIR"

  ; Copy files
  File /r "dist\win-unpacked\*.*"

  ; Desktop shortcut
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXEC}" "" "$INSTDIR\resources\app\icon.ico" 0

  ; Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXEC}" "" "$INSTDIR\resources\app\icon.ico" 0

  ; File associations
  !insertmacro AddFileAssociation ".subw" "SFXStudioBassPresetFile" "SFXStudio Bass Preset" "resources\app\icons\iconfile_subw.ico"
  !insertmacro AddFileAssociation ".bbcx" "BBCodeTelepromptFile" "BBCode Teleprompt Format" "icons\iconfile_bbcx.ico"
  !insertmacro AddFileAssociation ".b64i" "SFXStudioB64ImageFile" "SFXStudio Base64 Image String" "icons\iconfile_b64i.ico"
  !insertmacro AddFileAssociation ".cdt" "SFXStudioChunkDataFile" "SFXStudio Chunk Data File" "icons\iconfile_cdt.ico"

  ; Write uninstall registry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$INSTDIR\unins000.exe"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\unins000.exe"

SectionEnd

;--------------------------------
; Uninstaller Section
;--------------------------------
Section "Uninstall"

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  ; Remove all files in installation directory
  Delete "${APP_DIR}\*.*"
  RMDir "${APP_DIR}"

  ; Remove uninstall registry key
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

SectionEnd