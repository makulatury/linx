# Linx

Офлайн-программа для Windows для обработки социометрии: ввод выборов, индексы и статусы,
отчёты с социограммами, печать, экспорт в Word и Excel.

Методика и формулы: [docs/METHOD.md](docs/METHOD.md).

## Скачать

[Releases](https://github.com/makulatury/linx/releases/latest):

- `Linx_<версия>_setup.exe` - установщик (без прав администратора), база в `%APPDATA%\com.makulatury.linx\data`;
- `Linx_<версия>_portable.zip` - без установки, база в папке `Linx-данные` рядом с exe.

Требуется Windows 10/11 с WebView2.

## Сборка

Нужны Rust (MSVC), Visual Studio Build Tools с C++, `tauri-cli` 2 (`cargo install tauri-cli --locked`) и Python 3.

```
python build_windows.py
```

Результат - в `release/`. Только интерфейс: `python build.py` → `dist/Linx.html`.

## Структура

- `src/` - интерфейс и расчёты (JS без зависимостей), `calc.js` - вся математика;
- `src-tauri/` - оболочка Tauri 2: хранение базы (по JSON-файлу на протокол), запись файлов, выбор папки данных;
- `tests/test.html` - тесты расчётов, открывать через `python -m http.server`.
