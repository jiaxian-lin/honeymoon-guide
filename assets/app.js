(() => {
  'use strict';
  const chapters = window.TRIP?.chapters || [];
  const $ = id => document.getElementById(id);
  const narrow = () => window.matchMedia('(max-width:760px)').matches;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let index = 0, map, overlays, markers = new Map(), whole = false, routeGeneration=0;
  let onlineLayer, baseMode='offline', mapTimer, baseGeneration=0;
  const onlineCredit='<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  let preferredBase=window.TRIP?.map?.defaultBase||'online';
  try { preferredBase=localStorage.getItem('honeymoon-basemap')||preferredBase; } catch {}
  const regions = {world:[[-49,100],[28,180]],sydney:[[-34.02,151.05],[-33.75,151.32]],southIsland:[[-47,166],[-41,174.3]]};
  const safeImage = src => typeof src === 'string' && !/^(?:[a-z]+:|\/\/|\/)/i.test(src) && !src.includes('..') ? src : '';
  const safeLink = url => typeof url === 'string' && (/^https?:\/\//i.test(url) || /^assets\/documents\/[a-zA-Z0-9_-]+\.pdf$/.test(url));
  function renderBlocks(blocks = []) {
    return blocks.map(b => {
      if (b.type === 'dayIndex') return `<div class="overview-days">${chapters.filter(day=>day.date).map(day=>`<a class="overview-day" href="#${encodeURIComponent(day.id)}"><span>${escape(day.date)}</span><strong>${escape(day.navTitle||day.title)}</strong><p>${escape(day.intro)}</p><small>查看当天路线与照片 →</small></a>`).join('')}</div>`;
      if (b.type === 'heading') return `<h3 class="section-title">${escape(b.text)}</h3>`;
      if (b.type === 'paragraph') return `<div class="text-block"><p>${escape(b.text)}</p></div>`;
      if (b.type === 'note') return `<aside class="note">${escape(b.text)}</aside>`;
      if (b.type === 'list') return `<div class="text-block"><ul>${(b.items||[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul></div>`;
      if (b.type === 'table') return `<div class="article-table-wrap" role="region" aria-label="${escape(b.caption||'章节表格')}" tabindex="0"><table class="article-table">${b.caption?`<caption>${escape(b.caption)}</caption>`:''}<thead><tr>${(b.headers||[]).map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${(b.rows||[]).map(row=>`<tr>${row.map(cell=>`<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      if (b.type === 'links') return `<div class="article-sources">${(b.items||[]).filter(item=>safeLink(item.url)).map(item=>`<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.label)} ↗</a>`).join('')}</div>`;
      if (b.type === 'airportMap' && safeImage(b.src)) {
        const pins = (b.pins || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
        const mapImage = () => `<div class="airport-map-canvas"><img src="${escape(b.src)}" alt="${escape(b.alt)}">${pins.map(p => `<span class="airport-map-pin" style="left:${p.x}%;top:${p.y}%" title="${escape(p.label)}" aria-label="${escape(p.id + '：' + p.label)}">${escape(p.id)}</span>`).join('')}</div>`;
        return `<figure class="airport-map"><figcaption>${escape(b.caption)}</figcaption><button type="button" class="airport-map-open" aria-label="${escape('打开大图：' + b.alt)}">${mapImage()}<span class="airport-map-hint">点击查看大图 ↗</span></button><ul class="airport-map-key">${pins.map(p => `<li><strong>${escape(p.id)} · ${escape(p.label)}</strong><span>${escape(p.description)}</span></li>`).join('')}</ul></figure>`;
      }
      if (b.type === 'image' && safeImage(b.src)) return `<figure class="chapter-image${b.fit === 'contain' ? ' image-contain' : ''}"><img src="${escape(b.src)}" alt="${escape(b.alt||'章节配图')}"><figcaption>${escape(b.caption)}</figcaption></figure>`;
      return '';
    }).join('');
  }
  function openAirportMap(trigger) {
    const dialog = document.createElement('dialog');
    dialog.className = 'airport-map-dialog';
    dialog.setAttribute('aria-label', '机场地图大图');
    dialog.innerHTML = '<div class="airport-map-dialog-bar"><strong>机场地图</strong><button type="button" data-zoom>放大查看</button><button type="button" data-close autofocus aria-label="关闭地图大图">关闭 ×</button></div><div class="airport-map-viewer" tabindex="0" role="region" aria-label="地图大图，放大后可横向和纵向滚动"></div>';
    dialog.querySelector('.airport-map-viewer').append(trigger.querySelector('.airport-map-canvas').cloneNode(true));
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-zoom]').addEventListener('click', e => {
      const zoomed = dialog.classList.toggle('is-zoomed');
      e.currentTarget.textContent = zoomed ? '适应窗口' : '放大查看';
      e.currentTarget.setAttribute('aria-pressed', String(zoomed));
    });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close(); } });
    dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); }, {once:true});
    document.body.append(dialog);
    dialog.showModal();
  }
  function initMap() {
    if (map || !window.L) return;
    map = L.map('map',{zoomControl:false,minZoom:1,maxZoom:19,attributionControl:true,worldCopyJump:false,maxBounds:[[-85,-180],[85,210]],maxBoundsViscosity:.6});
    L.control.zoom({position:'bottomright'}).addTo(map);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('底图 Natural Earth · 地点 © OpenStreetMap contributors / Wikipedia · Leaflet');
    map.attributionControl.addAttribution('路由 <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS / OSRM</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OSM</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">修正地图</a>');
    map.createPane('offlineBase').style.zIndex=200;
    map.createPane('onlineBase').style.zIndex=250;
    const renderer = L.canvas({padding:.4,pane:'offlineBase'});
    if (window.WORLD_GEO) L.geoJSON(window.WORLD_GEO,{renderer,interactive:false,filter:f=>!['Australia','New Zealand'].includes(f.properties.ADMIN),style:{color:'#baccc0',weight:.7,fillColor:'#f2f1e5',fillOpacity:1}}).addTo(map);
    if (window.DETAIL_GEO) L.geoJSON(window.DETAIL_GEO,{renderer,interactive:false,style:{color:'#b6c9bd',weight:1,fillColor:'#f2f1e5',fillOpacity:1}}).addTo(map);
    if (window.LAKES_GEO) L.geoJSON(window.LAKES_GEO,{renderer,interactive:false,style:{color:'#b2cccb',weight:.7,fillColor:'#dfeceb',fillOpacity:1}}).addTo(map);
    [[-25,134,'AUSTRALIA'],[-40,172,'NEW ZEALAND'],[-18,166,'South Pacific Ocean',true],[-38,157,'Tasman Sea',true]].forEach(([lat,lng,label,ocean])=>L.marker([lat,lng],{interactive:false,pane:'offlineBase',icon:L.divIcon({className:'region-label'+(ocean?' ocean':''),html:label,iconSize:[170,20]})}).addTo(map));
    overlays = L.layerGroup().addTo(map);
    map.whenReady(()=>setBase(preferredBase));
  }
  function baseStatus(text,badge,failed=false){
    $('map-note').textContent=text;
    $('map-badge').querySelector('span').textContent=badge;
    $('basemap-select').value=baseMode;
    $('retry-map').hidden=!failed;
  }
  function setBase(mode,remember=false){
    if(!map)return;
    const generation=++baseGeneration;
    clearTimeout(mapTimer);
    if(onlineLayer){map.removeLayer(onlineLayer);onlineLayer=null;}
    map.getPane('offlineBase').style.visibility='visible';
    map.attributionControl.removeAttribution(onlineCredit);
    baseMode=mode==='online'?'online':'offline';
    if(remember){preferredBase=baseMode;try{localStorage.setItem('honeymoon-basemap',baseMode);}catch{}}
    if(baseMode==='offline'){
      baseStatus('离线简图 · 可看行程位置，不含街道详情','离线简图');return;
    }
    const fallback=()=>{
      if(generation!==baseGeneration)return;
      setBase('offline');
      baseStatus('在线地图暂不可用 · 已切换离线简图','离线备用',true);
    };
    if(!navigator.onLine||!window.maplibregl||!L.maplibreGL){fallback();return;}
    baseStatus('正在加载在线街道 · 行程标记可先查看','地图加载中');
    mapTimer=setTimeout(fallback,20000);
    try{
      const layer=L.maplibreGL({style:window.TRIP?.map?.style||'https://tiles.openfreemap.org/styles/liberty',pane:'onlineBase',attributionControl:false,interactive:false});
      onlineLayer=layer;
      layer.addTo(map);
      map.attributionControl.addAttribution(onlineCredit);
      const gl=layer.getMaplibreMap();
      let errors=0;
      gl.on('error',()=>{if(generation===baseGeneration&&++errors>=3)fallback();});
      gl.on('idle',()=>{
        if(generation!==baseGeneration)return;
        clearTimeout(mapTimer);errors=0;
        map.getPane('offlineBase').style.visibility='hidden';
        baseStatus('在线街道 · 放大查看路名、建筑与周边地点','在线地图');
      });
      gl.on('webglcontextlost',fallback);
    }catch{fallback();}
  }
  $('basemap-select').addEventListener('change',e=>setBase(e.target.value,true));
  $('retry-map').addEventListener('click',()=>setBase('online',true));
  window.addEventListener('offline',()=>{if(map&&baseMode==='online'){setBase('offline');baseStatus('网络已断开 · 已切换离线简图','离线备用',true);}});
  function markerIcon(i, selected=false) { return L.divIcon({className:'place-marker'+(selected?' selected':''),html:String(i+1),iconSize:[27,27],iconAnchor:[13,13]}); }
  function selectPlace(id, fromMap=false) {
    const chapter = whole ? chapters.find(c=>c.id==='overview') : chapters[index];
    const places = chapter?.places || [];
    if (!fromMap && narrow()) setMobileView('map');
    markers.forEach((m,key)=>{
      m.setIcon(markerIcon(places.findIndex(p=>p.id===key),key===id));
      if(key===id){
        if(!fromMap){map.invalidateSize();map.setView(m.getLatLng(),Math.max(map.getZoom(),baseMode==='online'?16:12),{animate:false});}
        m.openTooltip();m.openPopup();
      }
    });
    document.querySelectorAll('.stop').forEach(el=>{
      el.classList.toggle('active',el.dataset.place===id);
      el.setAttribute('aria-pressed',String(el.dataset.place===id));
      if(fromMap&&el.dataset.place===id&&!narrow())el.scrollIntoView({block:'nearest',behavior:'smooth'});
    });
  }
  function showMap(chapter, fit=true) {
    initMap(); if (!map) { $('map').textContent='地图组件未加载，请检查 assets/vendor 文件。';return; }
    overlays.clearLayers();markers.clear();
    const places=(chapter.places||[]).filter(p=>Array.isArray(p.coordinates)&&p.coordinates.length===2&&p.coordinates.every(Number.isFinite));
    const byId=new Map(places.map(p=>[p.id,p]));
    const boundsPoints=places.map(p=>p.coordinates);
    const routeVersion=++routeGeneration;
    const routes=TravelRouting.routes(chapter);
    function drawRoute(r,result){
      if(routeVersion!==routeGeneration||!['ready','flight','transit-route','transit-schematic'].includes(result?.status))return;
      const valid=result.coordinates;
      if(!valid||valid.length<2)return;
      boundsPoints.push(...valid);
      const mode=TravelRouting.modes[r.mode];
      L.polyline(valid,{color:mode.color,weight:r.mode==='flight'?2.5:4,opacity:.9,dashArray:result.status==='transit-schematic'?'5 8':r.mode==='flight'?'7 8':undefined}).bindPopup(`${escape(mode.label)} · ${escape(r.names.join(' → '))}<br>${escape(routeDescription(result))}`).addTo(overlays);
    }
    routes.forEach(r=>{
      const known=TravelRouting.known(r);
      if(known)drawRoute(r,known);
      else TravelRouting.resolve(r).then(result=>drawRoute(r,result));
    });
    places.forEach((p,i)=>{
      const m=L.marker(p.coordinates,{icon:markerIcon(i),title:p.name,keyboard:true}).addTo(overlays);
      m.bindTooltip(escape(p.name),{permanent:chapter.id!=='overview'||places.length<=3,direction:'top',offset:[0,-14],className:'place-label'});
      const [lat,lng]=p.coordinates;
      const source=typeof p.source==='string'&&/^https:\/\//.test(p.source)?`<a href="${escape(p.source)}" target="_blank" rel="noopener noreferrer">位置来源 ↗（需联网）</a>`:'';
      m.bindPopup(`<div class="location-popup"><strong>${escape(p.name)}</strong><p>${escape(p.description||'行程地点')}</p><small>${Math.abs(lat).toFixed(4)}°${lat<0?'S':'N'} · ${Math.abs(lng).toFixed(4)}°${lng<0?'W':'E'}</small>${source}</div>`,{maxWidth:260,autoPanPadding:[25,70]});
      m.on('click',()=>selectPlace(p.id,true));markers.set(p.id,m);
    });
    $('route-status').textContent=routes.some(r=>r.mode==='transit'&&r.displaySchematic)?'实线：道路／官方公交铁路线路 · 虚线：未核实交通示意':'实线：道路／官方公交铁路线路 · 航班为示意';
    $('map-scope').textContent=whole||chapter.id==='overview'?'全程地图':chapter.date?'DAY '+String(index-chapters.findIndex(c=>c.group==='每日行程')+1).padStart(2,'0')+' / '+chapter.date:'章节地图';
    if(fit) {
      const bounds=chapter.bounds || (boundsPoints.length>1?L.latLngBounds(boundsPoints):null) || regions[chapter.region] || regions.southIsland;
      map.invalidateSize();
      if(boundsPoints.length===1&&!chapter.bounds)map.setView(boundsPoints[0],12,{animate:false});
      else map.fitBounds(bounds,{padding:[60,80],maxZoom:16,animate:false});
    }
  }
  function routeDescription(result){
    if(!result)return '正在查询道路路线…';
    if(result.status==='flight')return '机场间航线示意，非实际飞行轨迹';
    if(result.status==='transit-schematic')return '虚线仅连接起终点，表示行程顺序，不是实际公交、铁路或渡轮轨迹；请打开导航确认';
    if(result.status==='transit-route')return result.label+' · '+result.detail+'（线路数据核对：'+result.date+'；班次及临时改道请查导航）';
    if(result.status==='transit')return '线路与班次请在公共交通导航中确认';
    if(result.status==='error')return result.message+'；未绘制替代直线';
    const minutes=Math.max(1,Math.round(result.duration/60));
    const duration=minutes>=60?Math.floor(minutes/60)+' 小时 '+minutes%60+' 分钟':minutes+' 分钟';
    const snap=Math.max(...(result.snaps||[0]));
    return (result.distance/1000).toFixed(1)+' km · 约 '+duration+'（不含停留与实时路况）'+(snap>30?' · 路网端点距标记最多 '+snap+' m，请核对入口':'');
  }
  function renderTransport(chapter){
    if(chapter.id==='overview'||chapter.type!=='map')return;
    const section=document.createElement('section');section.className='transport-section';
    section.innerHTML='<h3 class="section-title">分段交通与导航</h3><p class="transport-hint">可切换交通方式。道路按地点参考坐标计算，入口与临时限制请在出发前确认。</p>';
    TravelRouting.routes(chapter).forEach(r=>{
      const card=document.createElement('div');card.className='transport-card';card.dataset.route=r.id;
      card.innerHTML=`<strong>${escape(r.names.join(' → '))}</strong><select aria-label="${escape(r.names.join('至'))}的交通方式">${Object.entries(TravelRouting.modes).map(([key,mode])=>`<option value="${key}" ${key===r.mode?'selected':''}>${escape(mode.label)}</option>`).join('')}</select><p class="transport-result" role="status"></p><div class="transport-actions"></div>`;
      card.style.setProperty('--mode-color',TravelRouting.modes[r.mode].color);
      card.querySelector('select').addEventListener('change',e=>TravelRouting.change(r.id,e.target.value));
      const actions=card.querySelector('.transport-actions');
      const url=TravelRouting.navigation(r);
      if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=r.mode==='transit'?'查询公共交通换乘 ↗':'打开'+TravelRouting.modes[r.mode].label+'导航 ↗';actions.append(link);}
      const focus=document.createElement('button');focus.textContent='在地图查看';actions.append(focus);
      focus.addEventListener('click',()=>{
        if(whole){whole=false;showMap(chapter);}
        if(narrow())setMobileView('map');
        map.invalidateSize();const result=TravelRouting.known(r);
        map.fitBounds(result?.coordinates||r.endpoints,{padding:[45,80],maxZoom:17,animate:false});
      });
      const status=card.querySelector('.transport-result');
      const update=result=>{
        if(!card.isConnected)return;
        status.textContent=(r.note?r.note+' ':'')+routeDescription(result);card.dataset.status=result?.status||'loading';
        if(result?.status==='transit-route'&&/^https:\/\//.test(result.source)&&!actions.querySelector('.transit-source')){const link=document.createElement('a');link.className='transit-source';link.href=result.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='官方线路来源 ↗';actions.append(link);}
        if(result?.status==='error'&&!actions.querySelector('.retry-route')){const retry=document.createElement('button');retry.className='retry-route';retry.textContent='重试';retry.onclick=()=>TravelRouting.retry(r);actions.append(retry);}
      };
      section.append(card);
      queueMicrotask(()=>{update(TravelRouting.known(r));TravelRouting.resolve(r).then(update);});
    });
    const credit=document.createElement('p');credit.className='transport-hint';credit.innerHTML='道路规划：<a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS / OSRM</a> · © OpenStreetMap · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">反馈地图问题</a>';
    section.append(credit);$('detail').querySelector('.chips').after(section);
  }
  window.addEventListener('route-mode-change',()=>{const top=$('detail').scrollTop;render(chapters[index].id);$('detail').scrollTop=top;});
  function setMobileView(view,reset=false){
    $('chapter-layout').classList.toggle('mobile-detail',view==='detail');
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    if(view==='map'&&chapters[index]?.type==='map')requestAnimationFrame(()=>{if(reset||!map)showMap(whole?chapters.find(c=>c.id==='overview'):chapters[index]);else map.invalidateSize();});
  }
  function closeDrawer(){document.body.classList.remove('drawer-open');$('scrim').hidden=true;updateToggle();}
  function updateToggle(){const expanded=narrow()?document.body.classList.contains('drawer-open'):!document.body.classList.contains('sidebar-collapsed');$('menu-toggle').setAttribute('aria-expanded',String(expanded));$('menu-toggle').setAttribute('aria-label',expanded?'收起目录':'展开目录');}
  function render(id) {
    const nextIndex=chapters.findIndex(c=>c.id===id);index=nextIndex<0?0:nextIndex;
    const c=chapters[index];if(!c)return;whole=false;routeGeneration++;
    document.title=c.title+' · 12天澳洲、新西兰自由行攻略';
    $('chapter-title').textContent=c.title||c.navTitle||'未命名章节';$('chapter-kicker').textContent=c.kicker||c.group||'OUR JOURNEY';
    $('chapter-count').textContent=String(index+1).padStart(2,'0')+' / '+String(chapters.length).padStart(2,'0');
    const isMap=c.type==='map';$('chapter-layout').classList.toggle('article-mode',!isMap);$('mobile-tabs').hidden=!isMap;
    $('detail').innerHTML=`<span class="eyebrow">${escape(c.date?'DAILY ITINERARY':c.type==='article'?'TRAVEL NOTES':'SYDNEY & NEW ZEALAND')}</span><h2>${escape(c.heading||c.title).replace(/\n/g,'<br>')}</h2>${c.intro?`<p class="intro">${escape(c.intro)}</p>`:''}<div class="chips">${(c.tags||[]).map(t=>`<span class="chip">${escape(t)}</span>`).join('')}</div>${renderBlocks(c.blocks)}${isMap&&(c.places||[]).length?`<h3 class="section-title">${c.id==='overview'?'旅程停靠站':'当天的足迹'}</h3>${c.places.map((p,i)=>`<button class="stop" data-place="${escape(p.id)}" aria-pressed="false"><span class="stop-number">${String(i+1).padStart(2,'0')}</span><span><strong>${escape(p.name)}</strong><small>${p.time?escape(p.time)+' · ':''}${escape(p.description||'详细安排待补充')}</small></span></button>`).join('')}`:''}${(!(c.blocks||[]).length&&!(c.places||[]).length)||c.emptyText?`<div class="empty-state"><strong>留一点空白，给未来的旅行。</strong>${escape(c.emptyText||'这一章等待你的文字与照片。')}</div>`:''}`;
    $('detail').querySelectorAll('.airport-map-open').forEach(button => button.addEventListener('click', () => openAirportMap(button)));
    renderTransport(c);
    if ((c.pendingPlaces||[]).length) {
      const pending=document.createElement('aside');pending.className='note pending-places';
      const title=document.createElement('strong');title.textContent='以下地点或集合位置待确认';pending.append(title);
      const list=document.createElement('ul');c.pendingPlaces.forEach(text=>{const item=document.createElement('li');item.textContent=text;list.append(item);});pending.append(list);$('detail').append(pending);
    }
    window.PlacePhotos?.mount(c);
    $('detail').scrollTop=0;
    $('detail').querySelectorAll('img').forEach(img=>{img.addEventListener('error',()=>{const fallback=document.createElement('div');fallback.className='image-fallback';fallback.textContent='图片待补充 · '+img.alt;img.replaceWith(fallback);},{once:true});});
    $('detail').querySelectorAll('.stop').forEach(b=>b.addEventListener('click',()=>{if(whole){whole=false;showMap(c);}selectPlace(b.dataset.place);}));
    document.querySelectorAll('.chapter-link').forEach(b=>{const active=b.dataset.chapter===c.id;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    $('previous').disabled=index===0;$('next').disabled=index===chapters.length-1;$('footer-label').textContent=c.date?c.date+' · 每日行程':'12天澳洲、新西兰自由行攻略';
    $('fit-route').textContent=c.id==='overview'?'⌖ 旅程范围':'⌖ 当天范围';
    closeDrawer();setMobileView('map',true);
  }
  let lastGroup;
  chapters.forEach((c,i)=>{
    if(c.group!==lastGroup){const h=document.createElement('div');h.className='nav-group';h.textContent=c.group||'攻略';$('chapter-nav').append(h);lastGroup=c.group;}
    const b=document.createElement('button');b.className='chapter-link';b.dataset.chapter=c.id;b.innerHTML=`<span class="nav-number">${escape(c.date||(['visa','flights','packing'].includes(c.id)?'✧':'◎'))}</span><span>${escape(c.navTitle||c.title||'未命名章节')}</span>`;b.addEventListener('click',()=>navigate(c.id));$('chapter-nav').append(b);
  });
  function navigate(id){location.hash=encodeURIComponent(id);render(id);}
  function fromHash(){try{return decodeURIComponent(location.hash.slice(1))||window.TRIP.defaultChapter;}catch{return window.TRIP.defaultChapter;}}
  window.addEventListener('hashchange',()=>{if(fromHash()!==chapters[index]?.id)render(fromHash());});
  $('previous').addEventListener('click',()=>{if(index>0)navigate(chapters[index-1].id);});$('next').addEventListener('click',()=>{if(index<chapters.length-1)navigate(chapters[index+1].id);});
  $('menu-toggle').addEventListener('click',()=>{if(narrow()){document.body.classList.toggle('drawer-open');$('scrim').hidden=!document.body.classList.contains('drawer-open');}else{document.body.classList.toggle('sidebar-collapsed');if(map)requestAnimationFrame(()=>map.invalidateSize());}updateToggle();});
  $('scrim').addEventListener('click',closeDrawer);window.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
  $('fit-route').addEventListener('click',()=>{whole=false;showMap(chapters[index]);});$('whole-route').addEventListener('click',()=>{const overview=chapters.find(c=>c.id==='overview');if(overview){whole=true;showMap(overview);}});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setMobileView(b.dataset.view)));
  window.addEventListener('resize',()=>{closeDrawer();if(map){map.invalidateSize();if(chapters[index]?.type==='map'&&!document.querySelector('.place-marker.selected'))requestAnimationFrame(()=>showMap(whole?chapters.find(c=>c.id==='overview'):chapters[index]));}});
  render(fromHash());
})();
