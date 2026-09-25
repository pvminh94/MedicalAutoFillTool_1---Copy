@echo off
REM ============================================================================
REM  PUBLISH ban desktop ra 1 FILE .EXE duy nhat (tu chua .NET, win-x64).
REM
REM  Ket qua: publish\desktop\MedicalAutoFillTool.exe
REM  Copy file nay sang may khac la CHAY duoc, khong can cai .NET o may do.
REM  May do van can "Microsoft Edge WebView2 Runtime" - Win10/11 thuong co san;
REM  neu thieu, tai: https://developer.microsoft.com/microsoft-edge/webview2/
REM
REM  May DUNG DE BUILD (may nay) can .NET 8 SDK:
REM      https://dotnet.microsoft.com/download/dotnet/8.0
REM ============================================================================
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 goto no_sdk

set DOTNETVER=
for /f "usebackq delims=" %%v in (`dotnet --version 2^>nul`) do if not defined DOTNETVER set DOTNETVER=%%v
if not defined DOTNETVER goto no_sdk
echo .NET SDK dang dung: %DOTNETVER%

REM Project nay target net8.0-windows7.0 -> can SDK 8.0 tro len.
set MAJOR=
for /f "tokens=1 delims=." %%a in ("%DOTNETVER%") do set MAJOR=%%a
if defined MAJOR if %MAJOR% LSS 8 goto old_sdk

set OUT=publish\desktop
if exist "%OUT%" rmdir /s /q "%OUT%"

echo.
echo ===== Publish single-file (self-contained, win-x64) =====
echo     Lan build dau se tai goi NuGet (Microsoft.Web.WebView2...) nen can mang.
echo.
dotnet publish MedicalAutoFillTool.csproj -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -o "%OUT%"
if errorlevel 1 goto fail

echo.
echo ===== XONG =====
dir "%OUT%\*.exe"
echo.
echo File chay      : %~dp0%OUT%\MedicalAutoFillTool.exe
echo.
echo Cau hinh + log : Uu tien nam NGAY CANH file .exe (che do portable, tien cho
echo                  USB/chay khong can cai) NEU thu muc do ghi duoc.
echo                  Neu khong ghi duoc (vd de trong Program Files, o chi doc)
echo                  thi tu chuyen sang:
echo                    %%LocalAppData%%\MedicalAutoFillTool\config\forms.json
echo                    %%LocalAppData%%\MedicalAutoFillTool\logs\
echo                  (Ung dung tu quyet dinh, khong can tao thu muc/th file nao.)
echo.
pause
exit /b 0

:no_sdk
echo.
echo [LOI] Khong chay duoc lenh "dotnet" - chua cai .NET SDK hoac chua vao PATH.
echo       Tai .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
echo       Cai xong, MO LAI cua so cmd roi chay lai file nay.
echo       (Chi may dung de BUILD moi can .NET; may CHAY app thi khong can.)
echo.
pause
exit /b 1

:old_sdk
echo.
echo [LOI] .NET SDK %DOTNETVER% qua cu - can ban 8.0 tro len de build project nay.
echo       Tai .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0
echo       (Cai them duoc, khong can go ban cu.)
echo.
pause
exit /b 1

:fail
echo.
echo [LOI] Publish that bai - xem thong bao cua dotnet o ngay phia tren.
echo       Nguyen nhan pho bien:
echo         - chua cai .NET 8 SDK (hoac thieu Desktop targeting pack)
echo         - khong co mang de tai goi NuGet trong lan build dau
echo         - file dang mo trong Visual Studio/ung dung khac nen bi khoa
echo.
pause
exit /b 1
