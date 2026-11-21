@echo off
chcp 65001 >nul
title Alya do Fortnite - Bot Discord & Dashboard
cd /d "%~dp0"

set "PY_CMD="
where python >nul 2>&1
if %errorlevel%==0 (
    set "PY_CMD=python"
) else (
    where py >nul 2>&1
    if %errorlevel%==0 set "PY_CMD=py -3"
)

if "%PY_CMD%"=="" (
    echo [ERRO] Python nao encontrado no PATH. Instale o Python 3.10+ e tente novamente.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [ERRO] Arquivo .env nao encontrado na pasta do projeto.
    echo Crie um arquivo .env com: DISCORD_TOKEN=seu_token_aqui
    pause
    exit /b 1
)

%PY_CMD% -c "import discord, aiohttp" >nul 2>&1
if not %errorlevel%==0 (
    echo [INFO] Instalando dependencias necessarias...
    %PY_CMD% -m pip install -r requirements.txt
    if not %errorlevel%==0 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo [INFO] Iniciando o Bot Discord e o Dashboard...
echo [INFO] O navegador abrira automaticamente em http://127.0.0.1:8765/
echo [INFO] Pressione Ctrl+C para encerrar.
echo.

%PY_CMD% bot.py
if not %errorlevel%==0 (
    echo.
    echo [ERRO] O bot foi encerrado com erro.
    pause
)
