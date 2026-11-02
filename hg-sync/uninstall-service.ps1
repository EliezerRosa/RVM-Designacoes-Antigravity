# ==============================================================================
# Script de Remocao do Servico Permanente HG-Sync
# ==============================================================================
$TaskName = "RVM-HG-Sync"

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "   Removendo Servico HG-Sync                              " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow

try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "`n✅ Tarefa agendada '$TaskName' removida com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "`nℹ️ Tarefa '$TaskName' nao estava registrada ou erro: $_" -ForegroundColor DarkGray
}
