$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..
npm install
# limpa nomes antigos (wall-e) se ainda estiverem linkados
npm unlink -g @wall-e/code 2>$null
npm unlink -g wall-e 2>$null
npm unlink -g @eve/code 2>$null
npm unlink -g eve 2>$null
npm link --force
Write-Host ""
Write-Host "OK. Pasta: wall-e · comando:" -ForegroundColor Cyan
Write-Host "  eve"
Write-Host ""
