@echo off
REM ============================================================================
REM  CHAY BAN WEB (1 may chu - ca phong dung trinh duyet)
REM  Gom 2 tien trinh:
REM    1. MedicalAutoFillWeb  (ASP.NET Core, cong 5000)  — trang dan du lieu
REM    2. MedinetBridge       (WebView2, cong 5119)      — giu phien dang nhap medinet
REM
REM  Neu chi can 1 nguoi dung tren 1 may -> dung run-winforms.bat (don gian hon,
REM  khong can Bridge, khong can IIS).
REM ============================================================================
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay .NET SDK trong PATH.
    echo       Tai .NET 9 SDK: https://dotnet.microsoft.com/download/dotnet/9.0
    pause
    exit /b 1
)

echo ===== 1/2  KHOI DONG Web App (cong 5000) =====
start "MedicalAutoFill Web" dotnet run --project MedicalAutoFillWeb\MedicalAutoFillWeb.csproj --urls "http://0.0.0.0:5000"

echo.
echo ===== 2/2  KHOI DONG MedinetBridge (cong 5119) =====
echo Dang cho WebView2 mo medinet... hay DANG NHAP medinet trong cua so Bridge.
start "Medinet Bridge" dotnet run --project MedinetBridge\MedinetBridge.csproj

echo.
echo ===== DA KHOI DONG XONG =====
echo.
echo  May nay         : http://localhost:5000
echo  May khac trong phong: http://[IP-may-chu]:5000
echo   (xem IP bang lenh: ipconfig)
echo.
echo  Neu trang web bao "Bridge: khong phan hoi":
echo   - cua so MedinetBridge phai dang chay tren MAY CHU nay
echo   - trong cua so do, medinet phai da dang nhap va mo DUNG FORM can dien
echo.
pause
