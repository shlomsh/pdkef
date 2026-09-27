# Builds the invisible text layer's font program: one glyph, 500 units wide,
# nothing else. Viewers that substitute a system font for a font with
# no program (macOS PDFKit swaps in Courier, at the wrong advance) use this
# one instead, so every extractor places the glyphs where the PDF says.
import base64, io
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

fb = FontBuilder(1000, isTTF=True)
# Glyph 1 is the one every code maps to (CIDToGIDMap). It has a small box
# outline because CoreText refuses a font whose outlines are all empty
# ("Failed to determine ascent and decent"); render mode 3 never draws it.
box = TTGlyphPen(None)
box.moveTo((0, 0)); box.lineTo((0, 1000)); box.lineTo((500, 1000)); box.lineTo((500, 0)); box.closePath()
fb.setupGlyphOrder(['.notdef', 'g'])
fb.setupCharacterMap({})
fb.setupGlyf({'.notdef': TTGlyphPen(None).glyph(), 'g': box.glyph()})
fb.setupHorizontalMetrics({'.notdef': (500, 0), 'g': (500, 0)})
fb.setupHorizontalHeader(ascent=1000, descent=0)
fb.setupNameTable({'familyName': 'GlyphLessFont', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=1000, sTypoDescender=0, usWinAscent=1000, usWinDescent=0)
fb.setupPost()
buf = io.BytesIO()
fb.save(buf)
data = buf.getvalue()
print(len(data))
print(base64.b64encode(data).decode())
