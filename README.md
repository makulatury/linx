# Linx

Офлайн-программа для Windows и macOS для обработки социометрии: ввод выборов, индексы и статусы,
отчёты с социограммами, печать, экспорт в Word и Excel.

Методика и формулы: [docs/METHOD.md](docs/METHOD.md).

## Скачать

[Releases](https://github.com/makulatury/linx/releases/latest):

- `Linx_<версия>_setup.exe` - установщик (без прав администратора), база в `%APPDATA%\com.makulatury.linx\data`;
- `Linx_<версия>_portable.zip` - без установки, база в папке `Linx-данные` рядом с exe;
- `Linx_<версия>_macos.dmg` - для macOS (Apple Silicon и Intel), база в `~/Library/Application Support/com.makulatury.linx/data`.

Требуется Windows 10/11 с WebView2 или macOS 10.15 и новее.

Сборка для macOS не заверена у Apple, поэтому первый запуск macOS блокирует. Откройте Linx, закройте
предупреждение, затем в «Системных настройках» → «Конфиденциальность и безопасность» нажмите
«Всё равно открыть». Это нужно сделать один раз.

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

Результат - в `release/`. Только интерфейс: `python build.py` → `dist/Linx.html`.

Mac для сборки под macOS не обязателен: при публикации релиза на GitHub образ `.dmg` собирается
и прикладывается к релизу сам (`.github/workflows/macos.yml`).

## Структура

- `src/` - интерфейс и расчёты (JS без зависимостей), `calc.js` - вся математика;
- `src-tauri/` - оболочка Tauri 2: хранение базы (по JSON-файлу на протокол), запись файлов, выбор папки данных;
- `tests/test.html` - тесты расчётов, открывать через `python -m http.server`.

## Лицензия

[MIT](LICENSE). Программа предоставляется «как есть», без каких-либо гарантий. Результаты отчёта не являются психологическим диагнозом.
