# Script para levantar n8n con flujos importados y túnel Cloudflare en Windows

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Levantando RAX n8n + Cloudflare Tunnel" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "Por favor, instala Docker Desktop o asegúrate de que el daemon esté corriendo." -ForegroundColor Yellow
    exit 1
}

Write-Host "=> Construyendo contenedor con los 19 workflows de RAX..." -ForegroundColor Green
docker compose build n8n

Write-Host "=> Levantando servicios (n8n + cloudflared)..." -ForegroundColor Green
docker compose up -d

Write-Host "=> Servicios iniciados exitosamente." -ForegroundColor Green
Write-Host "=> n8n accesible localmente en: http://localhost:5678" -ForegroundColor Yellow
Write-Host "=> Verificando logs del túnel Cloudflare..." -ForegroundColor Cyan
docker compose logs cloudflared --tail 20

