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
assert [g['number'] for g in catalog] == list(range(1, 201))
assert len(lookup) == 200
assert [m['id'] for m in materials] == [f'reading:{n}' for n in range(1, 11)]
assert [m['label'] for m in materials] == list('ABCDEFGHIJ')
assert sum(len(g['senses']) for g in catalog) == 481
assert sum(len(e['senses']) for g in catalog for e in g['extras']) == 245
all_ids = [e['id'] for g in catalog for e in [g, *g['extras']]]
assert len(set(all_ids)) == len(all_ids)
passages_source = next(s for s in manifest['sources'] if s['path'].endswith('passages.json'))
passages = json.loads(Path(passages_source['path']).read_text(encoding='utf-8-sig'))
meanings_source = next(s for s in manifest['sources'] if s['path'].endswith('reading-meanings-001-200.md'))
meaning_lines = {int(m.group(1)): m.group(2) for m in re.finditer(
    r'^\[(\d{3})\] (.+)$', Path(meanings_source['path']).read_text(encoding='utf-8'), re.M)}
assert len(meaning_lines) == 200
audit_source = next(s for s in manifest['sources'] if s['path'].endswith('audit.json'))
audit = json.loads(Path(audit_source['path']).read_text(encoding='utf-8'))
extras_count = 0
for group in catalog:
    source_group = next(w for w in audit['words'] if w['n'] == group['number'])
    assert group['word'] == source_group['word']
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
    original = next(p for p in passages if f"reading:{p['index']}" == material['id'])
    assert material['title'] == original['title']
    assert (material['start'], material['end']) == (original['start'], original['end'])
    assert material['paragraphs'] == original['paragraphs']
    assert material['targetGroupIds'] == [f'word:{n}' for n in range(original['start'], original['end']+1)]
    tagged = {s.casefold() for s in re.findall(r'`([^`]+)`', '\n\n'.join(material['paragraphs']))}
    expected = {lookup[entry]['word'].casefold() for entry in material['targetGroupIds']}
    assert tagged == expected, (material['id'], tagged ^ expected)
    assert len(material['occurrences']) == 20
    for occurrence in material['occurrences']:
        plain = material['paragraphs'][occurrence['paragraphIndex']].replace('`', '')
        assert plain[occurrence['start']:occurrence['end']] == occurrence['text']
        group = lookup[occurrence['groupId']]
        assert group['word'].casefold() == occurrence['text'].casefold()
        assert occurrence['groupId'] in material['targetGroupIds']
        explanation = occurrence['meaning'] + ('｜' + occurrence['note'] if occurrence['note'] else '')
        assert meaning_lines[group['number']] == f"{group['word']} {occurrence['pos']} {explanation}"
    assert {o['groupId'] for o in material['occurrences']} == set(material['targetGroupIds'])
    coverage.append({'id': material['id'], 'targetCount': len(expected), 'markedWordsMatch': True})
assert extras_count == 137
print(json.dumps({'status': 'passed', 'matchingSources': len(manifest['sources']),
                  'readingGroups': len(catalog), 'readingExtras': extras_count,
                  'coverage': coverage}, ensure_ascii=False))
