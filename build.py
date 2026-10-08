#!/usr/bin/env python3
"""Build the standalone HTML from included sources. No external dependencies."""
from pathlib import Path
import hashlib
root = Path(__file__).resolve().parent
html = (root / 'template.html').read_text(encoding='utf-8')
for marker, name in [('__CORE__', 'core.js'), ('__APP__', 'app.js')]:
    source = (root / name).read_text(encoding='utf-8')
    if '</script' in source.lower():
        raise ValueError(f'Unsafe inline script terminator in {name}')
    html = html.replace(marker, source)
output = root / 'LlylgamynPatchBuilder_v1.4.html'
output.write_text(html, encoding='utf-8')
print(f'{output.name}: {output.stat().st_size} bytes')
print('SHA-256:', hashlib.sha256(output.read_bytes()).hexdigest())
