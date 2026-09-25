@echo off
REM ============================================================================
REM  CHAY BAN DESKTOP (WinForms + WebView2) — 1 file .exe, khong can IIS/Bridge
REM  Day la ban khuyen dung: dan truc tiep tu Excel, dien truc tiep vao medinet.
REM ============================================================================
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay .NET SDK trong PATH.
    echo       Tai .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
    echo       Neu chi muon CHAY app, dung file .exe da publish san (xem publish-winforms.bat).
    pause
    exit /b 1
)

echo ===== Build + chay MedicalAutoFillTool (desktop) =====
dotnet run --project MedicalAutoFillTool.csproj -c Release
if errorlevel 1 (
    echo.
    echo [LOI] Build/chay that bai. Xem thong bao o tren.
    echo       Nguyen nhan pho bien: thieu "Microsoft Edge WebView2 Runtime".
    echo       Tai: https://developer.microsoft.com/microsoft-edge/webview2/
    pause
)
