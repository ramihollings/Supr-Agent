$ErrorActionPreference = "Stop"

Write-Host "Reference repo bulk import is disabled." -ForegroundColor Yellow
Write-Host "Supr recreates selected capabilities natively; reference repositories must stay outside active Supr source paths." -ForegroundColor Yellow

throw "Bulk import disabled. Use local reference repos manually; do not route Supr runtime or source imports to them."
