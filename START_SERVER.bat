@echo off
title Shaxsiy AI Buxgalter - Unified Server & Render Watchdog
cd /d "%~dp0"
echo =======================================================
echo   Shaxsiy AI Buxgalter - Local Server + Auto Failback
echo =======================================================
start "Render Auto-Watchdog" /min python render_failback_watchdog.py
python run_unified_server.py
pause
