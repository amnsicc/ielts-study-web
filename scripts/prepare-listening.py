"""Convert existing fixed sources into isolated app copies; never publish or rewrite textbooks."""
from pathlib import Path
import json, hashlib, re, shutil

root=Path(__file__).resolve().parents[1]; workspace=root.parent
source=workspace/'output/vocab-1-200-20261027'
temporary=workspace/'tmp/pdfs/reading-listening-1-200-20261027'
audit_path=workspace/'tmp/pdfs/vocab-order-audit-20261029/audit.json'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources=[]
def register(p):
    if not any(x['path']==str(p) for x in sources):sources.append({'path':str(p),'sha256':sha(p)})
def write(name,value):
    (root/'data'/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def senses(entry,prefix):
    return [{'id':f"{prefix}:{s['previous_index']}",'pos':s['pos'],'text':s['text'],'grade':int(s['code'][1]),'primary':s['primary_meaning']}
            for s in entry['senses'] if s['code'][1]!='-']
audit=load(audit_path);register(audit_path)
catalog=[]
for word in audit['words']:
    selected=senses(word,f"sense:listening:{word['n']}")
    if not selected:continue
    extras=[{'id':f"extra:{x['id']}",'number':x['id'],'word':x['text'],'senses':senses(x,f"sense:listening:extra:{x['id']}")}
            for x in audit['extras'] if x['parent']==word['n'] and senses(x,'check')]
    catalog.append({'id':f"word:{word['n']}",'number':word['n'],'word':word['word'],'senses':selected,'extras':extras})
materials=[];(root/'audio').mkdir(exist_ok=True)
for material_id,title,stem,session_names in [
    ('listening:short','学校活动简报（美音短篇）','listening-round-01-001-010',
     ['listening-round-01-001-010-session.json','listening-round-01-001-010-male-us-session.json']),
    ('listening:long','地理实地课程（已有英音长篇）','listening-round-01', ['listening-round-01-session.json']),
]:
    sessions=[load(source/n) for n in session_names]
    script=source/sessions[0]['script_filename'];register(script)
    paragraphs=script.read_text(encoding='utf-8-sig').strip().split('\n\n')
    answer_path=temporary/(stem+'-answer-key.json');register(answer_path);answer=load(answer_path)
    targets=[];occurrences=[]
    for row in answer['by_original_number']:
        targets.append({'id':f"word:{row['id']}",'number':row['id'],'word':row['word'],'pos':row['pos'],'meaning':row['meaning']})
        used={}
        for occurrence in row['occurrences']:
            sentence=occurrence['sentence'];text=occurrence['actual_form']
            candidates=[(i,p.find(sentence)) for i,p in enumerate(paragraphs) if sentence in p]
            assert len(candidates)==1,(title,sentence)
            i,sentence_start=candidates[0]
            matches=list(re.finditer(r'(?<!\w)'+re.escape(text)+r'(?!\w)',sentence))
            key=(i,sentence,text);index=used.get(key,0);used[key]=index+1
            assert len(matches)>index,(sentence,text)
            start=sentence_start+matches[index].start()
            occurrences.append({'id':f"{material_id}:target:{row['id']}:{index}:{i}:{start}",'groupId':f"word:{row['id']}",
                                'paragraphIndex':i,'start':start,'end':start+len(text),'text':text,'pos':row['pos'],'meaning':row['meaning']})
    voices=[]
    for name,session in zip(session_names,sessions):
        register(source/name)
        audio=source/session['audio_filename'];register(audio)
        assert sha(audio)==session['audio_sha256'] and sha(script)==session['script_sha256']
        shutil.copyfile(audio,root/'audio'/audio.name)
        voices.append({'id':session['voice'],'label':{'en-US-JennyNeural':'美音女声','en-US-GuyNeural':'美音男声（比较版）','en-GB-SoniaNeural':'英音女声（原有录音）'}[session['voice']],
                       'url':'/audio/'+audio.name,'duration':session.get('audio_duration_seconds',session.get('duration_seconds')),'sha256':sha(audio)})
    register(source/(sessions[0]['script_filename'].replace('.txt','-targets.md')))
    event_name=stem+'-speech-events.json';register(temporary/event_name)
    if len(sessions)>1:register(temporary/(stem+'-male-us-speech-events.json'))
    assert len(targets)==sessions[0]['target_count']
    material={'id':material_id,'version':hashlib.sha256((sha(script)+json.dumps(targets,ensure_ascii=False)).encode()).hexdigest(),
              'title':title,'label':'短篇' if material_id.endswith('short') else '长篇','start':1,'end':10 if material_id.endswith('short') else 40,
              'targetGroupIds':[t['id'] for t in targets],'targets':targets,'voices':voices,'paragraphs':paragraphs,
              'occurrences':sorted(occurrences,key=lambda o:(o['paragraphIndex'],o['start'])),'extraTargets':[]}
    materials.append(material)
write('listening-catalog.json',catalog);write('listening-materials.json',materials)
write('listening-source-manifest.json',{'module':'listening','range':'001—200','groups':len(catalog),
      'senses':sum(len(g['senses']) for g in catalog),'extras':sum(len(g['extras']) for g in catalog),'sources':sources})
print(json.dumps({'groups':len(catalog),'materials':[{'id':m['id'],'targets':len(m['targets']),'occurrences':len(m['occurrences'])} for m in materials],'sources':len(sources)},ensure_ascii=False))
