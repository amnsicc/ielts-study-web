"""Publish answer definitions from existing fixed answer keys; do not rewrite sources."""
from pathlib import Path
import json, hashlib, argparse
root=Path(__file__).resolve().parents[1]
args=argparse.ArgumentParser();args.add_argument('--check',action='store_true');args=args.parse_args()
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources=[]
def register(p):
    sources.append({'path':str(p),'sha256':sha(p)});return load(p)
materials=register(root/'data/listening-materials.json')
existing=load(root/'data/listening-source-manifest.json')
definitions=[]
for m,name in zip(materials,['listening-round-01-001-010-answer-key.json','listening-round-01-answer-key.json']):
    source=Path(next(s['path'] for s in existing['sources'] if Path(s['path']).name==name))
    key=register(source);seq=key['occurrence_sequence']
    assert [x['occurrence_index'] for x in seq]==list(range(1,len(seq)+1))
    if m['id']=='listening:short':
        male=register(source.with_name('listening-round-01-001-010-male-us-answer-key.json'))
        fields=lambda k:[(e['occurrence_index'],e['id'],e['actual_form'],e['sentence']) for e in k['occurrence_sequence']]
        assert fields(key)==fields(male)
    targets=[]
    for t in m['targets']:
        occurrences=[{'number':e['occurrence_index'],'actualForm':e['actual_form'],'sentence':e['sentence']} for e in seq if e['id']==t['number']]
        assert occurrences and all(o['actualForm'] in o['sentence'] for o in occurrences)
        targets.append({'id':t['id'],'number':t['number'],'word':t['word'],'pos':t['pos'],'meaning':t['meaning'],'correctNumbers':[o['number'] for o in occurrences],'occurrences':occurrences})
    assert set(e['id'] for e in seq)==set(t['number'] for t in m['targets'])
    canonical=json.dumps(targets,ensure_ascii=False,separators=(',',':'))
    definitions.append({'materialId':m['id'],'materialVersion':m['version'],'answerVersion':hashlib.sha256(canonical.encode()).hexdigest(),'ruleVersion':'filled-events-v1','targets':targets})
for name,obj in {'listening-answers.json':{'formatVersion':1,'definitions':definitions},'listening-answers-sources.json':{'formatVersion':1,'sources':sources}}.items():
    text=json.dumps(obj,ensure_ascii=False,indent=2)+'\n'
    if args.check:assert (root/'data'/name).read_text(encoding='utf8')==text,name
    else:(root/'data'/name).write_text(text,encoding='utf8')
print(json.dumps({'check':args.check,'sources':len(sources),'targets':[len(d['targets']) for d in definitions],'events':[sum(len(t['correctNumbers']) for t in d['targets']) for d in definitions]},ensure_ascii=False))
