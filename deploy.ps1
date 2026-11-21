<#
.SYNOPSIS
    Deploy RecVerse to GitHub with forced push
    
.DESCRIPTION
    Initializes git, adds remote, and force pushes to the target repository.
    Run this from the RecVerse directory.
    
.PARAMETER RemoteUrl
    Target GitHub repository URL
    
.PARAMETER Branch
    Branch to push (default: main)
    
.EXAMPLE
    .\deploy.ps1 -RemoteUrl "https://github.com/silvsxx/recverse.git"
    .\deploy.ps1 -RemoteUrl "https://github.com/silvsxx/recverse.git" -Branch "main"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$RemoteUrl = "https://github.com/silvsxx/recverse.git",
    
    [string]$Branch = "main"
)

Write-Host "=== RecVerse GitHub Deploy ===" -ForegroundColor Cyan
Write-Host "Target: $RemoteUrl" -ForegroundColor Yellow
Write-Host "Branch: $Branch" -ForegroundColor Yellow
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "server.js") -or -not (Test-Path "package.json")) {
    Write-Error "Run this script from the RecVerse root directory (where server.js is)"
    exit 1
}

# Initialize git if needed
if (-not (Test-Path ".git")) {
    Write-Host "Initializing git repository..." -ForegroundColor Green
    git init
    Write-Host "Git initialized" -ForegroundColor Green
} else {
    Write-Host "Git repository already exists" -ForegroundColor Green
}

# Check .gitignore exists
if (-not (Test-Path ".gitignore")) {
    Write-Warning ".gitignore not found!"
} else {
    Write-Host ".gitignore found" -ForegroundColor Green
}

# Add all files
Write-Host "Adding files to git..." -ForegroundColor Green
git add .
Write-Host "Files staged" -ForegroundColor Green

# Check status
Write-Host ""
Write-Host "Git status:" -ForegroundColor Cyan
git status --short

# Commit
$commitMessage = "RecVerse: Initial commit - Rec Room compatible backend + client patcher + native DLLs"
Write-Host ""
Write-Host "Committing: $commitMessage" -ForegroundColor Green
git commit -m "$commitMessage"

# Add/Update remote
Write-Host ""
Write-Host "Setting remote origin to: $RemoteUrl" -ForegroundColor Green
if (git remote get-url origin 2>$null) {
    git remote set-url origin $RemoteUrl
    Write-Host "Remote URL updated" -ForegroundColor Green
} else {
    git remote add origin $RemoteUrl
    Write-Host "Remote added" -ForegroundColor Green
}

# Force push
Write-Host ""
Write-Host "=== FORCE PUSHING TO $RemoteUrl ===" -ForegroundColor Red
Write-Warning "This will OVERWRITE the remote repository!"
Write-Host "Press Ctrl+C to cancel, or any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host "Pushing..." -ForegroundColor Yellow
git push --force origin $Branch

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== DEPLOY SUCCESS ===" -ForegroundColor Green
    Write-Host "Repository: $RemoteUrl" -ForegroundColor Cyan
    Write-Host "Branch: $Branch" -ForegroundColor Cyan
} else {
    Write-Error "Push failed!"
    exit 1
}