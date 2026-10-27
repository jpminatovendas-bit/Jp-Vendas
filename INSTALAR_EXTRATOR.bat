@echo off
setlocal
cd /d "%~dp0contatos-extrator"
title JP Minato - Instalar extrator de contatos
where node >nul 2>nul
if errorlevel 1 goto semnode
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 goto semnode
where npm >nul 2>nul
if errorlevel 1 goto semnode
echo Instalando o motor de contatos. Esta etapa precisa de internet...
call npm ci --omit=dev --no-audit --no-fund
if errorlevel 1 goto erro
echo Motor instalado. Abra INICIAR.bat e use Extrator de contatos - Testar motor.
pause
exit /b 0
:semnode
echo Instale Node.js 22 ou superior em https://nodejs.org/ e reabra este arquivo.
pause
exit /b 1
:erro
echo Nao foi possivel instalar. Confira a conexao e as mensagens acima.
pause
exit /b 1
