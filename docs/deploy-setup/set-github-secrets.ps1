# One-time: set GitHub Actions secrets (requires `gh auth login` first)
# Run from repo root in PowerShell after: gh auth login

$ErrorActionPreference = 'Stop'
$repo = 'orin1607-ctrl/future-craft-core'
$keyPath = Join-Path $env:USERPROFILE '.ssh\github-actions-dalia'

if (-not (Test-Path $keyPath)) {
  throw "Missing private key: $keyPath"
}

$anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhc29tZm5kbmp1aXhnam1qd2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY3MTMsImV4cCI6MjA5MDM4MjcxM30.52KlgpHd4RCO2DnT1_Hoz4bCOWFTeQw7FwDIRxEKr6I'

gh auth status | Out-Null

gh secret set VPS_HOST --repo $repo --body '72.60.36.182'
gh secret set VPS_USER --repo $repo --body 'root'
Get-Content -Raw $keyPath | gh secret set VPS_SSH_KEY --repo $repo
gh secret set VITE_SUPABASE_PUBLISHABLE_KEY --repo $repo --body $anonKey

Write-Host ''
Write-Host 'Paste SUPABASE_SERVICE_ROLE_KEY from:'
Write-Host 'https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/api'
$sr = Read-Host 'service_role key'
if ($sr) {
  gh secret set SUPABASE_SERVICE_ROLE_KEY --repo $repo --body $sr
}

Write-Host ''
Write-Host 'Configuring production environment...'
$userId = gh api user -q .id
$envBody = @{
  wait_timer = 0
  reviewers = @(@{ type = 'User'; id = [int]$userId })
} | ConvertTo-Json -Compress
$envBody | gh api -X PUT "repos/$repo/environments/production" --input -

Write-Host 'Done. Verify: gh secret list --repo' $repo
