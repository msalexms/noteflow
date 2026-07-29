#!/usr/bin/env pwsh
# PowerShell shim for the NoteFlow CLI. PowerShell prefers this over noteflow.cmd,
# so it has to handle two things the naive '& node script @args' gets wrong:
#   1. stdin: in a pipeline PowerShell keeps stdin for itself and node sees EOF
#      ('text' | noteflow set ... --stdin would fail with "No content").
#   2. encoding: PS 5.1 decodes the child's stdout with the OEM codepage and
#      turns accents into mojibake ('Consideración' -> 'Consideraci├│n').
$ErrorActionPreference = 'Continue'
$script = Join-Path $PSScriptRoot 'noteflow.js'

# UTF-8 only while the call lasts; restore it so we don't leave the console touched.
$prevOut = $null
try { $prevOut = [Console]::OutputEncoding; [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# Must be a function: chaining both -replace in a single expression makes PS
# complain ("El operador -ireplace solo permite que lo sigan dos elementos").
function Quote-Arg([string]$a) {
  $s = $a -replace '(\\*)"', '$1$1\"'
  $s = $s -replace '(\\+)$', '$1$1'
  '"' + $s + '"'
}

try {
  if (-not $MyInvocation.ExpectingInput) {
    & node $script @args
    $code = $LASTEXITCODE
  } else {
    # In a pipeline PowerShell owns stdin ($input), so we forward it ourselves as
    # UTF-8 bytes: '$input | & node' re-encodes and turns non-ASCII into '?'.
    # ProcessStartInfo with UseShellExecute=$false goes through CreateProcess,
    # which ignores PATHEXT: 'node' alone would fail with a Win32Exception when
    # node is a .cmd/.bat wrapper (nvs, fnm, volta). Resolve the real target.
    $nodeExe = (Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if (-not $nodeExe) {
      [Console]::Error.WriteLine('  Error: could not find node in PATH (needed to run the NoteFlow CLI).')
      exit 1
    }
    $parts = @((Quote-Arg $script)) + @($args | ForEach-Object { Quote-Arg ([string]$_) })
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $nodeExe
    $psi.Arguments = ($parts -join ' ')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    # stdout/stderr must be redirected too: an inherited console handle would
    # bypass PowerShell, so '$x = ... | noteflow read' or '> out.json' would come
    # back empty. Read them async (started before we write stdin) so a chatty
    # child can never block us while we are still feeding it.
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $proc = [Diagnostics.Process]::Start($psi)
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    $bytes = [Text.Encoding]::UTF8.GetBytes((@($input) -join "`n"))
    $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $proc.StandardInput.BaseStream.Close()
    $proc.WaitForExit()
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    # stderr goes straight to the console (so it can't be captured with '2>&1'
    # in this branch); stdout is what scripts and agents parse.
    if ($stderr) { [Console]::Error.Write($stderr) }
    if ($stdout) {
      # Emit line by line, dropping the trailing newline — same shape PowerShell
      # gives to any native command's output.
      $lines = $stdout -split "`r`n|`n|`r"
      if ($lines[-1] -eq '') { $lines = $lines[0..($lines.Count - 2)] }
      $lines | ForEach-Object { Write-Output $_ }
    }
    $code = $proc.ExitCode
  }
} finally {
  if ($prevOut) { try { [Console]::OutputEncoding = $prevOut } catch { } }
}
exit $code
