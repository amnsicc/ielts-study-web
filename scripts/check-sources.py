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
audit_source = next(s for s in manifest['sources'] if s['path'].endswith('audit.json'))
audit = json.loads(Path(audit_source['path']).read_text(encoding='utf-8'))
extras_count = 0
for group in catalog:
    source_group = next(w for w in audit['words'] if w['n'] == group['number'])
    expected_senses = [(s['pos'], s['text'], int(s['code'][0]), s['primary_meaning']) for s in source_group['senses'] if s['code'][0] != '-']
    assert [(s['pos'], s['text'], s['grade'], s['primary']) for s in group['senses']] == expected_senses
    expected_extras = [e for e in audit['extras'] if e['parent'] == group['number'] and any(s['code'][0] != '-' for s in e['senses'])]
    assert [e['number'] for e in group['extras']] == [e['id'] for e in expected_extras]
    for extra, source in zip(group['extras'], expected_extras):
        assert extra['word'] == source['text']
        assert [(s['pos'], s['text'], s['grade'], s['primary']) for s in extra['senses']] == [
            (s['pos'], s['text'], int(s['code'][0]), s['primary_meaning']) for s in source['senses'] if s['code'][0] != '-']
        extras_count += 1
for material in materials:
    tagged = set(re.findall(r'`([^`]+)`', '\n\n'.join(material['paragraphs'])))
    expected = {lookup[entry]['word'] for entry in material['targetGroupIds']}
    assert tagged == expected, (material['id'], tagged ^ expected)
    assert len(material['occurrences']) == 20
    for occurrence in material['occurrences']:
        plain = material['paragraphs'][occurrence['paragraphIndex']].replace('`', '')
        assert plain[occurrence['start']:occurrence['end']] == occurrence['text']
        assert lookup[occurrence['groupId']]['word'] == occurrence['text']
    coverage.append({'id': material['id'], 'targetCount': len(expected), 'markedWordsMatch': True})
assert extras_count == 25
print(json.dumps({'status': 'passed', 'matchingSources': len(manifest['sources']),
                  'readingGroups': len(catalog), 'readingExtras': extras_count,
                  'coverage': coverage}, ensure_ascii=False))
