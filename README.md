# Linx

Офлайн-программа для Windows, macOS и Android для обработки социометрии: ввод выборов, индексы и статусы,
отчёты с социограммами, печать, экспорт в Word и Excel.

Методика и формулы: [docs/METHOD.md](docs/METHOD.md).

## Скачать

[Releases](https://github.com/makulatury/linx/releases/latest):

- `Linx_<версия>_setup.exe` - установщик (без прав администратора), база в `%APPDATA%\com.makulatury.linx\data`;
- `Linx_<версия>_portable.zip` - без установки, база в папке `Linx-данные` рядом с exe;
- `Linx_<версия>_macos.dmg` - для macOS (Apple Silicon и Intel), база в `~/Library/Application Support/com.makulatury.linx/data`;
- `Linx_<версия>_android.apk` - для телефонов и планшетов на Android, база во внутренней памяти программы.

Требуется Windows 10/11 с WebView2, macOS 10.15 или Android 7 и новее.

Сборка для macOS не заверена у Apple, поэтому первый запуск macOS блокирует. Откройте Linx, закройте
предупреждение, затем в «Системных настройках» → «Конфиденциальность и безопасность» нажмите
«Всё равно открыть». Это нужно сделать один раз.

Как поставить на Android: откройте APK на телефоне и разрешите установку из этого источника
(после установки разрешение лучше выключить). Новая версия ставится поверх прежней, база сохраняется. Если удалить программу, база удалится вместе с ней - сохраняйте
копию через «Справка» → «Сохранить базу в файл».

## Сборка

Windows: нужны Rust (MSVC), Visual Studio Build Tools с C++, `tauri-cli` 2 (`cargo install tauri-cli --locked`) и Python 3.

```
python build_windows.py
```

macOS: нужны Xcode Command Line Tools, Rust с целями `aarch64-apple-darwin` и `x86_64-apple-darwin`
(`rustup target add ...`), `tauri-cli` 2 и Python 3.

```
python3 build_macos.py
```

Android (телефоны и планшеты, Android 7 и новее): нужны Android Studio (JDK и SDK), NDK, цели Rust
`aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`, `tauri-cli` 2 и Python 3.
На Windows также нужен включённый режим разработчика. Скрипт сам находит JDK, SDK и NDK
(в `JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME` или на обычных местах). Release-сборка подписывается ключом из
`~/.linx-android/keystore.properties` (или из файла в переменной `LINX_KEYSTORE`); без ключа APK получится неподписанным.

```
powershell -ExecutionPolicy Bypass -File build_android.ps1
```

Скрипт на PowerShell, а не на Python: если Python установлен из Microsoft Store, Gradle, запущенный из него, не может собрать код на Kotlin.

Результат - в `release/`. Только интерфейс: `python build.py` → `dist/Linx.html`.

Mac для сборки под macOS не обязателен: при публикации релиза на GitHub образ `.dmg` собирается
и прикладывается к релизу сам (`.github/workflows/macos.yml`).

## Структура

- `src/` - интерфейс и расчёты (JS без зависимостей), `calc.js` - вся математика;
- `src-tauri/` - оболочка Tauri 2: хранение базы (по JSON-файлу на протокол), запись файлов, выбор папки данных;
- `tests/test.html` - тесты расчётов, открывать через `python -m http.server`.

## Лицензия

[MIT](LICENSE). Программа предоставляется «как есть», без каких-либо гарантий. Результаты отчёта не являются психологическим диагнозом.
