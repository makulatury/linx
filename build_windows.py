"""Сборка программы для Windows: python build_windows.py

Делает в папке release/ две версии:
  Linx_<версия>_setup.exe    - установщик;
  Linx_<версия>_portable.zip - переносная версия без установки: папка Linx с программой,
                               папкой «Linx-данные» (в ней хранится база) и файлами лицензий.
Перед сборкой обновляется список сторонних компонентов (third_party.py).
Нужны Rust, Visual Studio Build Tools (C++) и tauri-cli (см. README).
"""
import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

import third_party

ROOT = Path(__file__).parent
TAURI = ROOT / "src-tauri"
OUT = ROOT / "release"
DATA_DIR = "Linx-данные"
DATA_README = (
    "В этой папке хранится база Linx: протоколы, фото участников и ваши тексты отчёта.\r\n"
    "Не удаляйте и не переименовывайте её. Переносите программу Linx.exe вместе с этой папкой.\r\n"
    "Резервную копию удобнее делать кнопкой «Сохранить базу в файл» в программе.\r\n"
)


def main():
    version = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))["version"]

    env = dict(os.environ)
    env["PATH"] = str(Path.home() / ".cargo" / "bin") + os.pathsep + env.get("PATH", "")
    # Не записывать в программу пути с этого компьютера (имя пользователя, папки проекта)
    remap = [(Path.home(), "~"), (ROOT.resolve(), "linx")]
    env["RUSTFLAGS"] = " ".join(f"--remap-path-prefix={src}={dst}" for src, dst in remap)
    # Список сторонних компонентов и тексты их лицензий (встраиваются в программу)
    third_party.main()
    # Сборка программы и установщика (внутри запускается build.py)
    cargo = shutil.which("cargo", path=env["PATH"])
    if not cargo:
        raise SystemExit("Не найден cargo: установите Rust (см. README)")
    subprocess.run([cargo, "tauri", "build"], cwd=TAURI, env=env, check=True)

    release = TAURI / "target" / "release"
    setup = release / "bundle" / "nsis" / f"Linx_{version}_x64-setup.exe"
    exe = release / "linx.exe"

    OUT.mkdir(exist_ok=True)
    setup_out = OUT / f"Linx_{version}_setup.exe"
    shutil.copy2(setup, setup_out)

    zip_out = OUT / f"Linx_{version}_portable.zip"
    with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(exe, "Linx/Linx.exe")
        z.write(ROOT / "LICENSE", "Linx/LICENSE.txt")
        z.write(TAURI / "third_party" / "THIRD-PARTY-LICENSES.txt", "Linx/THIRD-PARTY-LICENSES.txt")
        z.writestr(f"Linx/{DATA_DIR}/Прочтите.txt", DATA_README.encode("utf-8-sig"))

    for f in (setup_out, zip_out):
        print(f"OK: {f} ({f.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()
