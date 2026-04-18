@echo off
:: Drag your PNG onto this BAT file
:: It will generate a multi-DPI ICO with the same name

:: Get full path of the dragged file
set "fullpath=%~1"
if "%fullpath%"=="" (
    echo Please drag a PNG onto this script.
    pause
    exit /b
)

:: Get filename without extension
for %%f in ("%fullpath%") do set "filename=%%~nf"
:: Get folder of the file
for %%f in ("%fullpath%") do set "folder=%%~dpf"

:: Build output ICO path
set "output=%folder%%filename%.ico"

:: Run ImageMagick
magick "%fullpath%" -background none -define icon:auto-resize=16,24,32,48,64,128,256 "%output%"

echo ICO created: %output%
pause
