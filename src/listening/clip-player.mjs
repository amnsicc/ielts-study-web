// HTMLMediaElement and the foreground clock are the only external boundaries.
export function createClipPlayer(media,{onChange=()=>{},schedule=setTimeout,cancel=clearTimeout}={}){
  let range=null,mode=null,phase='idle',timer=null,generation=0,ownSeek=null,error='';
  const snapshot=()=>({range,mode,phase,error});
  const notify=()=>onChange(snapshot());
  function stopTimer(){if(timer!==null)cancel(timer);timer=null;}
  function seek(time){ownSeek=time;media.currentTime=time;}
  function arm(){
    stopTimer();if(!range||media.paused||!mode)return;
    const token=generation;
    timer=schedule(()=>{
      timer=null;if(token!==generation||!range||media.paused)return;
      if(media.currentTime>=range.end){
        if(mode==='loop'){seek(range.start);arm();return;}
        media.pause();seek(range.end);phase='ended';notify();return;
      }
      arm();
    },Math.max(1,Math.min(12,(range.end-media.currentTime)/media.playbackRate*1000)));
  }
  const api={
    snapshot,
    select(value){
      if(!Number.isFinite(value.start)||!Number.isFinite(value.end)||value.start<0||value.end<=value.start)throw new Error('选段时间无效');
      generation++;stopTimer();media.pause();range=value;mode=null;phase='selected';error='';notify();
    },
    async play(nextMode='once'){
      if(!range||!['once','loop'].includes(nextMode))return;
      const token=++generation;stopTimer();mode=nextMode;error='';seek(range.start);phase='playing';notify();
      try{await media.play();if(token===generation)arm();}
      catch(e){if(token===generation){stopTimer();phase='paused';error='播放未开始，请再试一次。';notify();}}
    },
    clear(pause=true){generation++;stopTimer();if(pause)media.pause();range=null;mode=null;phase='idle';ownSeek=null;error='';notify();},
    rewind(seconds){seek(Math.max(range?.start||0,media.currentTime-seconds));arm();},
    dispose(){api.clear();for(const [name,fn] of Object.entries(listeners))media.removeEventListener(name,fn);}
  };
  const listeners={
    pause(){if(media.paused){stopTimer();if(range&&phase==='playing')phase='paused';notify();}},
    play(){if(range){mode??='once';if(media.currentTime<range.start||media.currentTime>=range.end)seek(range.start);phase='playing';notify();arm();}},
    ratechange(){arm();},
    seeking(){if(range&&(ownSeek===null||Math.abs(media.currentTime-ownSeek)>.04))api.clear(false);},
    seeked(){ownSeek=null;arm();}
  };
  for(const [name,fn] of Object.entries(listeners))media.addEventListener(name,fn);
  return api;
}
