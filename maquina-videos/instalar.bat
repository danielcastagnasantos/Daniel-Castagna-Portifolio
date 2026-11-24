@echo off
rem ============================================================
rem  Maquina de Videos - instalacao (rode uma vez)
rem ============================================================
cd /d "%~dp0"
title Maquina de Videos - instalacao

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERRO] Node.js nao encontrado.
  echo Instale a versao LTS em https://nodejs.org  (precisa ser 22 ou mais nova^) e rode de novo.
  pause
  exit /b 1
)

echo [1/4] Instalando dependencias (pode demorar alguns minutos^)...
call npm install
if errorlevel 1 (
  echo [ERRO] npm install falhou.
  pause
  exit /b 1
)

echo [2/4] Compilando a interface web...
call npm run build:web
if errorlevel 1 (
  echo [ERRO] Falha ao compilar a interface.
  pause
  exit /b 1
)

echo [3/4] Criando o arquivo .env (se ainda nao existir^)...
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo     Criado. Abra o arquivo .env no Bloco de Notas para colocar suas chaves quando quiser.
) else (
  echo     .env ja existe, mantido.
)

echo [4/4] Verificando o ambiente...
call npm run doctor
echo.
echo Instalacao concluida. Para usar, de dois cliques em iniciar.bat
echo (Se o FFmpeg estiver faltando: abra o PowerShell e rode  winget install Gyan.FFmpeg  e reabra esta janela.^)
pause
