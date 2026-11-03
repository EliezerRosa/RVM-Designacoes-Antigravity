@echo off
title Login no Hourglass
chcp 65001 >nul
echo ======================================================
echo    Abrindo Google Chrome para login no Hourglass...
echo ======================================================
echo.
echo 1. Faca login na sua conta Google / Hourglass na janela.
echo 2. Quando a tela do Hourglass carregar, a sessao estara salva!
echo.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%~dp0..\hourglass_session" "https://app.hourglass-app.com/v2/page/app/scheduling/mm"
