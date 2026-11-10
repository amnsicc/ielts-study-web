"""Read-only source and full published listening coverage validation."""
from pathlib import Path
import json,hashlib,re
root=Path(__file__).resolve().parents[1]
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
manifest=load(root/'data/listening-source-manifest.json')
for s in manifest['sources']:assert hashlib.sha256(Path(s['path']).read_bytes()).hexdigest()==s['sha256'],s['path']
audit=load(Path(next(s['path'] for s in manifest['sources'] if s['path'].endswith('audit.json'))))
catalog=load(root/'data/listening-catalog.json');materials=load(root/'data/listening-materials.json')
expected_words=[w for w in audit['words'] if any(s['code'][1]!='-' for s in w['senses'])]
assert [g['number'] for g in catalog]==[w['n'] for w in expected_words]
selected=lambda e:[(s['pos'],s['text'],int(s['code'][1]),s['primary_meaning']) for s in e['senses'] if s['code'][1]!='-']
actual=lambda e:[(s['pos'],s['text'],s['grade'],s['primary']) for s in e['senses']]
for g,w in zip(catalog,expected_words):
    assert g['word']==w['word'] and actual(g)==selected(w)
    extras=[e for e in audit['extras'] if e['parent']==w['n'] and selected(e)]
    assert [e['number'] for e in g['extras']]==[e['id'] for e in extras]
    for actual_e,source_e in zip(g['extras'],extras):assert actual_e['word']==source_e['text'] and actual(actual_e)==selected(source_e)
for m,target_count,filename in zip(materials,[7,34],['listening-round-01-001-010.txt','listening-round-01-001-040.txt']):
    original=Path(next(s['path'] for s in manifest['sources'] if Path(s['path']).name==filename))
    assert '\n\n'.join(m['paragraphs'])==original.read_text(encoding='utf-8-sig').strip()
    assert len(m['targets'])==target_count
    answer_name='listening-round-01-001-010-answer-key.json' if target_count==7 else 'listening-round-01-answer-key.json'
    answer=load(Path(next(s['path'] for s in manifest['sources'] if Path(s['path']).name==answer_name)))
    expected_targets=[{'id':f"word:{t['id']}",'number':t['id'],'word':t['word'],'pos':t['pos'],'meaning':t['meaning']} for t in answer['by_original_number']]
    assert m['targets']==expected_targets
    expected_occurrences=sorted([o for t in answer['by_original_number'] for o in t['occurrences']],key=lambda o:o['occurrence_index'])
    assert [(o['groupId'],o['text'],o['pos'],o['meaning']) for o in m['occurrences']]==[(f"word:{o['id']}",o['actual_form'],next(t['pos'] for t in answer['by_original_number'] if t['id']==o['id']),o['meaning']) for o in expected_occurrences]
    assert m['targetGroupIds']==[t['id'] for t in m['targets']]
    assert set(m['targetGroupIds'])==set(o['groupId'] for o in m['occurrences'])
    for o in m['occurrences']:assert m['paragraphs'][o['paragraphIndex']][o['start']:o['end']]==o['text']
    for voice in m['voices']:assert hashlib.sha256((root/voice['url'][1:]).read_bytes()).hexdigest()==voice['sha256']
assert len(catalog)==187 and sum(len(g['senses']) for g in catalog)==415
assert sum(len(g['extras']) for g in catalog)==137
assert sum(len(e['senses']) for g in catalog for e in g['extras'])==241
print(json.dumps({'status':'passed','sources':len(manifest['sources']),'groups':187,'senses':415,'extras':137,'extraSenses':241,'targets':[7,34],'occurrences':[len(m['occurrences']) for m in materials]},ensure_ascii=False))
