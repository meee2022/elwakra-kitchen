@echo off
chcp 65001 >nul
title نظام مطابخ الجنوب - نقاط البيع
cd /d "%~dp0"

echo.
echo   ================================================
echo    مطابخ الجنوب للماكولات الشعبية
echo    نظام نقاط البيع والفواتير الالكترونية
echo   ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo   [!] بايثون غير مثبت على الجهاز.
  echo       افتح ملف index.html مباشرة بالمتصفح كحل بديل،
  echo       او نزّل بايثون من python.org لتشغيل النظام كتطبيق مثبت.
  echo.
  pause
  exit /b 1
)

echo   جاري التشغيل... لا تقفل هذه النافذة اثناء العمل.
echo   لايقاف النظام: اضغط Ctrl+C او اقفل النافذة.
echo.

start "" http://localhost:8777
python -m http.server 8777 --bind 127.0.0.1
