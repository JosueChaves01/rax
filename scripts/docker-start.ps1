# Script para levantar n8n con flujos importados y túnel Cloudflare en Windows

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Levantando RAX n8n + Cloudflare Tunnel" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Comprobar que el comando docker esté disponible
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] El comando 'docker' no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "Por favor instala Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    exit 1
}

# 2. Comprobar que el daemon de Docker (Docker Desktop) esté corriendo
Write-Host "=> Comprobando conexión con el motor de Docker Desktop..." -ForegroundColor Cyan
$null = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] Docker Desktop está instalado pero NO está en ejecución." -ForegroundColor Red
    Write-Host "Causa: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified." -ForegroundColor DarkGray
    Write-Host "`n>> Solución en 1 paso:" -ForegroundColor Yellow
    Write-Host "1. Abre la aplicación 'Docker Desktop' desde tu menú Inicio de Windows." -ForegroundColor White
    Write-Host "2. Espera unos segundos a que el ícono de la ballena (abajo a la derecha) esté en VERDE ('Engine running')." -ForegroundColor White
    Write-Host "3. Vuelve a ejecutar: .\scripts\docker-start.ps1`n" -ForegroundColor White
    exit 1
}

# 3. Detectar archivo de variables de entorno (.env.local o .env)
$envFile = ".env.local"
if (-not (Test-Path .env.local)) {
    if (Test-Path .env) {
        $envFile = ".env"
    } else {
        Write-Host "[AVISO] No se encontró .env.local ni .env en la raíz del proyecto." -ForegroundColor Yellow
    }
}
Write-Host "=> Usando variables de entorno desde: $envFile" -ForegroundColor Cyan

# 4. Construir imagen de n8n con los 19 workflows
Write-Host "=> Construyendo contenedor con los 19 workflows de RAX..." -ForegroundColor Green
docker compose --env-file $envFile build n8n
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Falló la construcción del contenedor de n8n." -ForegroundColor Red
    exit 1
}

# 5. Levantar servicios
Write-Host "=> Levantando servicios (n8n + cloudflared)..." -ForegroundColor Green
docker compose --env-file $envFile up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Falló el inicio de los contenedores." -ForegroundColor Red
    exit 1
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  ¡Servicios iniciados correctamente!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "=> n8n accesible localmente en: http://localhost:5678" -ForegroundColor Yellow
Write-Host "`nEstado de los contenedores:" -ForegroundColor Cyan
docker compose --env-file $envFile ps

Write-Host "`nÚltimos logs del túnel Cloudflare:" -ForegroundColor Cyan
docker compose --env-file $envFile logs cloudflared --tail 15
