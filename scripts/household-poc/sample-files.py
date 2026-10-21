#!/usr/bin/env python3
import json
import math
import pathlib
import struct
import sys
import wave
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
for language in ('en', 'sv'):
    folder = root / language
    folder.mkdir(exist_ok=True)
    text = 'A small household library. Each edition keeps its own place.' if language == 'en' else 'Ett litet hembibliotek. Varje utgåva har sin egen läsplats.'
    with zipfile.ZipFile(folder / 'sample.epub', 'w') as book:
        book.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        book.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        book.writestr('OEBPS/content.opf', f'''<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">household-{language}</dc:identifier><dc:title>The household sample</dc:title><dc:language>{language}</dc:language><dc:creator>BookOrbit prototype</dc:creator><meta property="dcterms:modified">2026-10-17T00:00:00Z</meta></metadata><manifest><item id="text" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="text"/></spine></package>''')
        book.writestr('OEBPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Sample</a></li></ol></nav></body></html>')
        book.writestr('OEBPS/chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Sample</title></head><body><h1>Sample</h1>' + ''.join(f'<p>{i}. {text}</p>' for i in range(1, 101)) + '</body></html>')
# Distinct synthetic tones make track identity audible without redistributing a recording.
for narrator, tracks, frequency in [('narrator-a', 1, 330), ('narrator-b', 2, 440)]:
    folder = root / narrator
    folder.mkdir(exist_ok=True)
    for track in range(1, tracks + 1):
        with wave.open(str(folder / f'{track:02}.wav'), 'wb') as audio:
            audio.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
            block = b''.join(struct.pack('<h', int(1500 * math.sin(2 * math.pi * (frequency + track * 50) * i / 16000))) for i in range(16000))
            for _ in range(60):
                audio.writeframesraw(block)
print(json.dumps({'sampleRoot': str(root)}))
