@echo off
title Shaxsiy AI Buxgalter - Bi-directional HA Server & Watchdog
cd /d "%~dp0"
echo =================================================================
echo   Shaxsiy AI Buxgalter - Bi-directional Auto-Failover System
echo   Asosiy: Render (Cloud) ^| Zaxira: Lokal Polling + Tunnel
echo =================================================================
python run_unified_server.py
pause
