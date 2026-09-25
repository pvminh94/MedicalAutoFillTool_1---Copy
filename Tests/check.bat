@echo off
REM ============================================================================
REM  KIEM TRA TOAN BO REPO (khong can Visual Studio, khong can build)
REM    1. Tests/check-all.py              — cau truc C#, csproj, JS, JSON, view, engine API
REM    2. Tests/engine.test.mjs (jsdom)   — 48 case cho engine dien form
REM  Chay truoc khi commit de tranh day loi len CI.
REM ============================================================================
cd /d "%~dp0.."

where python >nul 2>nul
if errorlevel 1 (
    echo [LOI] Can Python 3 trong PATH.
    pause
    exit /b 1
)

echo ===== 1/2  Kiem tra cau truc repo =====
python Tests\check-all.py
if errorlevel 1 set FAIL=1

echo.
echo ===== 2/2  Test engine (jsdom) =====
cd Tests
if not exist node_modules (
    echo Dang cai jsdom lan dau...
    call npm install
)
call npm test
if errorlevel 1 set FAIL=1
cd ..

echo.
if defined FAIL (
    echo ===== CO LOI — xem chi tiet o tren =====
    pause
    exit /b 1
)
echo ===== TAT CA DEU DAT =====
pause
