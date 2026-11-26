const $ = id => document.getElementById(id);
let picked = [];   // {slug,title}
let presets = {};
let instItems = [];
let homeLoaded = false;

function mk(tag, text, cls){ const e=document.createElement(tag); if(text!=null) e.textContent=text; if(cls) e.className=cls; return e; }
function btn(text, fn){ const b=mk('button',text); b.onclick=fn; return b; }
function img(src,cls){ const im=document.createElement('img'); im.src=src; im.alt=''; if(cls) im.className=cls; im.loading='lazy'; return im; }
function env(){ return [$('ver').value, $('loader').value]; }
function remember(){ pywebview.api.remember($('path').value, $('ver').value, $('loader').value); updateSummary(); }

const LOADER_NAMES={fabric:'Fabric',forge:'Forge',neoforge:'NeoForge',quilt:'Quilt'};
const TITLES={home:'ホーム',search:'MODを探す',bulk:'リストから導入',picked:'選んだMOD',presets:'保存したセット',installed:'導入済みのMOD',settings:'設定'};
const SIDE={required:'必要',optional:'あってもなくてもOK',unsupported:'不要',unknown:'不明'};

function updateSummary(){ $('sumText').textContent=`${$('ver').value} / ${LOADER_NAMES[$('loader').value]||$('loader').value}`; }
function applyTheme(t){ document.documentElement.dataset.theme=t; }
function fmtSize(b){ return b>=1048576 ? (b/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(b/1024))+' KB'; }
function addMod(slug,title){ if(picked.some(m=>m.slug===slug)) return false; picked.push({slug,title}); renderPicked(); return true; }

let toastT;
function toast(t){ const e=$('toast'); e.textContent=t; e.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('show'),6000); }

async function installNow(slug,title,b){
  const [v,l]=env(); b.disabled=true; Anim.busy(b,true);
  let log; try{ log=await pywebview.api.install([slug],v,l,$('path').value); }catch(e){ log=['✗ '+(e&&e.message?e.message:e)]; }
  Anim.busy(b,false); b.disabled=false;
  const ok=log.some(x=>x.startsWith('✓')||x.startsWith('－'));
  b.textContent=ok?'✓ 導入済み':'再試行';
  toast(`${title}\n`+log.join('\n'));
}
function actions(slug,title){
  const w=mk('span',null,'acts'); const ins=btn('導入',()=>installNow(slug,title,ins)); ins.className='main';
  w.append(btn('追加',()=>addMod(slug,title)), ins); return w;
}

function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='page-'+name);
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  $('pageTitle').textContent=TITLES[name];
  if(name==='installed') loadInstalled();
  if(name==='home') loadHome();
  [...$('page-'+name).children].forEach((e,i)=>{ e.classList.remove('rise'); void e.offsetWidth; e.style.animationDelay=i*60+'ms'; e.classList.add('rise'); });
}

/* ---------- ホーム ---------- */
let homeLoading = false;
async function loadHome(){
  if(homeLoaded || homeLoading) return;
  homeLoading = true;
  const box=$('homeCats'); box.innerHTML=''; box.append(mk('p','読み込み中…','empty'));
  const fail=msg=>{ box.innerHTML=''; box.append(mk('p',msg,'ng'), btn('もう一度読み込む',loadHome)); };
  try{
    const slugs=[...new Set(CATEGORIES.flatMap(c=>c.mods))];
    const r=await Promise.race([
      pywebview.api.projects_info(slugs),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('30秒たっても返事がありませんでした')),30000))
    ]);
    if(!r||r.error){ fail('読み込めませんでした。ネットワークを確認してください。'+(r&&r.error?` (${r.error})`:'')); return; }
    box.innerHTML='';
    const by={}; r.forEach(p=>by[p.slug.toLowerCase()]=p);
    CATEGORIES.forEach(c=>{
      const items=c.mods.map(s=>by[s.toLowerCase()]).filter(Boolean);
      if(!items.length) return;
      const sec=mk('section'); sec.append(mk('h2',c.name));
      if(c.desc) sec.append(mk('p',c.desc,'empty'));
      const ul=mk('ul',null,'cards');
      items.forEach(p=>{
        const li=mk('li'); const info=mk('span',null,'info click');
        if(p.icon) info.append(img(p.icon));
        const t=mk('span'); t.append(mk('b',p.title), mk('small',p.desc)); info.append(t);
        info.onclick=()=>openDetail(p);
        li.append(info, actions(p.slug,p.title));
        ul.append(li);
      });
      sec.append(ul); box.append(sec);
    });
    if(!box.children.length){ fail('表示できるMODが1つもありませんでした。'); return; }
    homeLoaded=true;
  }catch(e){
    fail('ホームを表示できませんでした: '+(e&&e.message?e.message:e)+'  (main.py と categories.js が新しい版か確認してください)');
  }finally{ homeLoading=false; }
}

