#!/usr/bin/env pwsh
$ErrorActionPreference = 'Continue'
& node "$PSScriptRoot\noteflow.js" @args
exit $LASTEXITCODE
