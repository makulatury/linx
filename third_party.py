"""Список сторонних компонентов программы и тексты их лицензий: python third_party.py

Берёт из `cargo metadata` все библиотеки, которые попадают в программу для заданной платформы
(без библиотек только для сборки и тестов), и пишет в src-tauri/third_party/:
  components.json          - название, версия, лицензия (показывается в «Справке»);
  THIRD-PARTY-LICENSES.txt - тексты лицензий (кладётся рядом с программой).
Одинаковые тексты лицензий записываются один раз со списком библиотек.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
TAURI = ROOT / "src-tauri"
OUT = TAURI / "third_party"
LICENSE_NAMES = ("license", "licence", "copying", "notice")


def cargo(target):
    env = dict(os.environ)
    env["PATH"] = str(Path.home() / ".cargo" / "bin") + os.pathsep + env.get("PATH", "")
    exe = shutil.which("cargo", path=env["PATH"])
    if not exe:
        raise SystemExit("Не найден cargo: установите Rust (см. README)")
    out = subprocess.run([exe, "metadata", "--format-version", "1", "--filter-platform", target],
                         cwd=TAURI, env=env, capture_output=True, check=True)
    return json.loads(out.stdout)


def shipped(meta):
    """Пакеты, которые входят в программу: обычные зависимости от корня, без build- и dev-."""
    nodes = {n["id"]: n for n in meta["resolve"]["nodes"]}
    root = meta["resolve"]["root"]
    seen, stack = set(), [root]
    while stack:
        cur = stack.pop()
        for dep in nodes[cur]["deps"]:
            kinds = [k["kind"] for k in dep["dep_kinds"]]
            if None in kinds and dep["pkg"] not in seen:
                seen.add(dep["pkg"])
                stack.append(dep["pkg"])
    pkgs = {p["id"]: p for p in meta["packages"]}
    return sorted((pkgs[i] for i in seen), key=lambda p: (p["name"].lower(), p["version"]))


def license_texts(pkg):
    folder = Path(pkg["manifest_path"]).parent
    files = []
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.name.lower().startswith(LICENSE_NAMES):
            try:
                files.append(f.read_text(encoding="utf-8", errors="replace").strip())
            except OSError:
                pass
    if pkg.get("license_file"):
        f = folder / pkg["license_file"]
        if f.is_file():
            files.append(f.read_text(encoding="utf-8", errors="replace").strip())
    return files


def main(target="x86_64-pc-windows-msvc"):
    pkgs = shipped(cargo(target))
    OUT.mkdir(exist_ok=True)
    components, by_text, missing = [], {}, []
    for p in pkgs:
        lic = p.get("license") or ("см. файл " + p["license_file"] if p.get("license_file") else "не указана")
        components.append({"name": p["name"], "version": p["version"], "license": lic,
                           "repository": p.get("repository") or ""})
        texts = license_texts(p)
        if not texts:
            missing.append(p)
        for t in texts:
            by_text.setdefault(t, []).append(f'{p["name"]} {p["version"]}')
    (OUT / "components.json").write_text(json.dumps(components, ensure_ascii=False, indent=0), encoding="utf-8")

    lines = ["Сторонние компоненты программы Linx и их лицензии",
             "Third-party components of Linx and their licenses", "",
             f"Компонентов: {len(components)}", ""]
    lines += [f'{c["name"]} {c["version"]} - {c["license"]}' for c in components]
    if missing:
        lines += ["", "Для этих компонентов файл лицензии не приложен в пакете, действует лицензия, указанная выше:",
                  ", ".join(f'{p["name"]} {p["version"]}' for p in missing)]
    for text, owners in by_text.items():
        lines += ["", "=" * 78, "Применяется к: " + ", ".join(owners), "=" * 78, "", text]
    (OUT / "THIRD-PARTY-LICENSES.txt").write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")
    print(f"OK: компонентов {len(components)}, разных текстов лицензий {len(by_text)}, без файла лицензии {len(missing)}")


if __name__ == "__main__":
    main()
