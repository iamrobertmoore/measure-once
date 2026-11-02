# Bakes the page's fonts into the README SVGs (static instances, subset to the glyphs used) so GitHub renders them as designed.
# python3 design/brand/build.py   (needs fonttools + brotli)
import base64, io, re, sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, "..", "..")
fonts = {"ArchivoX": ("archivo-latin-wdth-normal.woff2", {"wght": 800, "wdth": 70}),
         "BricoM": ("bricolage-grotesque-latin-wdth-normal.woff2", {"wght": 500, "wdth": 100}),
         "BricoB": ("bricolage-grotesque-latin-wdth-normal.woff2", {"wght": 700, "wdth": 100})}
def face(name, text):
    f, axes = fonts[name]
    tt = TTFont(os.path.join(root, "public/fonts", f))
    axes = {k: v for k, v in axes.items() if k in [a.axisTag for a in tt["fvar"].axes]}
    st = instancer.instantiateVariableFont(tt, axes)
    opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["kern", "liga"]
    sub = subset.Subsetter(opts); sub.populate(text=text + " "); sub.subset(st)
    st.flavor = "woff2"; buf = io.BytesIO(); st.save(buf)
    return "@font-face{font-family:%s;src:url(data:font/woff2;base64,%s) format('woff2');}" % (name, base64.b64encode(buf.getvalue()).decode())
for src, out in [("banner.src.svg", "readme-banner.svg"), ("arch.src.svg", "architecture.svg")]:
    s = open(os.path.join(here, src)).read()
    text = "".join(re.findall(r">([^<]+)</text>", s))
    used = [n for n in fonts if n in s.split("</style>")[0]]
    css = "".join(face(n, text) for n in used)
    open(os.path.join(root, "docs/brand", out), "w").write(s.replace("/*FONTS*/", css))
    print(out, os.path.getsize(os.path.join(root, "docs/brand", out)))
