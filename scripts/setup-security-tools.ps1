$ErrorActionPreference = 'Stop'
$toolsRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '.security-tools'
New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
function Install-Archive($url, $checksum, $name) {
  $archive = Join-Path $toolsRoot "$name.zip"
  if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing }
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checksum.ToLowerInvariant()) { throw "$name checksum failed" }
  $destination = Join-Path $toolsRoot $name
  if (!(Test-Path -LiteralPath $destination)) { Expand-Archive -LiteralPath $archive -DestinationPath $destination }
  Write-Output "$name verified and ready"
}
Install-Archive 'https://github.com/zaproxy/zaproxy/releases/download/v2.17.0/ZAP_2.17.0_Crossplatform.zip' '94c8f767b1c2e94f0db66b3ae56514d5e3f5a728ee1b6c798e0c8fe2d61fbff0' 'zap'
$javaAssets = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jre&os=windows'
$javaPackage = @($javaAssets)[0].binary.package
Install-Archive $javaPackage.link $javaPackage.checksum 'java'
$trivyName = 'trivy_0.75.0_windows-64bit.zip'
$checksums = (Invoke-WebRequest 'https://github.com/aquasecurity/trivy/releases/download/v0.75.0/trivy_0.75.0_checksums.txt' -UseBasicParsing).Content
if ($checksums -is [byte[]]) { $checksums = [System.Text.Encoding]::UTF8.GetString($checksums) }
$trivyChecksum = (($checksums -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match ([regex]::Escape($trivyName) + '$') }) -split '\s+')[0]
if (!$trivyChecksum) { throw 'Trivy checksum unavailable' }
Install-Archive "https://github.com/aquasecurity/trivy/releases/download/v0.75.0/$trivyName" $trivyChecksum 'trivy'
