@echo off
title Huma Radar - dev server
REM Double-click this to run Huma Radar locally.
REM
REM It only delegates to the PowerShell script next to it. Do not move the npm
REM commands back in here: launching Vite from cmd.exe in this path corrupts the
REM non-ASCII characters in "Masaustu" on the way to Node, and the app renders
REM blank. See start-huma-radar.ps1 for the full explanation.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-huma-radar.ps1"
