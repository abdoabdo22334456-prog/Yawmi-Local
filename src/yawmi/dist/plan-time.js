'use strict';
(() => {
  function clock(minutes, locale='ar-EG') {
    const offset=Math.floor(minutes/1440),within=((Math.floor(minutes)%1440)+1440)%1440;
    const hour=Math.floor(within/60),minute=within%60;
    return `${(hour%12||12).toLocaleString(locale)}:${String(minute.toLocaleString(locale)).padStart(2,locale.startsWith('ar')?'٠':'0')} ${hour<12?'ص':'م'}${offset?` (${offset>0?'+':''}${offset.toLocaleString(locale)} يوم)`:''}`;
  }
  function timeline(day,date) {
    const [hour,minute]=(day.start||'09:00').split(':').map(Number);let next=hour*60+minute,blocked=false;
    const midnight=new Date(date+'T00:00:00');
    const localMinutes=timestamp=>{
      const actual=new Date(timestamp);
      const days=Math.round((Date.UTC(actual.getFullYear(),actual.getMonth(),actual.getDate())-Date.UTC(midnight.getFullYear(),midnight.getMonth(),midnight.getDate()))/86400000);
      return days*1440+actual.getHours()*60+actual.getMinutes();
    };
    return (day.items||[]).map(item=>{
      if(Number.isFinite(item.actualStart)&&item.actualStart>0){
        blocked=false;
        next=localMinutes(item.actualStart);
      }
      const start=blocked?null:next;
      if(item.minutes===0){
        if(item.done&&!item.actualStart)return {item,start,end:next};
        if(item.actualEnd&&item.actualStart){next=localMinutes(item.actualEnd);return {item,start,end:next};}
        blocked=true;return {item,start,end:null};
      }
      next+=item.minutes;return {item,start,end:blocked?null:next};
    });
  }
  function elapsedText(milliseconds,locale='ar-EG'){
    const seconds=Math.max(0,Math.floor(milliseconds/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
    const n=value=>value.toLocaleString(locale);
    return [hours?`${n(hours)} ساعة`:'',minutes?`${n(minutes)} دقيقة`:'',rest||(!hours&&!minutes)?`${n(rest)} ثانية`:''].filter(Boolean).join(' و');
  }
  function activityRecord(item,locale='ar-EG'){
    if(item.minutes!==0)return '';
    if(item.done)return item.actualStart&&item.actualEnd?elapsedText(item.actualEnd-item.actualStart,locale):'تم';
    return item.actualStart?'حاليًا':'وقت مفتوح';
  }
  function totals(day,now=Date.now()){
    const result={activitySeconds:0,breakSeconds:0};
    for(const item of day.items||[]){
      let seconds=item.minutes*60;
      if(item.minutes===0){
        const end=item.done?item.actualEnd:now;
        seconds=item.actualStart&&end?Math.max(0,Math.floor((end-item.actualStart)/1000)):0;
      }
      result[item.kind==='break'?'breakSeconds':'activitySeconds']+=seconds;
    }
    return result;
  }
  function totalLabel(seconds,locale='ar-EG'){
    seconds=Math.max(0,Math.floor(seconds));const n=value=>value.toLocaleString(locale);
    if(seconds===0)return `${n(0)} دقيقة`;
    const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
    return [hours?`${n(hours)} س`:'',minutes?`${n(minutes)} د`:'',rest?`${n(rest)} ث`:''].filter(Boolean).join(' و');
  }
  const api={clock,timeline,elapsedText,activityRecord,totals,totalLabel};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.yawmiTime=Object.freeze(api);
})();