/* ---------- 選んだMOD / セット ---------- */
function renderPicked(){
  const ul=$('picked'); ul.innerHTML='';
  picked.forEach((m,i)=>{
    const li=mk('li'); li.append(mk('span',m.title), btn('外す',()=>Anim.remove(li,()=>{picked.splice(i,1);renderPicked();})));
    ul.append(li);
  });
  $('pickedEmpty').hidden = picked.length>0;
  $('pickedCount').textContent=picked.length; $('pickedCount').hidden=!picked.length;
}

function renderPresets(){
  const ul=$('presets'); ul.innerHTML='';
  Object.entries(presets).forEach(([name,p])=>{
    const li=mk('li'); const info=mk('span',name); info.append(mk('small',`${p.mods.length}個 / ${p.version} / ${p.loader}`));
    const acts=mk('span');
    acts.append(btn('読み込む',()=>{
      picked=p.mods.slice(); $('ver').value=p.version; $('loader').value=p.loader; renderPicked(); remember();
    }), ' ', btn('削除',async()=>{ presets=await pywebview.api.delete_preset(name); renderPresets(); }));
    li.append(info, acts); ul.append(li);
  });
  $('presetsEmpty').hidden = Object.keys(presets).length>0;
}

async function changePresetsDir(p){
  const r=await pywebview.api.set_presets_dir(p);
  if(r.error){ $('pmsg').textContent='変更できませんでした: '+r.error; return; }
  presets=r.presets; $('ppath').value=r.file; renderPresets(); $('pmsg').textContent='変更しました。';
}

async function doSave(){
  const name=$('pname').value.trim();
  if(!name||!picked.length){ $('log').textContent='セット名を入れて、MODを1つ以上選んでください。'; return; }
  const [v,l]=env(); presets=await pywebview.api.save_preset(name,picked,v,l); renderPresets(); $('pname').value='';
}

/* ---------- 検索 ---------- */
async function doSearch(){
  const q=$('query').value.trim(); if(!q) return;
  const [v,l]=env(); const ul=$('results'); ul.innerHTML=''; ul.append(mk('li','検索中…'));
  const r=await pywebview.api.search(q,v,l); ul.innerHTML='';
  if(r.error){ ul.append(mk('li','検索に失敗しました。ネットワークを確認してください。','ng')); return; }
  if(!r.length){ ul.append(mk('li',`${v} / ${l} に対応するMODは見つかりませんでした。`)); return; }
  r.forEach(h=>{
    const li=mk('li'); const info=mk('span',null,'info');
    if(h.icon) info.append(img(h.icon));
    const t=mk('span',h.title); t.append(mk('small',h.desc)); info.append(t);
    info.classList.add('click'); info.onclick=()=>openDetail(h); li.append(info, actions(h.slug,h.title));
    ul.append(li);
  });
}

/* ---------- 導入 ---------- */
async function doInstall(){
  if(!picked.length){ $('log').textContent='MODを1つ以上選んでください。'; return; }
  const [v,l]=env(); remember();
  $('install').disabled=true; Anim.busy($('install'),true); $('log').textContent='導入中…';
  const log=await pywebview.api.install(picked.map(m=>m.slug), v, l, $('path').value);
  const box=$('log'); box.innerHTML='';
  log.forEach(line=>box.append(mk('div',line,line.startsWith('✗')?'ng':'')));
  $('install').disabled=false; Anim.busy($('install'),false);
}

/* ---------- リストから導入 ---------- */
function parseLines(txt){
  return [...new Set(txt.split(/\r?\n/).map(s=>s.replace(/^[\s\-*・•]+/,'').trim()).filter(s=>s&&!s.startsWith('#')))];
}

