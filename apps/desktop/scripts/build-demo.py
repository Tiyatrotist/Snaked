"""Bundle the web demo (VITE_DEMO=1 build) into one self-contained HTML page.

Usage: VITE_DEMO=1 npx vite build --outDir dist-demo --base ./ && python3 scripts/build-demo.py OUT.html
"""

import glob
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
css = Path(glob.glob(str(root / "dist-demo/assets/*.css"))[0]).read_text()
js = Path(glob.glob(str(root / "dist-demo/assets/*.js"))[0]).read_text().replace("</script", "<\\/script")
page = (root / "scripts/demo-page.html").read_text().replace("{{CSS}}", css).replace("{{JS}}", js)
Path(sys.argv[1]).write_text(page)
print(f"wrote {sys.argv[1]} ({len(page) // 1024} KB)")
