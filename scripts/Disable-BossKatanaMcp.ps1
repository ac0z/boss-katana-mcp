$key  = 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$name = 'BOSS TONE STUDIO for KATANA Gen 3.exe'
if (Test-Path $key) { Remove-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue }
Write-Output "Disabled. Restart BOSS TONE STUDIO if it is open."