async function bulkRun(mode){
  const box=$('bulkLog'); box.innerHTML='';
  const lines=parseLines($('bulkText').value);
  if(!lines.length){ box.append(mk('div','1行に1つずつ、MOD名を書いてください。','ng')); return; }
  const [v,l]=env(); remember();
  const go=$('bulkGo'), add=$('bulkAdd'); go.disabled=add.disabled=true;
  if(mode==='install') Anim.busy(go,true);
  let ok=0, ng=0;
  for(const line of lines){
    const r=await pywebview.api.resolve(line,v,l);
    if(r.error){ box.append(mk('div',`✗ ${line}: 検索に失敗しました`,'ng')); ng++; continue; }
    if(!r.slug){ box.append(mk('div',`✗ ${line}: ${v} / ${LOADER_NAMES[l]||l} では見つかりませんでした`,'ng')); ng++; continue; }
    const head=`${line} → ${r.title}${r.exact?'':'  ※近い候補を使いました'}`;
    if(mode==='add'){ addMod(r.slug,r.title); box.append(mk('div','✓ '+head)); ok++; continue; }
    box.append(mk('div','▶ '+head,'dim'));
    const log=await pywebview.api.install([r.slug],v,l,$('path').value);
    log.forEach(x=>box.append(mk('div','　'+x,x.startsWith('✗')?'ng':'')));
    if(log.some(x=>x.startsWith('✓')||x.startsWith('－'))) ok++; else ng++;
  }
  box.append(mk('div',`完了: 成功 ${ok} / 失敗 ${ng}`,'sum'));
  go.disabled=add.disabled=false; Anim.busy(go,false);
}

/* ---------- 導入済みのMOD ---------- */
async function loadInstalled(){
  const ul=$('installed'); ul.innerHTML=''; $('instMsg').textContent='';
  $('installedInfo').textContent='読み込み中…(jarの中身を調べています)';
  const r=await pywebview.api.list_installed($('path').value);
  if(r.error){ $('installedInfo').textContent='フォルダを読み込めませんでした。設定で mods フォルダを確認してください。'; instItems=[]; return; }
  instItems=r.items;
  const known=instItems.filter(i=>i.slug).length;
  let info=instItems.length?`${instItems.length}個のjar / Modrinthで判別できたもの ${known}個`:'jarファイルはありません。';
  if(r.offline) info+='(ネットにつながらないため、jarの中身だけで調べました)';
  $('installedInfo').textContent=info;
  instItems.forEach((f,idx)=>{
    const li=mk('li');
    const cb=document.createElement('input'); cb.type='checkbox'; cb.dataset.i=idx; cb.disabled=!f.slug; cb.onchange=updateInstButtons;
    if(!f.slug) cb.title='Modrinthで見つからないため、登録できません';
    const inf=mk('span',null,'info');
    if(f.icon) inf.append(img(f.icon));
    const t=mk('span'); t.append(mk('b',f.title||f.name), mk('small',`${f.name}  ${fmtSize(f.size)}`)); inf.append(t);
    const left=mk('label',null,'sel'); left.append(cb,inf);
    const right=mk('span',null,'verbox');
    right.append(mk('b',f.version?'v'+f.version:'バージョン不明'), mk('small',f.slug?'Modrinth':'Modrinthにはありません'));
    li.append(left,right); ul.append(li);
  });
  updateInstButtons();
}

function targetInstalled(){ const s=selectedInstalled(); return s.length?s:instItems.filter(f=>f.slug); }
function updateInstButtons(){
  const n=selectedInstalled().length, all=instItems.filter(f=>f.slug).length, label=n?`選んだ${n}個`:`全部(${all}個)`;
  $('instAdd').textContent=`${label}を「選んだMOD」に追加`; $('instSave').textContent=`${label}をセットとして保存`;
}
function selectedInstalled(){
  return [...document.querySelectorAll('#installed input:checked')].map(c=>instItems[+c.dataset.i]).filter(f=>f&&f.slug);
}

/* ---------- 詳細パネル ---------- */
async function openDetail(h){
  const [v,l]=env(); const ov=$('overlay'), pn=$('panel');
  pn.innerHTML=''; pn.append(mk('p','読み込み中…','empty')); Anim.open(ov);
  const d=await pywebview.api.detail(h.slug,v,l);
  pn.innerHTML='';
  if(d.error){ pn.append(mk('p','詳細を取得できませんでした。ネットワークを確認してください。','ng'), btn('閉じる',()=>Anim.close(ov))); return; }
  const head=mk('div',null,'info');
  if(d.icon) head.append(img(d.icon,'big'));
  const t=mk('div'); t.append(mk('h2',d.title), mk('small',d.desc)); head.append(t); pn.append(head);
  const dl=mk('dl'); const row=(k,val)=>dl.append(mk('dt',k),mk('dd',val));
  row('ダウンロード数', d.downloads.toLocaleString());
  row('自分のPC側', SIDE[d.client]||d.client);
  row('サーバー側', SIDE[d.server]||d.server);
  row('対応状況', d.supported?`${v} / ${l} に対応`:`${v} / ${l} には未対応`);
  row('一緒に入るMOD', d.deps.length?d.deps.join('、'):'なし');
  if(d.license) row('ライセンス', d.license);
  pn.append(dl);
  if(d.gallery.length){ const g=mk('div',null,'gallery'); d.gallery.forEach(u=>g.append(img(u))); pn.append(g); }
  const acts=mk('div',null,'row');
  const add=btn('追加',()=>{ addMod(d.slug,d.title); Anim.close(ov); }); add.disabled=!d.supported;
  const ins=btn('導入',()=>installNow(d.slug,d.title,ins)); ins.className='main'; ins.disabled=!d.supported;
  acts.append(ins, add, btn('Modrinthのページで開く',()=>pywebview.api.open_project(d.slug)), btn('閉じる',()=>Anim.close(ov)));
  pn.append(acts);
}

