"""Read-only provenance/coverage check; not a substitute for content review."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'data/source-manifest.json').read_text(encoding='utf-8'))
for source in manifest['sources']:
    actual = hashlib.sha256(Path(source['path']).read_bytes()).hexdigest()
    assert actual == source['sha256'], source['path']
catalog = json.loads((root/'data/catalog.json').read_text(encoding='utf-8'))
lookup = {entry['id']: entry for entry in catalog}
materials = json.loads((root/'data/materials.json').read_text(encoding='utf-8'))
coverage = []
for material in materials:
    tagged = set(re.findall(r'`([^`]+)`', '\n\n'.join(material['paragraphs'])))
    expected = {lookup[entry]['word'] for entry in material['targetGroupIds']}
    assert tagged == expected, (material['id'], tagged ^ expected)
    coverage.append({'id': material['id'], 'targetCount': len(expected), 'markedWordsMatch': True})
print(json.dumps({'status': 'passed', 'matchingSources': len(manifest['sources']),
                  'coverage': coverage}, ensure_ascii=False))
