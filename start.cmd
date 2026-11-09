@echo off
cd /d "%~dp0"
node scripts\serve.mjs --host 127.0.0.1 --port 4178
if errorlevel 1 pause
