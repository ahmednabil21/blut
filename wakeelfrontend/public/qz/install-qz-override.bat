@echo off
chcp 65001 >nul
echo ========================================
echo  تثبيت شهادة QZ Tray - نظام الوكيل
echo ========================================
echo.

set "SRC=%~dp0override.crt"
if not exist "%SRC%" (
  echo لم يتم العثور على override.crt بجانب هذا الملف.
  pause
  exit /b 1
)

set "DEST1=%ProgramFiles%\QZ Tray\override.crt"
set "DEST2=%ProgramFiles(x86)%\QZ Tray\override.crt"

echo 1^) اغلق QZ Tray بالكامل من بجانب الساعة ^(Exit^)
echo 2^) سيتم نسخ الشهادة كـ override.crt
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo تحتاج تشغيل هذا الملف كمسؤول: يمين كلك -^> Run as administrator
  pause
  exit /b 1
)

if exist "%ProgramFiles%\QZ Tray\qz-tray.exe" (
  copy /Y "%SRC%" "%DEST1%"
  echo تم النسخ إلى: %DEST1%
) else if exist "%ProgramFiles(x86)%\QZ Tray\qz-tray.exe" (
  copy /Y "%SRC%" "%DEST2%"
  echo تم النسخ إلى: %DEST2%
) else (
  echo لم يتم العثور على مجلد QZ Tray. ثبّت البرنامج أولاً.
  pause
  exit /b 1
)

echo.
echo 3^) افتح QZ Tray من جديد ثم جرب الطباعة من النظام.
echo يفترض أن يظهر الموقع موثوقاً بدون تعطيل Allow عند Remember.
echo.
pause
