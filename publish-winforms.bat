@echo off
REM ============================================================================
REM  PUBLISH ban desktop ra 1 FILE .EXE duy nhat (tu chua .NET, win-x64).
REM  Ket qua: publish\desktop\MedicalAutoFillTool.exe
REM  Copy file nay sang may khac la chay duoc, khong can cai .NET.
REM  (May do van can "Microsoft Edge WebView2 Runtime" — Win10/11 thuong co san.)
REM ============================================================================
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay .NET SDK. Tai: https://dotnet.microsoft.com/download/dotnet/8.0
    pause
    exit /b 1
)

set OUT=publish\desktop
if exist "%OUT%" rmdir /s /q "%OUT%"

echo ===== Publish single-file (self-contained, win-x64) =====
dotnet publish MedicalAutoFillTool.csproj -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -o "%OUT%"
if errorlevel 1 (
    echo [LOI] Publish that bai.
    pause
    exit /b 1
)

echo.
echo ===== XONG =====
dir "%OUT%\*.exe"
echo.
echo File chay: %~dp0%OUT%\MedicalAutoFillTool.exe
echo Cau hinh se tu sinh o: %%APPDATA%%\MedicalAutoFillTool\config\forms.json
echo   (hoac tao file "config" canh .exe de chay che do portable)
echo Log: %%APPDATA%%\MedicalAutoFillTool\logs\
pause
