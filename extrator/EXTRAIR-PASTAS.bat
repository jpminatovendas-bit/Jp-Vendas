@echo off
cd /d "%~dp0"
echo Extrair vereadores eleitos de pastas locais
set /p "UF=Estado (exemplo RS): "
set /p "ANO=Ano da eleicao (Enter para 2004): "
if "%ANO%"=="" set "ANO=2004"
set /p "PLANILHAS=Pasta das planilhas (sem aspas): "
set /p "FOTOS=Pasta das fotos descompactadas (sem aspas): "
node extrair-pastas.js --uf "%UF%" --ano "%ANO%" --planilhas "%PLANILHAS%" --fotos "%FOTOS%"
pause
