@echo off
title HG-Sync - RVM Designações ^<--^> Hourglass
echo ======================================================
echo    Iniciando HG-Sync (Servico de Sincronizacao RVM/HG)
echo ======================================================
cd /d "%~dp0"

REM Verifica se as dependencias estao instaladas
if not exist "node_modules\" (
    echo Instalando dependencias locais do hg-sync...
    npm install
)

REM Inicia o servidor Node com tsx
echo Iniciando servidor em http://localhost:4610...
npm start

