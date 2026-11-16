@echo off
title Shaxsiy AI Buxgalter Bot
color 0A
echo ========================================================
echo  SHAXSIY AI BUXGALTER - TELEGRAM BOT ISHGA TUSHMOQDA
echo ========================================================
echo.
cd /d "%~dp0"
:loop
node src/index.js
echo.
echo [Ogohlantirish] Bot to'xtadi. 3 soniyadan keyin qayta yoqiladi...
timeout /t 3 >nul
goto loop
