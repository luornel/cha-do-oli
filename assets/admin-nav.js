/* Ateliê do Oli — navegação do painel; sem alterar operações financeiras. */
(() => {
  'use strict';
  const links=[...document.querySelectorAll('[data-panel-link]')];
  const sections=links.map(link=>document.getElementById(link.dataset.panelLink)).filter(Boolean);
  const dashboard=document.getElementById('dashboard');
  function visible(){return dashboard&&!dashboard.hidden;}
  function mark(id){
    for(const link of links){
      const active=link.dataset.panelLink===id;
      link.classList.toggle('is-current',active);
      if(active)link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    }
  }
  function current(){
    if(!visible())return;
    const threshold=window.scrollY+(window.innerWidth<=760?160:145);
    let id=sections[0]?.id;
    for(const section of sections)if(section.getBoundingClientRect().top+window.scrollY<=threshold)id=section.id;
    if(id)mark(id);
  }
  let scrollPending=false;
  window.addEventListener('scroll',()=>{
    if(scrollPending)return;
    scrollPending=true;
    requestAnimationFrame(()=>{scrollPending=false;current();});
  },{passive:true});
  window.addEventListener('resize',current);
  document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{
    const target=decodeURIComponent(link.getAttribute('href').slice(1));
    if(sections.some(x=>x.id===target))mark(target);
  }));
  function restore(){
    if(!visible())return;
    const id=decodeURIComponent(location.hash.slice(1));
    const section=sections.find(x=>x.id===id);
    if(section){
      mark(id);
      // O conteúdo do painel é revelado somente após a autenticação do Supabase.
      requestAnimationFrame(()=>section.scrollIntoView({behavior:'instant',block:'start'}));
    }else mark('visao-geral');
  }
  window.addEventListener('oli:admin-ready',restore);
  window.addEventListener('hashchange',()=>{
    const id=decodeURIComponent(location.hash.slice(1));
    if(sections.some(x=>x.id===id))mark(id);
  });
  if(visible())restore();
})();