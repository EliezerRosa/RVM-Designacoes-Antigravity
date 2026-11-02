# ==============================================================================
# Script de Instalacao do Servico Permanente HG-Sync (Agendador de Tarefas)
# ==============================================================================
$TaskName = "RVM-HG-Sync"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$VbsScript = Join-Path $ScriptDir "run-silent.vbs"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Instalando HG-Sync como Servico em Segundo Plano       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Diretorio: $ScriptDir"
Write-Host "Script VBS: $VbsScript"

# Garante instalacao de dependencias
if (-not (Test-Path (Join-Path $ScriptDir "node_modules"))) {
    Write-Host "`nInstalando dependencias locais do hg-sync..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    npm install
    Pop-Location
}

# Cria a Acao para rodar wscript com o VBS silencioso
$Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$VbsScript`"" -WorkingDirectory $ScriptDir

# Cria o Gatilho para iniciar no logon do usuario
$Trigger = New-ScheduledTaskTrigger -AtLogOn

# Configuracoes de resiliencia: sem limite de tempo, auto-restart em caso de falha
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Registra a tarefa
try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Sincronizador permanente e desacoplado RVM Designacoes <-> Hourglass" -Force
    Write-Host "`n✅ Tarefa agendada '$TaskName' criada com sucesso!" -ForegroundColor Green

    # Inicia imediatamente
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "🚀 HG-Sync iniciado em segundo plano!" -ForegroundColor Green
    Write-Host "`nAcesse o painel em: http://localhost:4610" -ForegroundColor Cyan
} catch {
    Write-Host "`n❌ Erro ao registrar tarefa agendada: $_" -ForegroundColor Red
}

