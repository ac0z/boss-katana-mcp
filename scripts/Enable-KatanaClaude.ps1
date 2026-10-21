# Opens the WebView2 debug port (127.0.0.1:9222) for BOSS TONE STUDIO for KATANA Gen 3 only.
# Takes effect the next time BOSS TONE STUDIO starts.
$key  = 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$name = 'BOSS TONE STUDIO for KATANA Gen 3.exe'
New-Item -Path $key -Force | Out-Null
New-ItemProperty -Path $key -Name $name -Value '--remote-debugging-port=9222' -PropertyType String -Force | Out-Null
Write-Output "Enabled. Restart BOSS TONE STUDIO if it is open."
