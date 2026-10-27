@echo off
setlocal
cd /d "%~dp0"
title JP Minato - Catalogos Municipais
if exist ".venv\Scripts\python.exe" goto executar
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 -m venv .venv
) else (
  where python >nul 2>nul
  if errorlevel 1 goto sempython
  python -m venv .venv
)
if not exist ".venv\Scripts\python.exe" goto falha
:executar
".venv\Scripts\python.exe" -c "import openpyxl, fitz, PIL" >nul 2>nul
if %errorlevel% equ 0 goto abrir
echo Instalando dependencias. A primeira execucao precisa de internet...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto falha
:abrir
".venv\Scripts\python.exe" app.py
pause
exit /b
:sempython
echo Instale Python 3.11 ou superior em https://www.python.org/downloads/windows/
echo Marque Add Python to PATH e abra este arquivo novamente.
pause
exit /b 1
:falha
echo Nao foi possivel preparar o programa. Confira as mensagens acima.
pause
exit /b 1
