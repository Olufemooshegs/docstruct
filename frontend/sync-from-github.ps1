$repoPath = "C:\Users\USER\Desktop\docstruct-ai"
$remote = "origin"
$branch = "main"
$intervalSeconds = 8

Set-Location $repoPath

while ($true) {
    try {
        git fetch $remote $branch 2>$null | Out-Null
        $localHash = git rev-parse HEAD
        $remoteHash = git rev-parse "$remote/$branch"

        if ($localHash -ne $remoteHash) {
            $status = git status --porcelain
            if ([string]::IsNullOrWhiteSpace($status)) {
                git pull --ff-only $remote $branch | Out-Host
                Write-Host "[sync] Frontend updated from $remote/$branch"
            } else {
                Write-Host "[sync] Local changes detected; skipping pull to avoid overwriting your work."
            }
        }
    }
    catch {
        Write-Host "[sync] Unable to sync right now: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $intervalSeconds
}
