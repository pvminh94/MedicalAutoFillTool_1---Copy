@echo off
REM ============================================
REM DEPLOY - Medical Auto Fill (IIS)
REM ============================================
cd /d "%~dp0"

echo === PUBLISH: MedicalAutoFillWeb ===
dotnet publish MedicalAutoFillWeb\MedicalAutoFillWeb.csproj -c Release -o publish\medicalautofillweb

echo.
echo === BUILD: MedinetBridge (Release) ===
dotnet publish MedinetBridge\MedinetBridge.csproj -c Release -o publish\medinetbridge -p:PublishSingleFile=true -p:RuntimeIdentifier=win-x64 --self-contained true

echo.
echo === COPY SANG IIS ===
set IIS_PATH=C:\inetpub\wwwroot\medicalautofillweb

if exist "%IIS_PATH%" (
    echo xcopy /E /Y publish\medicalautofillweb\* "%IIS_PATH%\"
    xcopy /E /Y publish\medicalautofillweb\* "%IIS_PATH%\"
    echo.
    echo === DA COPY XONG ===
    echo Mo trinh duyet: http://localhost/medicalautofillweb
) else (
    echo.
    echo === DA PUBLISH XONG ===
    echo - Web: %~dp0publish\medicalautofillweb
    echo - Bridge: %~dp0publish\medinetbridge\MedinetBridge.exe
    echo.
    echo Huong dan:
    echo 1. Mo IIS Manager, tao Site/Application tro toi: %~dp0publish\medicalautofillweb
    echo 2. Chay MedinetBridge.exe tren may chu
    echo 3. Tat ca may trong phong: mo link http://[IP-may-chu]/medicalautofillweb
)

pause