/* ---------- 起動 ---------- */
window.addEventListener('pywebviewready', async ()=>{
  const cfg=await pywebview.api.init();
  const vers=await pywebview.api.game_versions();
  (vers.length?vers:[cfg.version]).forEach(v=>{const o=mk('option',v); o.value=v; $('ver').append(o);});
  $('path').value=cfg.path; $('ver').value=cfg.version; $('loader').value=cfg.loader;
  $('theme').value=cfg.theme; applyTheme(cfg.theme); updateSummary();
  presets=cfg.presets; $('ppath').value=cfg.presets_file; renderPresets(); renderPicked();

  $('pick').onclick=async()=>{ const p=await pywebview.api.pick_folder(); if(p){$('path').value=p; remember();} };
  $('search').onclick=doSearch; $('query').onkeydown=e=>{if(e.key==='Enter')doSearch();};
  $('install').onclick=doInstall; $('psave').onclick=doSave;
  $('ver').onchange=$('loader').onchange=remember;
  $('path').onchange=remember;
  $('theme').onchange=()=>{ applyTheme($('theme').value); pywebview.api.set_theme($('theme').value); };
  document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>pywebview.api.open_link(b.dataset.link));

  $('ppick').onclick=async()=>{ const p=await pywebview.api.pick_folder(); if(p) changePresetsDir(p); };
  $('preset-reset').onclick=()=>changePresetsDir('');

  $('bulkPaste').onclick=async()=>{
    const t=await pywebview.api.paste(); const ta=$('bulkText');
    if(!t){ $('bulkLog').innerHTML=''; $('bulkLog').append(mk('div','クリップボードから読み取れませんでした。入力欄をクリックして Ctrl+V でも貼り付けられます。','ng')); return; }
    ta.value = ta.value.trim() ? ta.value.replace(/\s*$/,'\n')+t : t;
  };
  $('bulkClear').onclick=()=>{ $('bulkText').value=''; $('bulkLog').innerHTML=''; };
  $('bulkGo').onclick=()=>bulkRun('install');
  $('bulkAdd').onclick=()=>bulkRun('add');

  $('reloadInstalled').onclick=loadInstalled;
  $('instAll').onclick=()=>{
    const boxes=[...document.querySelectorAll('#installed input:not(:disabled)')];
    const all=boxes.length&&boxes.every(b=>b.checked); boxes.forEach(b=>b.checked=!all); updateInstButtons();
  };
  $('instAdd').onclick=()=>{
    const s=targetInstalled(); if(!s.length){ $('instMsg').textContent='Modrinthで判別できたMODがありません。'; return; }
    s.forEach(f=>addMod(f.slug,f.title||f.name)); $('instMsg').textContent=`${s.length}個を「選んだMOD」に追加しました。`;
  };
  $('instSave').onclick=async()=>{
    const s=targetInstalled(), name=$('instName').value.trim();
    if(!name){ $('instMsg').textContent='セット名を入れてください。'; return; }
    if(!s.length){ $('instMsg').textContent='Modrinthで判別できたMODがありません。'; return; }
    const [v,l]=env();
    presets=await pywebview.api.save_preset(name,s.map(f=>({slug:f.slug,title:f.title||f.name})),v,l);
    renderPresets(); $('instName').value=''; $('instMsg').textContent=`「${name}」として${s.length}個を保存しました。`;
  };

  $('overlay').onclick=e=>{ if(e.target.id==='overlay') Anim.close($('overlay')); };
  addEventListener('keydown',e=>{ if(e.key==='Escape') Anim.close($('overlay')); });
  $('openSettings').onclick=()=>showPage('settings');
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  showPage('home');
});
