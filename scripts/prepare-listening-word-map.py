"""Publish a separate word map from existing immutable speech events. No audio/source rewrite."""
from pathlib import Path
import json, hashlib, re, unicodedata, argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
load = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sources = []
def register(p):
    item = {'path': str(p), 'sha256': sha(p)}
    if item not in sources: sources.append(item)
    return load(p)

materials = register(root/'data/listening-materials.json')
old_manifest = load(root/'data/listening-source-manifest.json')
events_dir = root.parent/'tmp/pdfs/reading-listening-1-200-20261027'
names = {'en-US-JennyNeural':'listening-round-01-001-010-speech-events.json',
         'en-US-GuyNeural':'listening-round-01-001-010-male-us-speech-events.json',
         'en-GB-SoniaNeural':'listening-round-01-speech-events.json'}
normalize = lambda s: ''.join(c for c in unicodedata.normalize('NFKC', s).casefold() if c.isalnum())
result = []
for m in materials:
    words = []
    for i, p in enumerate(m['paragraphs']):
        for match in re.finditer(r"[^\W_]+(?:['’‐‑-][^\W_]+)*", p):
            # Browser Range offsets are UTF-16 code units, not Python codepoints.
            start = len(p[:match.start()].encode('utf-16-le'))//2
            end = len(p[:match.end()].encode('utf-16-le'))//2
            words.append({'paragraphIndex':i,'start':start,'end':end,'text':match.group()})
    text_sha = hashlib.sha256(json.dumps(m['paragraphs'],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    mapped = {'materialId':m['id'],'version':m['version'],'textSha256':text_sha,'words':words,'voices':{}}
    for voice in m['voices']:
        path = events_dir/names[voice['id']]; speech = register(path)
        # Check metadata against the already protected L1 originals, not merely a new copy.
        original_audio = next(Path(x['path']) for x in old_manifest['sources'] if Path(x['path']).name==Path(voice['url']).name)
        original_script = next(Path(x['path']) for x in old_manifest['sources'] if x['sha256']==speech['script_sha256'])
        register_audio = {'path':str(original_audio),'sha256':sha(original_audio)}
        if register_audio not in sources:sources.append(register_audio)
        register_script = {'path':str(original_script),'sha256':sha(original_script)}
        if register_script not in sources:sources.append(register_script)
        assert speech['voice']==voice['id'] and sha(original_audio)==speech['audio_sha256']==voice['sha256']
        assert sha(root/voice['url'].lstrip('/'))==voice['sha256']
        assert sha(original_script)==speech['script_sha256']
        assert original_script.read_text(encoding='utf-8-sig').strip().split('\n\n')==m['paragraphs']
        events = speech['events']; index = 0; timings = []; previous = 0
        for word in words:
            first = index; text = ''
            while index<len(events) and len(text)<len(normalize(word['text'])):
                event = events[index]; assert event['type']=='WordBoundary'
                text += normalize(event['text']); index += 1
            assert text==normalize(word['text']), (word,events[first:index])
            start=events[first]['offset']/10_000_000
            end=(events[index-1]['offset']+events[index-1]['duration'])/10_000_000
            assert previous<=start<end<=voice['duration']; previous=end
            timings.append([start,end])
        assert index==len(events)
        mapped['voices'][voice['id']]={'audioSha256':voice['sha256'],'words':timings}
    result.append(mapped)
files = {'listening-word-map.json':{'formatVersion':1,'materials':result},
         'listening-word-map-sources.json':{'formatVersion':1,'sources':sources}}
for name, value in files.items():
    rendered=json.dumps(value,ensure_ascii=False,indent=2)+'\n'
    if args.check:assert (root/'data'/name).read_text(encoding='utf8')==rendered, name
    else:(root/'data'/name).write_text(rendered,encoding='utf8')
print(json.dumps({'checked':args.check,'materials':[{'id':m['materialId'],'words':len(m['words']),'voices':len(m['voices'])} for m in result],'sources':len(sources)},ensure_ascii=False))
