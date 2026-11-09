"""Сборка одного самодостаточного HTML: python build.py -> dist/Linx.html"""
import re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"


def main():
    html = (SRC / "index.html").read_text(encoding="utf-8")

    def css_block(m):
        files = re.findall(r'href="([^"]+\.css)"', m.group(0))
        css = "\n".join((SRC / f).read_text(encoding="utf-8") for f in files)
        return "<style>\n" + css + "\n</style>"

    def js_block(m):
        files = re.findall(r'src="([^"]+\.js)"', m.group(0))
        parts = []
        for f in files:
            code = (SRC / f).read_text(encoding="utf-8")
            code = code.replace("</script", "<\\/script")
            parts.append("/* ---- " + f + " ---- */\n" + code)
        return "<script>\n" + "\n".join(parts) + "\n</script>"

    html = re.sub(r"<!-- build:css -->.*?<!-- /build:css -->", css_block, html, flags=re.S)
    html = re.sub(r"<!-- build:js -->.*?<!-- /build:js -->", js_block, html, flags=re.S)
    if re.search(r'<(script|link)[^>]+(src|href)="(https?:)?//', html):
        raise SystemExit("Найдены внешние ссылки - файл не будет работать офлайн")
    DIST.mkdir(exist_ok=True)
    out = DIST / "Linx.html"
    out.write_text(html, encoding="utf-8")
    print(f"OK: {out} ({out.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()
