"""Read the audited 001—200 batch; write only this project's data copies."""
import hashlib
import json
import re
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
WORKSPACE = PROJECT.parent
AUDIT_DIR = WORKSPACE / 'tmp/pdfs/vocab-order-audit-20261029'
READING_DIR = WORKSPACE / 'output/vocab-1-200-20261027'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write(name, value):
    destination = PROJECT / 'data' / name
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

published = load(AUDIT_DIR / 'published.json')
sources = []
for record in published['published']:
    path = Path(record['path'])
    if path.suffix.lower() == '.pdf':
        actual = digest(path)
        assert actual == record['sha256'], f'PDF differs from audited publication: {path}'
        sources.append({'path': str(path), 'sha256': actual, 'role': 'audited-pdf'})

audit_path = AUDIT_DIR / 'audit.json'
audit = load(audit_path)
catalog = []
def reading_senses(entry, prefix):
    return [
        {'id': f"{prefix}:{sense['previous_index']}", 'pos': sense['pos'], 'text': sense['text'],
         'grade': int(sense['code'][0]), 'primary': sense['primary_meaning']}
        for sense in entry['senses'] if sense['code'][0] != '-'
    ]

for word in audit['words']:
    if word['n'] > 200:
        continue
    senses = reading_senses(word, f"sense:{word['n']}")
    if senses:
        extras = [
            {'id': f"extra:{extra['id']}", 'number': extra['id'], 'word': extra['text'],
             'senses': reading_senses(extra, f"sense:extra:{extra['id']}")}
            for extra in audit['extras'] if extra['parent'] == word['n']
            and any(s['code'][0] != '-' for s in extra['senses'])
        ]
        catalog.append({'id': f"word:{word['n']}", 'number': word['n'],
                        'word': word['word'], 'senses': senses, 'extras': extras})
assert len(catalog) == 200
assert sum(len(group['extras']) for group in catalog) == 137

meanings_path = READING_DIR / 'reading-meanings-001-200.md'
meanings_text = meanings_path.read_text(encoding='utf-8')
lookup = {group['id']: group for group in catalog}
selected_meanings = {}
for match in re.finditer(r'^\[(\d{3})\] (.+?) ((?:n|adj|adv|vi|vt)\.(?:/(?:n|adj|adv|vi|vt)\.)*) (.+)$', meanings_text, re.M):
    number, word, pos, explanation = match.groups()
    meaning, _, note = explanation.partition('｜')
    group_id = f'word:{int(number)}'
    assert group_id not in selected_meanings
    assert lookup[group_id]['word'].casefold() == word.casefold()
    selected_meanings[group_id] = {'groupId': group_id, 'pos': pos,
                                   'meaning': meaning, 'note': note}
assert len(selected_meanings) == 200

passages_path = WORKSPACE / 'tmp/pdfs/reading-rebuild-20261028/passages.json'
materials = []
for item in load(passages_path):
    filename = f"reading-{item['index']:02d}-{item['start']:03d}-{item['end']:03d}.md"
    original = READING_DIR / filename
    raw = original.read_text(encoding='utf-8')
    body = raw.split('\n\n', 2)[2].split('\n\n<details>')[0].strip()
    assert body == '\n\n'.join(item['paragraphs']), f'Body differs: {original}'
    for line in re.findall(r'^\[\d{3}\].+$', raw, re.M):
        assert line in meanings_text, f'Article and meaning list disagree: {line}'
    occurrences = []
    for paragraph_index, paragraph in enumerate(item['paragraphs']):
        plain = paragraph.replace('`', '')
        removed = 0
        for match in re.finditer(r'`([^`]+)`', paragraph):
            text = match.group(1)
            candidates = [group_id for group_id, group in lookup.items()
                          if item['start'] <= group['number'] <= item['end']
                          and group['word'].casefold() == text.casefold()]
            assert len(candidates) == 1, f'Ambiguous or missing target: {text} in {original}'
            selected = selected_meanings[candidates[0]]
            start = match.start() - removed
            assert plain[start:start + len(text)] == text
            occurrences.append({'id': f"occurrence:{item['index']}:{len(occurrences)}",
                                'paragraphIndex': paragraph_index, 'start': start, 'end': start + len(text),
                                'text': text, **selected})
            removed += 2
    assert len(occurrences) == 20
    materials.append({'id': f"reading:{item['index']}", 'version': '2026-10-28',
                      'label': chr(ord('A') + item['index'] - 1),
                      'title': item['title'], 'start': item['start'], 'end': item['end'],
                      'targetGroupIds': [f'word:{n}' for n in range(item['start'], item['end'] + 1)],
                      'extraTargets': [], 'paragraphs': item['paragraphs'], 'occurrences': occurrences})
    sources.append({'path': str(original), 'sha256': digest(original), 'role': 'unchanged-reading-body'})

for path in [audit_path, passages_path, AUDIT_DIR / 'published.json', meanings_path]:
    sources.append({'path': str(path), 'sha256': digest(path), 'role': 'conversion-source'})
write('catalog.json', catalog)
write('materials.json', materials)
write('source-manifest.json', {
    'sample': '001—200', 'module': 'reading', 'groups': len(catalog),
    'materials': len(materials), 'extras': 137, 'occurrences': 200, 'sources': sources,
    'notes': ['Only reading-selected senses retained, source order and per-sense grades unchanged.',
              'Body paragraphs exactly match published Markdown before rendering backtick delimiters.',
              'No source publisher executed; no source material or learning database modified.',
              '137 reading-selected extras retain source subnumbers; not claimed as article targets.',
              '200 clickable occurrences come only from explicit backtick markers; meaning list equals article details.',
              'Source Arctic maps to original 067 arctic by identity; original spelling and compound POS retained.'],
})
print('Verified PDF hashes and article details; 200 groups, 137 extras, 200 occurrences, 10 unchanged article bodies prepared.')
