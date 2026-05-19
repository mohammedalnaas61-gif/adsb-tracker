@echo off
title ADS-B Airband Audio Server
echo ============================================================
echo   ADS-B Airband Audio Server
echo   This server enables live ATC/airband listening
echo   via your RTL-SDR dongle.
echo.
echo   NOTE: While listening to airband, ADS-B tracking pauses.
echo         It auto-restarts when you stop listening.
echo ============================================================
echo.
python airband_server.py
pause
