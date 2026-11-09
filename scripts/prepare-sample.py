"""Read existing audited sources; write only this project's isolated sample."""
import hashlib
import json
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
for word in audit['words']:
    if word['n'] > 40:
        continue
    senses = [
        {'id': f"sense:{word['n']}:{sense['previous_index']}",
         'pos': sense['pos'], 'text': sense['text'], 'grade': int(sense['code'][0]),
         'primary': sense['primary_meaning']}
        for sense in word['senses'] if sense['code'][0] != '-'
    ]
    if senses:
        catalog.append({'id': f"word:{word['n']}", 'number': word['n'],
                        'word': word['word'], 'senses': senses})
assert len(catalog) == 40

passages_path = WORKSPACE / 'tmp/pdfs/reading-rebuild-20261028/passages.json'
materials = []
for item in load(passages_path)[:2]:
    filename = f"reading-{item['index']:02d}-{item['start']:03d}-{item['end']:03d}.md"
    original = READING_DIR / filename
    raw = original.read_text(encoding='utf-8')
    body = raw.split('\n\n', 2)[2].split('\n\n<details>')[0].strip()
    assert body == '\n\n'.join(item['paragraphs']), f'Body differs: {original}'
    materials.append({'id': f"reading:{item['index']}", 'version': '2026-10-28',
                      'label': 'A' if item['index'] == 1 else 'B',
                      'title': item['title'], 'start': item['start'], 'end': item['end'],
                      'targetGroupIds': [f'word:{n}' for n in range(item['start'], item['end'] + 1)],
                      'extraTargets': [], 'paragraphs': item['paragraphs']})
    sources.append({'path': str(original), 'sha256': digest(original), 'role': 'unchanged-reading-body'})

for path in [audit_path, passages_path, AUDIT_DIR / 'published.json']:
    sources.append({'path': str(path), 'sha256': digest(path), 'role': 'conversion-source'})
write('catalog.json', catalog)
write('materials.json', materials)
write('source-manifest.json', {
    'sample': '001—040', 'module': 'reading', 'groups': len(catalog),
    'materials': len(materials), 'sources': sources,
    'notes': ['Only reading-selected senses retained, source order and per-sense grades unchanged.',
              'Body paragraphs exactly match published Markdown before rendering backtick delimiters.',
              'No source publisher executed; no source material or learning database modified.',
              'D1a has no extra-target article; expandable extras are deferred to D1b.'],
})
print('Verified PDF publication hashes; 40 groups, 2 original article bodies prepared.')
