@echo off
REM ============================================
REM RUN - Medical Auto Fill (Tat ca trong 1)
REM ============================================
cd /d "%~dp0"

echo ===== KHOI DONG MedicalAutoFillWeb (Web App) =====
start "Web App" dotnet run --project MedicalAutoFillWeb\MedicalAutoFillWeb.csproj --urls "http://0.0.0.0:5000"

echo.
echo ===== KHOI DONG MedinetBridge =====
echo Dang cho WebView2 khoi dong medinet...
start "Medinet Bridge" dotnet run --project MedinetBridge\MedinetBridge.csproj

echo.
echo ===== DA KHOI DONG XONG =====
echo.
echo Mo trinh duyet, truy cap: http://localhost:5000
echo.
pause