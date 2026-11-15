# Сборка программы для Android: powershell -ExecutionPolicy Bypass -File build_android.ps1
#
# Делает в папке release/ файл Linx_<версия>_android.apk - одна сборка для телефонов и планшетов
# (arm64, armv7) и эмуляторов (x86_64), Android 7 и новее.
# APK подписывается ключом из ~/.linx-android/keystore.properties (или из файла в переменной LINX_KEYSTORE).
# Без ключа получится неподписанный APK, который не установится.
# Перед сборкой список сторонних компонентов (third_party.py) пересобирается для Android,
# после сборки возвращается список для Windows, который лежит в репозитории.
# Нужны Android Studio (JDK и SDK), NDK, цели Rust для Android и tauri-cli (см. README).
#
# Скрипт на PowerShell, а не на Python: если Python установлен из Microsoft Store, всё, что он запускает,
# работает в его «песочнице», и Gradle там не может скомпилировать код на Kotlin.
# Python здесь нужен только для списка компонентов (third_party.py) - Gradle он не запускает.

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Tauri = Join-Path $Root 'src-tauri'
$Out = Join-Path $Root 'release'
$Targets = @('aarch64', 'armv7', 'x86_64')
$Apk = Join-Path $Tauri 'gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk'
$Attempts = 3   # Gradle иногда обрывает загрузку зависимостей - сборку стоит повторить

# Переменная окружения, иначе - из настроек пользователя, иначе - первая найденная папка
function Use-Dir($name, [string[]]$guesses) {
    $v = [Environment]::GetEnvironmentVariable($name)
    if (-not $v) { $v = [Environment]::GetEnvironmentVariable($name, 'User') }
    if (-not $v) { $v = $guesses | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1 }
    if (-not $v -or -not (Test-Path $v)) { throw "Не найдена папка для $name (см. README, раздел про Android)" }
    Set-Item "env:$name" $v
}
Use-Dir 'JAVA_HOME' @('C:\Program Files\Android\Android Studio\jbr')
Use-Dir 'ANDROID_HOME' @((Join-Path $HOME 'Android\Sdk'), (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))
$ndk = Get-ChildItem (Join-Path $env:ANDROID_HOME 'ndk') -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
Use-Dir 'NDK_HOME' @($(if ($ndk) { $ndk.FullName }))
$env:PATH = (Join-Path $HOME '.cargo\bin') + ';' + $env:PATH

# Не записывать в программу пути с этого компьютера (имя пользователя, папки проекта).
# RUSTFLAGS заменяет флаги, которые tauri-cli задаёт сам, поэтому ссылки на библиотеки Android повторены здесь.
$env:RUSTFLAGS = "-Clink-arg=-landroid -Clink-arg=-llog -Clink-arg=-lOpenSLES " +
    "--remap-path-prefix=$HOME=~ --remap-path-prefix=$((Resolve-Path $Root).Path)=linx"

$keystore = if ($env:LINX_KEYSTORE) { $env:LINX_KEYSTORE } else { Join-Path $HOME '.linx-android\keystore.properties' }
if (-not (Test-Path $keystore)) { Write-Warning "Нет ключа подписи ($keystore) - APK будет неподписанным и не установится" }

$version = (Get-Content (Join-Path $Tauri 'tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version

$ok = $false
Push-Location $Root
try {
    # Список сторонних компонентов и тексты их лицензий (встраиваются в программу)
    python -c "import third_party; third_party.main('aarch64-linux-android')"
    if ($LASTEXITCODE) { throw 'Не удалось собрать список компонентов (third_party.py)' }
    Push-Location $Tauri
    try {
        for ($i = 1; $i -le $Attempts -and -not $ok; $i++) {
            cargo tauri android build --apk --target @Targets --ci
            if ($LASTEXITCODE -eq 0) { $ok = $true }
            elseif ($i -lt $Attempts) { Write-Host "Сборка не удалась (попытка $i из $Attempts), повторяю: обычно это обрыв загрузки зависимостей Gradle" }
        }
    } finally { Pop-Location }
} finally {
    python -c "import third_party; third_party.main()"   # вернуть список для Windows, как в репозитории
    Pop-Location
}
if (-not $ok) { throw 'Сборка не удалась - см. сообщения выше' }

New-Item -ItemType Directory -Force $Out | Out-Null
$dest = Join-Path $Out "Linx_${version}_android.apk"
Copy-Item $Apk $dest -Force
Write-Host ("OK: {0} ({1} КБ)" -f $dest, [int]((Get-Item $dest).Length / 1KB))
