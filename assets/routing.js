(() => {
  'use strict';
  const modes={flight:{label:'飞机',color:'#b48a47',google:null},transit:{label:'公共交通（公交／火车／渡轮）',color:'#8b65ad',google:'transit'},walk:{label:'步行',color:'#49936c',google:'walking'},drive:{label:'驾驶',color:'#2b718c',google:'driving'}};
  let preferences={};try{preferences=JSON.parse(localStorage.getItem('honeymoon-route-modes')||'{}');}catch{}
  const cache=new Map(Object.entries(window.ROUTE_CACHE||{})),pending=new Map();let queue=Promise.resolve();
  const key=(mode,endpoints)=>JSON.stringify([mode,endpoints]);
  function routes(chapter){
    return (chapter.routes||[]).map((r,i)=>{
      const id=r.routeId||chapter.id+'-'+i;
      const places=(r.points||[]).map(id=>(chapter.places||[]).find(p=>p.id===id));
      const baseEndpoints=r.endpoints||places.map(p=>p?.coordinates);
      const endpoints=Array.isArray(r.via)&&baseEndpoints.length===2?[baseEndpoints[0],...r.via,baseEndpoints[1]]:baseEndpoints;
      const mode=modes[preferences[id]]?preferences[id]:modes[r.mode]?r.mode:'drive';
      return {id,mode,endpoints,transitRoute:r.transitRoute||'',displaySchematic:r.displaySchematic===true,note:r.note||'',names:r.names||places.map(p=>p?.name||'待确认地点'),key:key(mode,endpoints)};
    });
  }
  function navigation(r){
    if(!modes[r.mode].google||r.endpoints.length<2)return '';
    const q=new URLSearchParams({api:'1',origin:r.endpoints[0].join(','),destination:r.endpoints.at(-1).join(','),travelmode:modes[r.mode].google});
    if(r.endpoints.length>2)q.set('waypoints',r.endpoints.slice(1,-1).map(p=>p.join(',')).join('|'));
    return 'https://www.google.com/maps/dir/?'+q;
  }
  function known(r){
    if(r.mode==='flight')return {status:'flight',coordinates:r.endpoints};
    if(r.mode==='transit'){
      const line=window.TRANSIT_ROUTES?.[r.transitRoute];
      if(line?.coordinates?.length>1)return line;
      return r.displaySchematic?{status:'transit-schematic',coordinates:r.endpoints}:{status:'transit'};
    }
    return cache.get(r.key);
  }
  function resolve(r){
    const existing=known(r);if(existing)return Promise.resolve(existing);
    if(pending.has(r.key))return pending.get(r.key);
    const job=queue.catch(()=>{}).then(async()=>{
      if(!navigator.onLine)return {status:'error',message:'离线且暂无此路线，联网后可重试'};
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
      try{
        if(r.endpoints.length<2||r.endpoints.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error('地点坐标待确认');
        const profile=r.mode==='walk'?'foot':'car';
        const url=`https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${r.endpoints.map(p=>p[1]+','+p[0]).join(';')}?overview=full&geometries=geojson&steps=false&radiuses=${r.endpoints.map(()=>r.mode==='drive'?1000:300).join(';')}`;
        const response=await fetch(url,{signal:controller.signal});const data=await response.json();
        if(!response.ok||data.code!=='Ok'||!data.routes?.length)throw Error(data.code==='NoSegment'?'附近无可用路网，请核对入口或改交通方式':'此交通方式没有可用路线');
        const route=data.routes[0];
        return {status:'ready',coordinates:route.geometry.coordinates.map(p=>[p[1],p[0]]),distance:route.distance,duration:route.duration,snaps:data.waypoints.map(p=>Math.round(p.distance)),date:new Date().toISOString().slice(0,10)};
      }catch(e){return {status:'error',message:e.name==='AbortError'?'路线查询超时，请重试':e.message==='Failed to fetch'?'路线服务暂不可用，请重试':e.message};}
      finally{clearTimeout(timer);}
    });
    queue=job.then(()=>new Promise(resolve=>setTimeout(resolve,1100)));
    const promise=job.then(result=>{cache.set(r.key,result);pending.delete(r.key);return result;});pending.set(r.key,promise);return promise;
  }
  function change(id,mode){if(!modes[mode])return;preferences[id]=mode;try{localStorage.setItem('honeymoon-route-modes',JSON.stringify(preferences));}catch{}window.dispatchEvent(new Event('route-mode-change'));}
  function retry(r){cache.delete(r.key);window.dispatchEvent(new Event('route-mode-change'));}
  window.TravelRouting={modes,routes,navigation,known,resolve,change,retry};
})();
