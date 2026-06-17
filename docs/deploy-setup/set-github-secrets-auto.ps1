# Fully automated GitHub secrets + production environment (no prompts).
# Requires: gh auth login (already done), supabase CLI login for service_role fetch.
$ErrorActionPreference = 'Stop'
$repo = 'orin1607-ctrl/future-craft-core'
$keyPath = Join-Path $env:USERPROFILE '.ssh\github-actions-dalia'
$prodRef = 'qasomfndnjuixgjmjwcm'
$anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhc29tZm5kbmp1aXhnam1qd2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDY3MTMsImV4cCI6MjA5MDM4MjcxM30.52KlgpHd4RCO2DnT1_Hoz4bCOWFTeQw7FwDIRxEKr6I'

if (-not (Test-Path $keyPath)) { throw "Missing SSH private key: $keyPath" }

gh auth status | Out-Null

Write-Host 'Setting repository secrets...'
gh secret set VPS_HOST --repo $repo --body '72.60.36.182'
gh secret set VPS_USER --repo $repo --body 'root'
Get-Content -Raw $keyPath | gh secret set VPS_SSH_KEY --repo $repo
gh secret set VITE_SUPABASE_PUBLISHABLE_KEY --repo $repo --body $anonKey

$keysJson = npx supabase projects api-keys --project-ref $prodRef -o json 2>$null
if (-not $keysJson) {
  throw "Supabase CLI not logged in. Run: npx supabase login"
}
$keys = $keysJson | ConvertFrom-Json
$serviceKey = ($keys | Where-Object { $_.name -eq 'service_role' -and $_.type -eq 'legacy' }).api_key
if (-not $serviceKey) { throw 'service_role key not found for production project' }
gh secret set SUPABASE_SERVICE_ROLE_KEY --repo $repo --body $serviceKey

Write-Host 'Configuring production environment...'
$userId = gh api user -q .id
$envBody = @{
  wait_timer = 0
  reviewers = @(@{ type = 'User'; id = [int]$userId })
} | ConvertTo-Json -Compress
$envBody | gh api -X PUT "repos/$repo/environments/production" --input - | Out-Null

Write-Host ''
Write-Host '=== Verification ==='
gh secret list --repo $repo
gh api "repos/$repo/environments/production" -q '.name + " reviewers=" + (.protection_rules | length | tostring)'
Write-Host 'Done (no deploy triggered).'
