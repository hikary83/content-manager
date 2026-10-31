param([Parameter(Mandatory=$true)][string]$TextFile,[Parameter(Mandatory=$true)][string]$OutFile,[Parameter(Mandatory=$true)][string]$Voice)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'ko-KR' })
  if (-not ($voices | Where-Object { $_.VoiceInfo.Name -eq $Voice })) { throw 'Requested Korean Windows SAPI voice is unavailable. Install a compatible Korean voice or provide recorded audio.' }
  $speaker.SelectVoice($Voice)
  $speaker.SetOutputToWaveFile($OutFile)
  $speaker.Speak([IO.File]::ReadAllText($TextFile,[Text.Encoding]::UTF8))
} finally { $speaker.Dispose() }
