@echo off
cd /d "%~dp0"
title Livro-Caixa
node server.js
if errorlevel 1 pause
