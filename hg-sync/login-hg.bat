@echo off
title Login no Hourglass
chcp 65001 >nul
echo ======================================================
echo    Solicitando abertura do Chrome para login no HG...
echo ======================================================
echo (O servidor HG-Sync precisa estar rodando: start-hgsync.bat)
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post http://localhost:4610/api/session/login | Out-Null; Write-Host 'OK - aguarde a janela do Chrome abrir e faca login.' } catch { Write-Host 'ERRO: servidor HG-Sync nao esta rodando. Execute start-hgsync.bat primeiro.' }"
pause
