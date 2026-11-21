# notdred.io one-line setup for Windows 10/11 (PowerShell):
#
#   irm https://raw.githubusercontent.com/GAMEUPSTUDIOS/notdred/main/dist/install.ps1 | iex
#
# The game server runs inside WSL (Windows' built-in Linux), using the same setup as the Mac/Linux script
# (install.sh): it installs what's missing, signs in to GitHub once (the repository is private), downloads or updates
# the code in WSL's ~/notdred, builds it, and starts the server with a temporary public https link (Cloudflare quick
# tunnel). The game is also at http://localhost:8080 on this PC. Run the same command again to update and restart.
# Options, set first in the same PowerShell window:  $env:NOTDRED_LOCAL='1'  (no public link),  $env:DEV_TOKEN='secret'
# This file holds no game code; it is safe to publish.
$Repo = 'GAMEUPSTUDIOS/notdred'
$Distro = if ($env:NOTDRED_WSL_DISTRO) { $env:NOTDRED_WSL_DISTRO } else { 'Ubuntu' }
$ErrorActionPreference = 'Continue'
function Say($t) { Write-Host "`n==> $t" -ForegroundColor Green }
function Stop-Setup($t) { Write-Host "`nSetup stopped: $t" -ForegroundColor Red; throw 'notdred setup stopped' }

# ---- 1. WSL with a Linux distribution --------------------------------------------------------------------------------
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { Stop-Setup 'this Windows has no WSL. Update Windows 10/11, then run this again.' }
$distros = @()
try { $distros = (& wsl.exe -l -q 2>$null) -replace "`0", '' | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() } } catch {}
# An Ubuntu that's already installed under a versioned name (Ubuntu-22.04, Ubuntu-24.04…) is used as it is.
if (-not $env:NOTDRED_WSL_DISTRO -and -not ($distros -contains $Distro)) { $u = $distros | Where-Object { $_ -match '^Ubuntu' } | Select-Object -First 1; if ($u) { $Distro = $u } }
if (-not ($distros -contains $Distro)) {
  Say "Installing WSL with $Distro (Windows asks for permission; a restart may be needed)"
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($admin) { & wsl.exe --install -d $Distro } else { Start-Process wsl.exe -ArgumentList "--install -d $Distro" -Verb RunAs -Wait }
  Write-Host "`nWhen the install finishes (restart Windows if it asks), open '$Distro' from the Start menu once to pick a"
  Write-Host 'Linux username and password, then run this same command again.' -ForegroundColor Yellow
  return
}

# ---- 2. The Linux setup script ----------------------------------------------------------------------------------------
# From this site; if the site isn't published, from the private repository through the GitHub CLI on Windows.
Say 'Getting the setup script'
$script = $null
try { $r = Invoke-WebRequest -UseBasicParsing -ErrorAction Stop 'https://raw.githubusercontent.com/GAMEUPSTUDIOS/notdred/main/dist/install.sh'; $script = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()); if ($script -notmatch '^#!') { $script = $null } } catch {}
if (-not $script) {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Stop-Setup 'install the GitHub CLI from https://cli.github.com, then run this again.' }
    Say 'Installing the GitHub CLI'
    & winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  & gh auth status 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Say "Sign in to GitHub (an account that can see $Repo)"; & gh auth login --hostname github.com --git-protocol https --web }
  $script = (& gh api -H 'Accept: application/vnd.github.raw' "repos/$Repo/contents/dist/install.sh") -join "`n"
  if (-not $script) { Stop-Setup "couldn't read $Repo. Is this GitHub account allowed to see it?" }
}
# Linux line endings, saved where WSL can read it.
$file = Join-Path $env:TEMP 'notdred-install.sh'
[IO.File]::WriteAllText($file, ($script -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
$linuxPath = (& wsl.exe -d $Distro -e wslpath -a ($file -replace '\\', '/')).Trim()

# ---- 3. Run it inside WSL --------------------------------------------------------------------------------------------
# A GitHub sign-in made on Windows is passed in, so you don't sign in twice; options pass through too.
$share = @()
if (Get-Command gh -ErrorAction SilentlyContinue) { $t = (& gh auth token 2>$null); if ($LASTEXITCODE -eq 0 -and $t) { $env:GH_TOKEN = $t.Trim(); $share += 'GH_TOKEN/u' } }
foreach ($v in 'NOTDRED_LOCAL', 'DEV_TOKEN', 'NOTDRED_DIR') { if (Test-Path "env:$v") { $share += "$v/u" } }
if ($share.Count) { $env:WSLENV = (($env:WSLENV, ($share -join ':')) | Where-Object { $_ }) -join ':' }
Say "Running the setup inside WSL ($Distro). The public link appears below; this PC can also use http://localhost:8080"
& wsl.exe -d $Distro -e bash $linuxPath
