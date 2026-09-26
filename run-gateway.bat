@echo off
title bKash Custom Payment Gateway & Project Manager
echo ==========================================================
echo Starting bKash Custom Payment Gateway Server on Port 7000
echo ==========================================================
cd /d "%~dp0"
node server.js
pause
