"""Сборка программы для macOS: python3 build_macos.py

Делает в папке release/ файл Linx_<версия>_macos.dmg - образ с Linx.app
для компьютеров на Apple Silicon и на Intel (универсальная сборка).
Программа подписана без сертификата разработчика, поэтому при первом запуске
macOS попросит подтверждение (см. README).
Перед сборкой обновляется список сторонних компонентов (third_party.py).
Нужны Xcode Command Line Tools, Rust с обеими целями и tauri-cli (см. README).
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import third_party

ROOT = Path(__file__).parent
TAURI = ROOT / "src-tauri"
OUT = ROOT / "release"
TARGET = "universal-apple-darwin"


def main():
    version = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))["version"]

    env = dict(os.environ)
    env["PATH"] = str(Path.home() / ".cargo" / "bin") + os.pathsep + env.get("PATH", "")
    # Не записывать в программу пути с этого компьютера (имя пользователя, папки проекта)
    remap = [(Path.home(), "~"), (ROOT.resolve(), "linx")]
    env["RUSTFLAGS"] = " ".join(f"--remap-path-prefix={src}={dst}" for src, dst in remap)
    # Список сторонних компонентов и тексты их лицензий (встраиваются в программу)
    third_party.main("aarch64-apple-darwin")
    # Сборка программы и образа (внутри запускается build.py)
    cargo = shutil.which("cargo", path=env["PATH"])
    if not cargo:
        raise SystemExit("Не найден cargo: установите Rust (см. README)")
    subprocess.run([cargo, "tauri", "build", "--target", TARGET], cwd=TAURI, env=env, check=True)

    dmg = TAURI / "target" / TARGET / "release" / "bundle" / "dmg" / f"Linx_{version}_universal.dmg"
    OUT.mkdir(exist_ok=True)
    dmg_out = OUT / f"Linx_{version}_macos.dmg"
    shutil.copy2(dmg, dmg_out)
    print(f"OK: {dmg_out} ({dmg_out.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()
