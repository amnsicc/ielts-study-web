import test from 'node:test';
import assert from 'node:assert/strict';
import {createClipPlayer} from '../src/listening/clip-player.mjs';
class Media extends EventTarget{
 currentTime=0;playbackRate=1;paused=true;
 async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
}
function harness(){const media=new Media(),jobs=new Map();let id=0;
 const player=createClipPlayer(media,{schedule:fn=>{jobs.set(++id,fn);return id;},cancel:n=>jobs.delete(n)});
 const advance=seconds=>{if(!media.paused)media.currentTime+=seconds*media.playbackRate;const pending=[...jobs.values()];jobs.clear();pending.forEach(f=>f());};
 return {media,player,advance,jobs};
}
test('单播从首词开始，到末词结束暂停；再次播放不叠加调度',async()=>{
 const {media,player,advance,jobs}=harness();player.select({start:2,end:3,text:'a word'});
 assert.equal(media.paused,true);await player.play('once');assert.equal(media.currentTime,2);
 await player.play('once');assert.equal(jobs.size,1);advance(0.5);assert.equal(media.paused,false);
 advance(0.51);assert.equal(media.paused,true);assert.equal(player.snapshot().phase,'ended');assert.equal(media.currentTime,3);
});
export {harness};

test('循环只回首词；暂停继续保留模式；回退不越过首词',async()=>{
 const {media,player,advance,jobs}=harness();player.select({start:2,end:3,text:'a word'});await player.play('loop');
 advance(1.01);assert.equal(media.paused,false);assert.equal(media.currentTime,2);
 advance(1.01);assert.equal(media.currentTime,2);assert.equal(jobs.size,1);
 media.pause();assert.equal(jobs.size,0);assert.equal(player.snapshot().mode,'loop');
 await media.play();player.rewind(10);assert.equal(media.currentTime,2);advance(1.01);assert.equal(media.currentTime,2);
});

test('整篇进度条主动跳转清掉选段并保持原播放；退出或重选使已排队结束回调失效',async()=>{
 const {media,player,advance,jobs}=harness();player.select({start:2,end:3,text:'first'});await player.play('loop');
 const stale=[...jobs.values()][0];media.currentTime=6;media.dispatchEvent(new Event('seeking'));
 assert.equal(player.snapshot().range,null);assert.equal(media.paused,false);assert.equal(jobs.size,0);stale();assert.equal(media.currentTime,6);
 player.select({start:4,end:5,text:'second'});assert.equal(media.paused,true);await player.play('once');player.clear();stale();advance(10);
 assert.equal(player.snapshot().range,null);assert.equal(media.paused,true);assert.equal(jobs.size,0);
});
test('拒绝播放后保留选择供重试；旧play失败回执不能更改新选区',async()=>{
 const {media,player,jobs}=harness();let reject;
 media.play=()=>new Promise((_,r)=>reject=r);player.select({start:2,end:3,text:'first'});
 const old=player.play('once');player.select({start:4,end:5,text:'second'});reject(new Error('blocked'));await old;
 assert.equal(player.snapshot().range.text,'second');assert.equal(player.snapshot().phase,'selected');assert.equal(jobs.size,0);
 const next=player.play('loop');reject(new Error('blocked'));await next;assert.equal(player.snapshot().phase,'paused');assert.match(player.snapshot().error,/再试/);
});
