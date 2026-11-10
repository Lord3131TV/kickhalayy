@echo off
chcp 65001 >nul
title Kick Halay
cd /d "%~dp0"

echo.
echo  ========================================
echo     KICK HALAY - Baslatiliyor...
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [HATA] Node.js bulunamadi!
  echo  https://nodejs.org adresinden LTS surumunu indirip kurun.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  Bagimliliklar yukleniyor (ilk calistirma)...
  call npm install
  if errorlevel 1 (
    echo  [HATA] npm install basarisiz.
    pause
    exit /b 1
  )
  echo.
)

if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo  .env dosyasi olusturuldu. Isterseniz duzenleyebilirsiniz.
    echo.
  )
)

echo  Sunucu baslatiliyor...
echo  Overlay : http://localhost:3000/overlay?channel=KANAL_ADI
echo  Yonetim : http://localhost:3000/admin
echo.
echo  Kapatmak icin Ctrl+C
echo.

node src/server.js

pause
