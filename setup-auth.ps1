<#
.SYNOPSIS
    Setup automático do Auth para RVM Designações
.DESCRIPTION
    Este script configura o Google OAuth + tabelas de auth no Supabase.
    Requer o Service Role Key do Supabase.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceRoleKey
)

$ErrorActionPreference = "Stop"

# Load Supabase URL from .env.local
$envFile = Get-Content "$PSScriptRoot\.env.local" -ErrorAction SilentlyContinue
if (-not $envFile) { $envFile = Get-Content "$PSScriptRoot\.env" }
$supabaseUrl = ($envFile | Select-String "VITE_SUPABASE_URL=" | ForEach-Object { $_ -replace '.*VITE_SUPABASE_URL=','' }).Trim('"', "'", ' ')

if (-not $supabaseUrl) {
    Write-Error "VITE_SUPABASE_URL não encontrado nos arquivos .env"
    exit 1
}

Write-Host "`n=== RVM Designações - Auth Setup ===" -ForegroundColor Cyan
Write-Host "Supabase URL: $supabaseUrl" -ForegroundColor Gray

# ── 1. Executar SQL migrations ──────────────────────────────
Write-Host "`n[1/3] Criando tabelas de autenticação..." -ForegroundColor Yellow

$sqlFile = Get-Content "$PSScriptRoot\supabase\migrations\001_auth_tables.sql" -Raw

$headers = @{
    "apikey"        = $ServiceRoleKey
    "Authorization" = "Bearer $ServiceRoleKey"
    "Content-Type"  = "application/json"
    "Prefer"        = "return=minimal"
}

# Execute SQL via Supabase REST (pg/query endpoint)
$sqlBody = @{ query = $sqlFile } | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/rpc/exec_sql" -Method POST -Headers $headers -Body $sqlBody -ErrorAction Stop
    Write-Host "  [FALHA] Endpoint exec_sql não existe, tentando via pg..." -ForegroundColor Red
} catch {
    # Fallback: Execute statements one by one via the SQL endpoint
    Write-Host "  Usando endpoint alternativo..." -ForegroundColor Gray
}

# Split SQL into individual statements and execute via REST
$statements = $sqlFile -split ';\s*\n' | Where-Object { $_.Trim() -ne '' -and $_.Trim() -notmatch '^--' }

$success = 0
$failed = 0

foreach ($stmt in $statements) {
    $clean = $stmt.Trim()
    if ($clean.Length -lt 5) { continue }
    
    try {
        # Try using the Supabase SQL API  
        $body = @{ query = "$clean;" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/rpc/" -Method POST -Headers $headers -Body $body -ErrorAction Stop | Out-Null
        $success++
    } catch {
        # If RPC fails, we'll note it for manual execution
        $failed++
    }
}

if ($failed -gt 0) {
    Write-Host "`n  ⚠️  Não foi possível executar $failed statements via API." -ForegroundColor Yellow
    Write-Host "  O Supabase não expõe DDL via REST API com service role key." -ForegroundColor Yellow
    Write-Host "`n  → Abra o SQL Editor no Supabase Dashboard e cole o conteúdo de:" -ForegroundColor White
    Write-Host "    supabase\migrations\001_auth_tables.sql" -ForegroundColor Cyan
    Write-Host "`n  Abrindo o SQL Editor..." -ForegroundColor Gray
    
    $projectRef = ($supabaseUrl -replace 'https://','') -replace '\.supabase\.co.*',''
    Start-Process "https://supabase.com/dashboard/project/$projectRef/sql/new"
    
    # Copy SQL to clipboard
    $sqlFile | Set-Clipboard
    Write-Host "  ✅ SQL copiado para a área de transferência! Cole com Ctrl+V no editor." -ForegroundColor Green
} else {
    Write-Host "  ✅ $success statements executados com sucesso!" -ForegroundColor Green
}

# ── 2. Habilitar Google OAuth ──────────────────────────────
Write-Host "`n[2/3] Configurando Google OAuth Provider..." -ForegroundColor Yellow

$projectRef = ($supabaseUrl -replace 'https://','') -replace '\.supabase\.co.*',''

Write-Host "  → Abrindo a página de providers do Supabase..." -ForegroundColor Gray
Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/providers"

Write-Host "`n  Instruções:" -ForegroundColor White
Write-Host "  1. Na página que abriu, encontre 'Google' e ative o toggle" -ForegroundColor Gray
Write-Host "  2. Vai pedir Client ID e Client Secret do Google" -ForegroundColor Gray
Write-Host "  3. Se não tiver, abra o Google Cloud Console (abrindo em 5s)..." -ForegroundColor Gray

Start-Sleep -Seconds 2
Start-Process "https://console.cloud.google.com/apis/credentials"

Write-Host "`n  No Google Cloud Console:" -ForegroundColor White
Write-Host "  1. Selecione seu projeto (ou crie um novo)" -ForegroundColor Gray
Write-Host "  2. Clique '+ CREATE CREDENTIALS' → 'OAuth client ID'" -ForegroundColor Gray
Write-Host "  3. Application type: 'Web application'" -ForegroundColor Gray
Write-Host "  4. Authorized redirect URI:" -ForegroundColor Gray
Write-Host "     $supabaseUrl/auth/v1/callback" -ForegroundColor Cyan
Write-Host "  5. Copie Client ID e Client Secret → cole no Supabase" -ForegroundColor Gray

# ── 3. Configurar Redirect URLs ──────────────────────────────
Write-Host "`n[3/3] Configurando Redirect URLs..." -ForegroundColor Yellow
Start-Process "https://supabase.com/dashboard/project/$projectRef/auth/url-configuration"

Write-Host "`n  Configurar:" -ForegroundColor White
Write-Host "  Site URL: https://rvm-designacoes-antigravity.vercel.app" -ForegroundColor Cyan
Write-Host "  Redirect URLs: https://rvm-designacoes-antigravity.vercel.app" -ForegroundColor Cyan

Write-Host "`n=== Setup concluído! ===" -ForegroundColor Green
Write-Host "Após configurar tudo acima, o login com Google estará funcional." -ForegroundColor Gray

Read-Host "`nPressione Enter para sair"
