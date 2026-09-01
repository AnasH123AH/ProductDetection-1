@echo off
title VisionaryAI Server Launcher
echo ========================================================
echo  Starting VisionaryAI Product Detection Application
echo ========================================================

cd /d "C:\Users\ANAS\.gemini\antigravity\scratch\visionary-ai-login"

taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1

echo [1/2] Starting Python Computer Vision Backend (Port 8000)...
start /b python backend\app.py > python_server.log 2>&1

echo [2/2] Starting Node Web Application Server (Port 5500)...
start /b node serve.js > node_server.log 2>&1

timeout /t 3 /nobreak >nul

echo.
echo ========================================================
echo  SUCCESS! VisionaryAI is running at:
echo  http://127.0.0.1:5500/app.html#live
echo ========================================================
start http://127.0.0.1:5500/app.html#live
