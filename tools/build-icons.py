#!/usr/bin/env python3
"""Génère le sprite d'icônes Lucide (ISC) intégré à index.html.
Usage : python3 tools/build-icons.py <dossier lucide-static/icons>
Les icônes listées ci-dessous sont insérées entre <!--ICONS--> et <!--/ICONS-->."""
import re, sys, pathlib
ICONS = """house ruler-dimension-line droplet message-circle-question user-round newspaper phone mail
map-pin navigation camera share-2 copy send chevron-left chevron-right check x circle-help book-open
waves flask-conical test-tube sparkles user-plus log-out trash-2 pencil plus clock star lock
cloud-check calculator list-checks shield-check scan-text info triangle-alert compass""".split()
src = pathlib.Path(sys.argv[1])
symbols = []
for name in ICONS:
    svg = (src / f"{name}.svg").read_text()
    inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
    inner = re.sub(r"\s+", " ", inner).strip()
    symbols.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{inner}</symbol>')
sprite = ('<!--ICONS--><svg xmlns="http://www.w3.org/2000/svg" class="icon-sprite" aria-hidden="true" focusable="false">'
          '<!-- Icônes Lucide (lucide.dev) — licence ISC -->' + "".join(symbols) + '</svg><!--/ICONS-->')
idx = pathlib.Path(__file__).resolve().parent.parent / "index.html"
html = idx.read_text()
if "<!--ICONS-->" in html:
    html = re.sub(r"<!--ICONS-->.*?<!--/ICONS-->", lambda m: sprite, html, flags=re.S)
else:
    html = html.replace("<body>", "<body>\n" + sprite, 1)
idx.write_text(html)
print(len(symbols), "icônes")
