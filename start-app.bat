@echo off
title AI-SMC 7 นางฟ้า (Smart Money Concepts)
echo ========================================================
echo   AI-SMC-News: ระบบวิเคราะห์หุ้น 7 นางฟ้า (LuxAlgo SMC)
echo ========================================================
echo กำลังเปิดระบบและเว็บบราวเซอร์ที่ http://localhost:3000 ...
cd /d "%~dp0"
start http://localhost:3000
cmd /c "npm run dev"
pause
