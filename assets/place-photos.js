(() => {
  'use strict';
  const safe = src => typeof src === 'string' && /^assets\/photos\/[a-zA-Z0-9_./-]+$/.test(src) && !src.includes('..');
  function mount(chapter) {
    document.querySelectorAll('.place-photos').forEach(el=>el.remove());
    if (!chapter.date) return;
    document.querySelectorAll('#detail .stop').forEach(stop=>{
      const place=chapter.places.find(p=>p.id===stop.dataset.place);
      const panel=document.createElement('section');panel.className='place-photos';
      panel.dataset.chapter=chapter.id;panel.dataset.place=place.id;
      panel.setAttribute('aria-label',place.name+'的照片');
      const grid=document.createElement('div');grid.className='place-photo-grid';panel.append(grid);
      const photos=window.PLACE_PHOTOS?.[chapter.id]?.[place.id]||[];
      photos.filter(p=>safe(p.src)).forEach(p=>{
        if(p.needsConversion){
          const card=document.createElement('div');card.className='photo-original';
          const label=document.createElement('strong');label.textContent=/\.heic$/i.test(p.src)?'HEIC 原片已保存':'视频原片已保存';
          const note=document.createElement('small');note.textContent='待转换为网页兼容格式 · '+(p.originalName||'');
          card.append(label,note);grid.append(card);return;
        }
        const button=document.createElement('button');button.className='place-photo-open';button.type='button';
        const img=document.createElement('img');img.src=p.src;img.alt=p.caption||place.name+' · 旅行照片';img.loading='lazy';
        img.addEventListener('error',()=>{button.textContent='照片无法读取';button.disabled=true;},{once:true});
        button.append(img);
        const hasVideo=safe(p.video);
        if(hasVideo){const badge=document.createElement('span');badge.className='photo-live-badge';badge.textContent=p.kind==='live'?'◉ LIVE':'▶ 视频';button.append(badge);}
        button.setAttribute('aria-label',(hasVideo?'播放动态：':'查看大图：')+img.alt);
        button.onclick=()=>{
          const dialog=document.createElement('dialog');dialog.className='photo-dialog';dialog.setAttribute('aria-label',img.alt);
          const close=document.createElement('button');close.textContent='关闭 ×';close.onclick=()=>dialog.close();
          const full=document.createElement(hasVideo?'video':'img');
          if(hasVideo){full.src=p.video;full.poster=p.src;full.controls=true;full.playsInline=true;full.loop=p.kind==='live';full.muted=true;full.setAttribute('aria-label',img.alt+'动态片段');}
          else{full.src=p.src;full.alt=img.alt;}
          dialog.append(close,full);document.body.append(dialog);
          dialog.addEventListener('close',()=>{if(hasVideo){full.pause();full.removeAttribute('src');full.load();}dialog.remove();button.focus();},{once:true});
          dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
          dialog.showModal();if(hasVideo)full.play().catch(()=>{});
        };
        grid.append(button);
      });
      stop.after(panel);
    });
    window.dispatchEvent(new CustomEvent('place-photos-mounted',{detail:chapter}));
  }
  window.PlacePhotos={mount};
})();
