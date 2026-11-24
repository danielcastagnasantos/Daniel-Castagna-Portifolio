@echo off
rem ============================================================
rem  Maquina de Videos - iniciar
rem ============================================================
cd /d "%~dp0"
title Maquina de Videos

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Rode instalar.bat primeiro.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Primeira execucao: instalando...
  call instalar.bat
)
if not exist "web\dist\index.html" (
  echo Compilando a interface web...
  call npm run build:web
)

echo.
echo Abrindo http://localhost:8787  (feche esta janela para encerrar^)
echo.
start "" "http://localhost:8787"
call npm start
echo.
echo O servidor parou. Veja a mensagem acima.
pause
