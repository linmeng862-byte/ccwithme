@echo off
cd /d C:\UsersS\Chat-C\data\stickers
for /f "delims=" %%i in (curl -s https://zzclaude.zeabur.app/api/stickers | node -e "process.stdin.on('"'"'data'"'"',d=>JSON.parse(d).forEach(s=>console.log(s.filename)))") do @if not exist "%%i" curl -s "https://zzclaude.zeabur.app/stickers/%%i" -o "%%i"
echo Stickers synced.
