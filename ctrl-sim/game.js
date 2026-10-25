(function(){
  'use strict';

  // ---------------- State ----------------
  const state = {
    cash: 5000,
    day: 1,
    speed: 1,
    paused: false,
    released: false,
    gameName: '',
    gameVersion: '',
    gameYear: '',
    towns: [],        // {x,y,id,level,name,buildLeft,buildTotal}
    roads: [],         // road nodes: {x,y,buildLeft,buildTotal} — one per occupied cell
    roadEdges: [],      // road links: {a: "gx,gy", b: "gx,gy", buildLeft, buildTotal} — a cell can have several
    spawns: [],        // {x,y,id,buildLeft,buildTotal}
    players: [],       // simulated AI subscribers
    subs: 0,
    monsterDensity: 50,
    xpMult: 1.0,
    difficulty: 1,
    price: 15,
    weekRevenue: 0,
    weekCost: 0,
    tool: 'town',
    camera: { x: 0, y: 0, zoom: 1 },
    classes: [
      { name: '戦士', color: '#ff5d5d', power: 60 },
      { name: '魔術師', color: '#4a9eff', power: 45 },
      { name: '狩人', color: '#39ff88', power: 50 },
    ],
    logs: [],
  };

  const GRID = 16; // world grid size in px at zoom 1 — smaller cells = more placement freedom
  const BUILD_TIME = { town: 6, road: 1.5, spawn: 5 }; // in-game seconds of construction (scaled by speed)

  // ---------------- Name generation ----------------
  const NAME_PARTS = {
    pre: ['アル','ヴェ','ソ','カル','ミラ','エッジ','タラ','グリム','ノー','ハイ','ドル','フェン','ロス','ブラ','シェイ','オル','クレ','ヴァン','セイ','モル'],
    mid: ['デ','リ','ラン','ドゥ','ベ','ホロ','スク','ファ','ヴェ','ラ','ゴ','ニ','タ','セン','マ','キ','ロ','ヴィ','ダ','レ'],
    end: ['ン','ル','ト','スト','ウ','ド','ン','ラ','ズ','フ','ム','ク','ネ','リア','ス','ヴ','ダム','ル','ズン','ト'],
  };
  const usedNames = new Set();
  function generateTownName(){
    let name, tries = 0;
    do {
      const pre = NAME_PARTS.pre[Math.floor(Math.random()*NAME_PARTS.pre.length)];
      const mid = Math.random() < 0.7 ? NAME_PARTS.mid[Math.floor(Math.random()*NAME_PARTS.mid.length)] : '';
      const end = NAME_PARTS.end[Math.floor(Math.random()*NAME_PARTS.end.length)];
      name = pre + mid + end;
      tries++;
    } while (usedNames.has(name) && tries < 20);
    usedNames.add(name);
    return name;
  }

  // ---------------- Game title generation (for the setup screen) ----------------
  const GAME_NAME_ADJ = ['エターナル','クリムゾン','ソウル','ドラゴン','シャドウ','エンバー','ミスティック','アビス','セレスティア','フロスト','オブリビオン','ラスト'];
  const GAME_NAME_NOUN = ['オブ・レジェンド','クロニクル','サーガ','タクティクス','オンライン','リバース','ジェネシス','レルムズ','オデッセイ','ネメシス'];
  function generateGameName(){
    const adj = GAME_NAME_ADJ[Math.floor(Math.random()*GAME_NAME_ADJ.length)];
    const noun = GAME_NAME_NOUN[Math.floor(Math.random()*GAME_NAME_NOUN.length)];
    return adj + ' ' + noun;
  }
  function generateVersion(){
    const major = 1;
    const minor = Math.floor(Math.random()*3);
    return `${major}.${minor}`;
  }

  // ---------------- Island terrain generation ----------------
  let island = null; // { cells: Set("gx,gy"), seed, radiusCells }

  function hashNoise(x, y, seed){
    let n = Math.sin(x*127.1 + y*311.7 + seed*74.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function smoothNoise(x, y, seed){
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = hashNoise(ix, iy, seed);
    const b = hashNoise(ix+1, iy, seed);
    const c = hashNoise(ix, iy+1, seed);
    const d = hashNoise(ix+1, iy+1, seed);
    const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
    return a*(1-ux)*(1-uy) + b*ux*(1-uy) + c*(1-ux)*uy + d*ux*uy;
  }

  function generateIsland(){
    const seed = Math.random() * 1000;
    const radiusCells = 52; // doubled to match GRID being halved, keeping the island the same physical size
    const cells = new Set();
    for (let gx = -radiusCells-4; gx <= radiusCells+4; gx++) {
      for (let gy = -radiusCells-4; gy <= radiusCells+4; gy++) {
        const dist = Math.hypot(gx, gy) / radiusCells;
        const angle = Math.atan2(gy, gx);
        const edgeNoise = smoothNoise(Math.cos(angle)*2.2+10, Math.sin(angle)*2.2+10, seed) * 0.5
                         + smoothNoise(Math.cos(angle)*5+40, Math.sin(angle)*5+40, seed) * 0.22;
        const threshold = 0.72 + edgeNoise * 0.55;
        const detail = smoothNoise(gx*0.15, gy*0.15, seed+5) * 0.12;
        if (dist - detail < threshold) {
          cells.add(gx + ',' + gy);
        }
      }
    }
    // precompute render-ready cell list (world coords + edge flag) once,
    // so the per-frame draw loop never has to split strings or do Set lookups
    const renderCells = [];
    for (const key of cells) {
      const [cx, cy] = key.split(',').map(Number);
      const isEdge = !cells.has((cx+1)+','+cy) || !cells.has((cx-1)+','+cy) ||
                     !cells.has(cx+','+(cy+1)) || !cells.has(cx+','+(cy-1));
      renderCells.push({ wx: cx*GRID, wy: cy*GRID, isEdge });
    }
    island = { cells, renderCells, seed, radiusCells };
    return island;
  }

  function isLand(gx, gy){
    if (!island) return false;
    const cx = Math.round(gx / GRID), cy = Math.round(gy / GRID);
    return island.cells.has(cx + ',' + cy);
  }

  generateIsland();

  // ---------------- Canvas setup ----------------
  const canvas = document.getElementById('map-canvas');
  const ctx = canvas.getContext('2d');
  const mapWrap = document.getElementById('map-wrap');

  function resizeCanvas(){
    const rect = mapWrap.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function screenToWorld(sx, sy){
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width/2, cy = rect.height/2;
    const wx = (sx - rect.left - cx) / state.camera.zoom - state.camera.x;
    const wy = (sy - rect.top - cy) / state.camera.zoom - state.camera.y;
    return { x: wx, y: wy };
  }
  function worldToScreen(wx, wy){
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width/2, cy = rect.height/2;
    return {
      x: (wx + state.camera.x) * state.camera.zoom + cx,
      y: (wy + state.camera.y) * state.camera.zoom + cy
    };
  }
  function snap(v){ return Math.round(v / GRID) * GRID; }

  // ---------------- Pan / zoom / click / road drafting ----------------
  // Road tool: dragging only builds a *draft*. Nothing is built or charged until 確定.
  // Moving the view while the road tool is active: right-drag, middle-drag,
  // Space+drag, or two fingers.
  const ROAD_COST = 40;      // price per new road cell (unchanged)
  const SNAP_PX = 18;        // a stroke's start/end stick to an existing road/town/spawn within this many screen px
  const SIMPLIFY_PX = 12;    // hand wobble smaller than this (screen px) is straightened out

  const pointers = new Map();           // pointerId -> {x,y}; only pointers currently pressed on the canvas
  let inputMode = null;                 // 'stroke' | 'pan' | 'click' | null
  let panRef = null;
  let clickRef = null;
  let strokeRaw = [];                   // world-space points of the stroke being drawn right now
  let spaceHeld = false;
  const draft = { cells: new Map(), edges: [] }; // cells: "gx,gy" -> {x,y} ; edges: {a,b}

  const draftBarEl = document.getElementById('draft-bar');
  const draftInfoEl = document.getElementById('draft-info');
  const draftConfirmEl = document.getElementById('btn-draft-confirm');
  let draftBarKey = '';

  function pointersMid(){
    let sx = 0, sy = 0;
    for (const p of pointers.values()) { sx += p.x; sy += p.y; }
    const n = Math.max(1, pointers.size);
    return { x: sx / n, y: sy / n };
  }
  function beginPan(){
    const m = pointersMid();
    panRef = { mx: m.x, my: m.y, camX: state.camera.x, camY: state.camera.y };
    inputMode = 'pan';
    canvas.style.cursor = 'grabbing';
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

    const wantsPan = e.button === 1 || e.button === 2 || spaceHeld || pointers.size >= 2;
    if (wantsPan) {
      strokeRaw = []; // abandon the stroke in progress; strokes already in the draft stay
      beginPan();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (state.tool === 'road') {
      inputMode = 'stroke';
      strokeRaw = [screenToWorld(e.clientX, e.clientY)];
    } else {
      inputMode = 'click';
      clickRef = { x: e.clientX, y: e.clientY, camX: state.camera.x, camY: state.camera.y, moved: false };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (inputMode === 'pan') {
      const m = pointersMid();
      state.camera.x = panRef.camX + (m.x - panRef.mx) / state.camera.zoom;
      state.camera.y = panRef.camY + (m.y - panRef.my) / state.camera.zoom;
    } else if (inputMode === 'stroke') {
      const w = screenToWorld(e.clientX, e.clientY);
      const last = strokeRaw[strokeRaw.length - 1];
      if (!last || Math.hypot(w.x - last.x, w.y - last.y) * state.camera.zoom >= 2) strokeRaw.push(w);
    } else if (inputMode === 'click') {
      const dx = e.clientX - clickRef.x, dy = e.clientY - clickRef.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) clickRef.moved = true;
      if (clickRef.moved) {
        state.camera.x = clickRef.camX + dx / state.camera.zoom;
        state.camera.y = clickRef.camY + dy / state.camera.zoom;
      }
    }
  });

  function endPointer(e, cancelled){
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);

    if (inputMode === 'pan') {
      if (pointers.size > 0) beginPan(); // re-base so the view doesn't jump when one finger lifts
      else { inputMode = null; canvas.style.cursor = spaceHeld ? 'grab' : ''; }
      return;
    }
    if (pointers.size > 0) return;

    if (inputMode === 'stroke') {
      if (!cancelled) finishStroke();
      strokeRaw = [];
    } else if (inputMode === 'click') {
      if (!cancelled && !clickRef.moved) handleMapClick(e.clientX, e.clientY);
    }
    inputMode = null;
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    state.camera.zoom = Math.min(3, Math.max(0.35, state.camera.zoom * factor));
  }, { passive: false });

  // Space = hold to move the view with a normal left-drag (works in every tool)
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (e.code === 'Space') {
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      spaceHeld = true;
      if (pointers.size === 0) canvas.style.cursor = 'grab';
      return;
    }
    if (e.key === 'Escape') {
      if (cancelDraft()) pushToast('道の下書きをキャンセルしました');
      return;
    }
    if (e.key === 'Enter') {
      if (e.target && e.target.closest && e.target.closest('button, input, select, textarea')) return;
      if (draft.cells.size > 0) { e.preventDefault(); commitDraft(); }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    spaceHeld = false;
    if (pointers.size === 0) canvas.style.cursor = '';
  });
  window.addEventListener('blur', () => { spaceHeld = false; });

  // ---- road drafting ----

  // Turn a raw hand-drawn stroke (world points) into a clean chain of grid cells:
  // 1) straighten wobble (Douglas-Peucker), 2) snap the two ends onto nearby roads/towns/spawns so
  // roads actually connect, 3) route each leg along a straight run + one 45° leg.
  function buildStrokeRoute(raw){
    if (raw.length < 2) return null;
    const z = state.camera.zoom;
    const simplified = simplifyPath(raw, SIMPLIFY_PX / z);
    const verts = simplified.map(p => ({ x: snap(p.x), y: snap(p.y) }));
    const s0 = findSnapTarget(raw[0].x, raw[0].y);
    const s1 = findSnapTarget(raw[raw.length - 1].x, raw[raw.length - 1].y);
    if (s0) verts[0] = s0;
    if (s1) verts[verts.length - 1] = s1;
    const chain = [verts[0]];
    for (let i = 1; i < verts.length; i++) {
      for (const c of routeOctilinear(chain[chain.length - 1], verts[i])) chain.push(c);
    }
    return chain.length >= 2 ? chain : null;
  }

  function simplifyPath(pts, eps){
    if (pts.length < 3) return pts.slice();
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let maxD = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const d = distToSegment(pts[i], pts[a], pts[b]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (idx !== -1 && maxD > eps) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function distToSegment(p, a, b){
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // nearest existing road node / draft cell / town / spawn within SNAP_PX of a world point
  function findSnapTarget(wx, wy){
    let best = null, bestD = SNAP_PX / state.camera.zoom;
    const consider = (x, y) => {
      const d = Math.hypot(x - wx, y - wy);
      if (d <= bestD) { bestD = d; best = { x, y }; }
    };
    for (const n of state.roads) consider(n.x, n.y);
    for (const c of draft.cells.values()) consider(c.x, c.y);
    for (const t of state.towns) consider(t.x, t.y);
    for (const s of state.spawns) consider(s.x, s.y);
    return best;
  }

  // cells from a (exclusive) to b (inclusive): a straight run along the longer axis, then a 45° run
  function routeOctilinear(a, b){
    const cells = [];
    const dx = Math.round((b.x - a.x) / GRID), dy = Math.round((b.y - a.y) / GRID);
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const diag = Math.min(adx, ady);
    const straight = Math.max(adx, ady) - diag;
    const legs = adx >= ady ? [[sx, 0, straight], [sx, sy, diag]] : [[0, sy, straight], [sx, sy, diag]];
    let x = a.x, y = a.y;
    for (const [ux, uy, n] of legs) {
      for (let i = 0; i < n; i++) { x += ux * GRID; y += uy * GRID; cells.push({ x, y }); }
    }
    return cells;
  }

  function finishStroke(){
    const chain = buildStrokeRoute(strokeRaw);
    if (!chain) return;
    const { skippedSea } = addRouteToDraft(chain);
    if (skippedSea) pushToast('海の部分には道を引けません。', 'warn');
    refreshDraftBar();
  }

  function addRouteToDraft(chain){
    let skippedSea = false;
    for (let i = 0; i < chain.length; i++) {
      const c = chain[i];
      if (!isLand(c.x, c.y)) { skippedSea = true; continue; }
      draft.cells.set(c.x + ',' + c.y, { x: c.x, y: c.y });
      if (i === 0) continue;
      const p = chain[i - 1];
      if (!isLand(p.x, p.y)) continue; // never connect across water
      const a = p.x + ',' + p.y, b = c.x + ',' + c.y;
      if (a === b) continue;
      if (!draft.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) draft.edges.push({ a, b });
    }
    return { skippedSea };
  }

  // draft cells that don't already have a road node (only these cost money)
  function draftNewCellKeys(){
    const have = new Set(state.roads.map(r => r.x + ',' + r.y));
    return [...draft.cells.keys()].filter(k => !have.has(k));
  }

  function cancelDraft(){
    const had = draft.cells.size > 0 || strokeRaw.length > 0;
    draft.cells.clear();
    draft.edges.length = 0;
    strokeRaw = [];
    refreshDraftBar();
    return had;
  }

  function commitDraft(){
    if (draft.cells.size === 0) return;
    const keys = draftNewCellKeys();
    const cost = keys.length * ROAD_COST;
    if (state.cash < cost) {
      pushToast(`資金が足りません（必要 ¥${cost.toLocaleString()}）`, 'warn');
      return;
    }
    state.cash -= cost;
    for (const k of keys) {
      const c = draft.cells.get(k);
      state.roads.push({ x: c.x, y: c.y, buildLeft: BUILD_TIME.road, buildTotal: BUILD_TIME.road });
    }
    for (const e of draft.edges) ensureRoadEdge(e.a, e.b);
    draft.cells.clear();
    draft.edges.length = 0;
    refreshDraftBar();
    renderHeader();
    renderSidebar();
    renderReport();
    addLog(`道を${keys.length}マス敷設した（¥${cost.toLocaleString()}）。`, 'pos');
    pushToast(`道を確定しました（¥${cost.toLocaleString()}）`, 'good');
  }

  function refreshDraftBar(){
    const has = draft.cells.size > 0;
    let key = 'off', text = '', short = false;
    if (has) {
      const n = draftNewCellKeys().length;
      const cost = n * ROAD_COST;
      short = state.cash < cost;
      text = `新規 ${n}マス / ¥${cost.toLocaleString()}` + (short ? '（資金不足）' : '');
      key = text;
    }
    if (key === draftBarKey) return;
    draftBarKey = key;
    draftBarEl.classList.toggle('show', has);
    draftInfoEl.textContent = text;
    draftInfoEl.classList.toggle('short', short);
    draftConfirmEl.disabled = short;
  }

  document.getElementById('btn-draft-confirm').addEventListener('click', commitDraft);
  document.getElementById('btn-draft-cancel').addEventListener('click', () => { cancelDraft(); });

  // ensure an edge exists between two node keys ("gx,gy" strings). A node can have
  // any number of edges, so intersections/branches work like a real road network.
  function ensureRoadEdge(keyA, keyB){
    if (keyA === keyB) return;
    const exists = state.roadEdges.some(e =>
      (e.a === keyA && e.b === keyB) || (e.a === keyB && e.b === keyA));
    if (exists) return;
    state.roadEdges.push({ a: keyA, b: keyB, buildLeft: BUILD_TIME.road, buildTotal: BUILD_TIME.road });
  }

  function handleMapClick(sx, sy){
    const w = screenToWorld(sx, sy);
    const gx = snap(w.x), gy = snap(w.y);

    if (state.tool === 'delete') {
      removeAt(gx, gy);
      return;
    }

    if (state.tool === 'rename') {
      const t = state.towns.find(t => t.x===gx && t.y===gy);
      if (t) openRenamePrompt(t);
      return;
    }

    if (!isLand(gx, gy)) {
      pushToast('海には建設できません。島の内側を選んでください。', 'warn');
      return;
    }

    const costs = { town: 500, spawn: 300 };
    const cost = costs[state.tool];
    if (cost !== undefined && state.cash < cost) {
      pushToast('資金が不足しています。', 'warn');
      return;
    }

    if (state.tool === 'town') {
      if (buildingOccupied(gx, gy)) return;
      const name = generateTownName();
      state.towns.push({ x: gx, y: gy, id: cryptoId(), level: 1, name, buildLeft: BUILD_TIME.town, buildTotal: BUILD_TIME.town });
      state.cash -= cost;
      pushToast(`町「${name}」の建設を開始`, 'good');
    } else if (state.tool === 'spawn') {
      if (buildingOccupied(gx, gy)) return;
      state.spawns.push({ x: gx, y: gy, id: cryptoId(), buildLeft: BUILD_TIME.spawn, buildTotal: BUILD_TIME.spawn });
      state.cash -= cost;
      pushToast('リスポーン地点の建設を開始', 'good');
    }
    renderSidebar();
  }

  function openRenamePrompt(town){
    const newName = window.prompt('町の新しい名前を入力してください：', town.name);
    if (newName && newName.trim()) {
      const old = town.name;
      town.name = newName.trim().slice(0, 20);
      addLog(`町「${old}」は「${town.name}」に改名された。`, 'pos');
      renderSidebar();
    }
  }

  // buildings (town/spawn) block other buildings, but roads may pass through/under them.
  function buildingOccupied(gx, gy){
    return state.towns.some(t => t.x===gx && t.y===gy) ||
           state.spawns.some(s => s.x===gx && s.y===gy);
  }
  function roadOccupied(gx, gy){
    return state.roads.some(r => r.x===gx && r.y===gy);
  }
  // "occupied" for delete-tool purposes: anything at all at this cell
  function occupied(gx, gy){
    return buildingOccupied(gx, gy) || roadOccupied(gx, gy);
  }
  function removeAt(gx, gy){
    const before = state.towns.length + state.roads.length + state.spawns.length;
    const key = gx + ',' + gy;
    state.towns = state.towns.filter(t => !(t.x===gx && t.y===gy));
    state.roads = state.roads.filter(r => !(r.x===gx && r.y===gy));
    state.roadEdges = state.roadEdges.filter(e => e.a !== key && e.b !== key);
    state.spawns = state.spawns.filter(s => !(s.x===gx && s.y===gy));
    if (state.towns.length + state.roads.length + state.spawns.length < before) {
      addLog('建造物を撤去した。', 'neg');
    }
    renderSidebar();
  }
  function cryptoId(){ return Math.random().toString(36).slice(2,9); }

  // ---------------- Construction progress ----------------
  function tickConstruction(dt){
    let justFinished = [];
    for (const t of state.towns) {
      if (t.buildLeft > 0) {
        t.buildLeft = Math.max(0, t.buildLeft - dt * state.speed);
        if (t.buildLeft === 0) justFinished.push(`町「${t.name}」が完成した。`);
      }
    }
    for (const sp of state.spawns) {
      if (sp.buildLeft > 0) {
        sp.buildLeft = Math.max(0, sp.buildLeft - dt * state.speed);
        if (sp.buildLeft === 0) justFinished.push('リスポーン地点が完成した。');
      }
    }
    for (const r of state.roads) {
      if (r.buildLeft > 0) {
        r.buildLeft = Math.max(0, r.buildLeft - dt * state.speed);
      }
    }
    for (const e of state.roadEdges) {
      if (e.buildLeft > 0) {
        e.buildLeft = Math.max(0, e.buildLeft - dt * state.speed);
      }
    }
    for (const msg of justFinished) addLog(msg, 'pos');
  }
  function isBuilt(obj){ return !obj.buildLeft || obj.buildLeft <= 0; }

  // ---------------- Simulated players (AI subscribers / testers) ----------------
  const TESTER_CAP = 4; // small number of dev testers wandering pre-release

  function spawnPlayer(isTester){
    const readySpawns = state.spawns.filter(isBuilt);
    if (readySpawns.length === 0) return;
    const sp = readySpawns[Math.floor(Math.random()*readySpawns.length)];
    const cls = state.classes[Math.floor(Math.random()*state.classes.length)];
    const target = pickTownNear(sp);
    state.players.push({
      x: sp.x, y: sp.y,
      tx: target ? target.x : sp.x, ty: target ? target.y : sp.y,
      cls: cls,
      satisfaction: 60 + Math.random()*20,
      speed: 0.6 + Math.random()*0.5,
      life: 0,
      bob: Math.random()*Math.PI*2,
      id: cryptoId(),
      isTester: !!isTester,
    });
  }
  function pickTownNear(spawn){
    const builtTowns = state.towns.filter(isBuilt);
    if (builtTowns.length === 0) return null;
    let best = null, bestD = Infinity;
    for (const t of builtTowns) {
      const d = Math.hypot(t.x - spawn.x, t.y - spawn.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  function simulate(dt){
    const readySpawns = state.spawns.filter(isBuilt);
    const readyTowns = state.towns.filter(isBuilt);

    if (!state.released) {
      // pre-release: only a handful of dev testers wander around, no subs/economy growth
      const testerChance = 0.05 * dt * state.speed;
      if (readySpawns.length > 0 && readyTowns.length > 0 && Math.random() < testerChance) {
        if (state.players.length < TESTER_CAP) spawnPlayer(true);
      }
    } else {
      // post-release: real subscriber traffic, capped by subs and town capacity
      const subCap = Math.round(state.subs * 0.35);
      const townCap = 20 + readyTowns.length * 18;
      const onlineCap = Math.max(5, Math.min(subCap, townCap));
      const spawnChance = 0.06 * dt * state.speed;
      if (readySpawns.length > 0 && readyTowns.length > 0 && Math.random() < spawnChance) {
        if (state.players.length < onlineCap) spawnPlayer(false);
      }
    }

    for (const p of state.players) {
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        p.x += (dx/dist) * p.speed * dt * state.speed * 8;
        p.y += (dy/dist) * p.speed * dt * state.speed * 8;
      } else {
        if (Math.random() < 0.3 && readyTowns.length > 0) {
          const t = readyTowns[Math.floor(Math.random()*readyTowns.length)];
          p.tx = t.x + (Math.random()-0.5)*64;
          p.ty = t.y + (Math.random()-0.5)*64;
        } else {
          p.tx = p.x + (Math.random()-0.5)*128;
          p.ty = p.y + (Math.random()-0.5)*128;
        }
      }
      p.life += dt * state.speed;
      p.bob += dt * state.speed * 4;
      const crowd = countNearby(p.x, p.y, 96);
      let drift = 0;
      if (crowd > 12) drift -= 0.4;
      if (state.difficulty === 2) drift -= 0.05;
      if (state.difficulty === 0) drift -= 0.02;
      drift += 0.05;
      p.satisfaction = Math.max(0, Math.min(100, p.satisfaction + drift * dt * state.speed));
      if (p.satisfaction < 15 && Math.random() < 0.01 * dt * state.speed) {
        p.leaving = true;
      }
    }
    state.players = state.players.filter(p => !p.leaving);
  }

  function countNearby(x, y, r){
    let c = 0;
    for (const p of state.players) {
      if (Math.hypot(p.x-x, p.y-y) < r) c++;
    }
    return c;
  }

  // ---------------- Economy tick (per in-game day) ----------------
  function economyTick(){
    state.day++;

    const cost = Math.round((state.towns.length * 12) + (state.roads.length * 1.5) + (state.spawns.length * 6));

    if (!state.released) {
      // pre-release: no subscribers, no revenue — just upkeep cost ticking while you build
      state.cash -= cost;
      state.weekRevenue = 0;
      state.weekCost = cost;
      renderHeader();
      renderReport();
      return;
    }

    const builtTowns = state.towns.filter(isBuilt);
    const builtSpawns = state.spawns.filter(isBuilt);
    const avgSat = avgSatisfaction();
    let growth = (builtTowns.length * 1.2) + (avgSat - 50) * 0.15;
    growth += (builtSpawns.length > 0 ? 1 : -2);
    state.subs = Math.max(0, Math.round(state.subs + growth));

    const revenue = Math.round(state.subs * state.price * 0.14);
    state.cash += revenue - cost;
    state.weekRevenue = revenue;
    state.weekCost = cost;

    if (state.day % 5 === 0) {
      if (avgSat > 70) addLog(`加入者の満足度が高水準（${avgSat.toFixed(0)}）。フォーラムは好意的な投稿で溢れている。`, 'pos');
      else if (avgSat < 35 && state.players.length > 3) addLog(`満足度が低下（${avgSat.toFixed(0)}）。苦情スレッドが増えている。`, 'neg');
    }

    const overloaded = overloadedCount();
    if (overloaded > 0 && Math.random() < 0.4) {
      addLog(`過密エリアが${overloaded}箇所。サーバーが不安定になっている。`, 'neg');
    }

    renderHeader();
    renderReport();
  }

  function avgSatisfaction(){
    if (state.players.length === 0) return 50;
    return state.players.reduce((s,p)=>s+p.satisfaction,0) / state.players.length;
  }
  function overloadedCount(){
    let n = 0;
    for (const t of state.towns.filter(isBuilt)) {
      if (countNearby(t.x, t.y, 96) > 18) n++;
    }
    return n;
  }

  // ---------------- Rendering ----------------
  function render(){
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0,0,rect.width, rect.height);
    ctx.fillStyle = '#060a10';
    ctx.fillRect(0,0,rect.width, rect.height);

    drawIsland(rect);
    drawGrid(rect);

    // roads — nodes + edges, so any node can have multiple edges (real intersections/branches)
    const roadNodeMap = new Map(); // "gx,gy" -> node object (built or not)
    for (const r of state.roads) {
      roadNodeMap.set(r.x + ',' + r.y, r);
    }
    ctx.lineCap = 'round';
    for (const e of state.roadEdges) {
      const nodeA = roadNodeMap.get(e.a);
      const nodeB = roadNodeMap.get(e.b);
      if (!nodeA || !nodeB) continue; // an endpoint was deleted

      const s1 = worldToScreen(nodeA.x, nodeA.y);
      const s2 = worldToScreen(nodeB.x, nodeB.y);
      const edgeReady = isBuilt(e) && isBuilt(nodeA) && isBuilt(nodeB);

      if (edgeReady) {
        ctx.strokeStyle = 'rgba(57,255,136,0.55)';
        ctx.lineWidth = Math.max(2, 4 * state.camera.zoom);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      } else {
        // under construction — faint guide line plus a progress marker at the midpoint
        ctx.strokeStyle = 'rgba(255,209,102,0.25)';
        ctx.lineWidth = Math.max(1, 2 * state.camera.zoom);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const midX = (s1.x+s2.x)/2, midY = (s1.y+s2.y)/2;
        drawConstructionMarker(midX, midY, 5*state.camera.zoom, e.buildLeft / e.buildTotal);
      }
    }
    // node markers: glowing dot when built, ring progress when still under construction
    for (const r of state.roads) {
      const s = worldToScreen(r.x, r.y);
      if (isBuilt(r)) {
        ctx.fillStyle = 'rgba(57,255,136,0.7)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2*state.camera.zoom, 0, Math.PI*2);
        ctx.fill();
      } else {
        drawConstructionMarker(s.x, s.y, 6*state.camera.zoom, r.buildLeft / r.buildTotal);
      }
    }

    // road draft preview (nothing is built or charged until 確定)
    if (draft.cells.size > 0 || (inputMode === 'stroke' && strokeRaw.length > 1)) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const z = state.camera.zoom;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(127,227,255,0.9)';
      ctx.lineWidth = Math.max(2, 3 * z);
      for (const e of draft.edges) {
        const a = draft.cells.get(e.a), b = draft.cells.get(e.b);
        if (!a || !b) continue;
        const s1 = worldToScreen(a.x, a.y), s2 = worldToScreen(b.x, b.y);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(127,227,255,0.95)';
      for (const c of draft.cells.values()) {
        const s = worldToScreen(c.x, c.y);
        ctx.beginPath(); ctx.arc(s.x, s.y, 2 * z, 0, Math.PI * 2); ctx.fill();
      }
      if (inputMode === 'stroke' && strokeRaw.length > 1) {
        // your raw trail (faint) and the cleaned-up route that will be added to the draft
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        strokeRaw.forEach((p, i) => {
          const s = worldToScreen(p.x, p.y);
          if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
        });
        ctx.stroke();
        const chain = buildStrokeRoute(strokeRaw);
        if (chain) {
          ctx.setLineDash([6, 5]);
          ctx.lineWidth = Math.max(2, 3 * z);
          for (let i = 1; i < chain.length; i++) {
            const a = chain[i - 1], b = chain[i];
            const ok = isLand(a.x, a.y) && isLand(b.x, b.y);
            ctx.strokeStyle = ok ? 'rgba(255,209,102,0.95)' : 'rgba(255,93,93,0.8)';
            const s1 = worldToScreen(a.x, a.y), s2 = worldToScreen(b.x, b.y);
            ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
    refreshDraftBar();

    for (const sp of state.spawns) {
      const s = worldToScreen(sp.x, sp.y);
      if (isBuilt(sp)) {
        glowDot(s.x, s.y, 8*state.camera.zoom, '#ffd166');
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        drawStar(s.x, s.y, 5, 6*state.camera.zoom, 3*state.camera.zoom);
        ctx.fill();
      } else {
        drawConstructionMarker(s.x, s.y, 10*state.camera.zoom, sp.buildLeft / sp.buildTotal);
      }
    }

    for (const t of state.towns) {
      const s = worldToScreen(t.x, t.y);
      if (isBuilt(t)) {
        const crowded = countNearby(t.x, t.y, 96) > 18;
        const color = crowded ? '#ff5d5d' : '#4a9eff';
        glowDot(s.x, s.y, 14*state.camera.zoom, color);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7*state.camera.zoom, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#060a10';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (state.camera.zoom > 0.5) {
          ctx.fillStyle = '#eef3f8';
          ctx.font = `${11*Math.min(1.4,state.camera.zoom)}px 'JetBrains Mono'`;
          ctx.textAlign = 'center';
          ctx.fillText(t.name, s.x, s.y - 14*state.camera.zoom);
        }
      } else {
        drawConstructionMarker(s.x, s.y, 14*state.camera.zoom, t.buildLeft / t.buildTotal);
        if (state.camera.zoom > 0.5) {
          ctx.fillStyle = '#5e7086';
          ctx.font = `${10*Math.min(1.4,state.camera.zoom)}px 'JetBrains Mono'`;
          ctx.textAlign = 'center';
          ctx.fillText(t.name + '（建設中）', s.x, s.y - 20*state.camera.zoom);
        }
      }
    }

    for (const p of state.players) {
      const s = worldToScreen(p.x, p.y);
      if (s.x < -20 || s.x > rect.width+20 || s.y < -20 || s.y > rect.height+20) continue;
      const bobY = Math.sin(p.bob) * 1.2 * state.camera.zoom;
      const r = 4.2 * Math.max(0.8, state.camera.zoom);
      const color = p.isTester ? '#b28dff' : p.cls.color;

      glowDot(s.x, s.y + bobY, r * 3.2, color);

      ctx.beginPath();
      ctx.arc(s.x, s.y + bobY, r, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = p.isTester ? '#ffd166' : '#eef3f8';
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (p.isTester && state.camera.zoom > 0.55) {
        ctx.fillStyle = '#b28dff';
        ctx.font = `${8*Math.min(1.2,state.camera.zoom)}px 'JetBrains Mono'`;
        ctx.textAlign = 'center';
        ctx.fillText('TEST', s.x, s.y + bobY - r - 4);
      }
    }

    requestAnimationFrame(loop);
  }

  function drawConstructionMarker(x, y, r, progressRemaining){
    const pulse = 0.75 + Math.sin(performance.now()/220) * 0.25;
    glowDot(x, y, r*1.6*pulse, '#ffd166');
    ctx.strokeStyle = 'rgba(255,209,102,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI/2, -Math.PI/2 + (1 - progressRemaining) * Math.PI*2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,209,102,0.25)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.stroke();
  }

  function glowDot(x, y, r, color){
    const grad = ctx.createRadialGradient(x,y,0,x,y,r);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
  }

  function drawStar(cx, cy, spikes, outerR, innerR){
    let rot = Math.PI/2*3;
    let x = cx, y = cy;
    const step = Math.PI/spikes;
    ctx.moveTo(cx, cy-outerR);
    for (let i=0; i<spikes; i++){
      x = cx + Math.cos(rot)*outerR; y = cy + Math.sin(rot)*outerR;
      ctx.lineTo(x,y); rot += step;
      x = cx + Math.cos(rot)*innerR; y = cy + Math.sin(rot)*innerR;
      ctx.lineTo(x,y); rot += step;
    }
    ctx.lineTo(cx, cy-outerR);
    ctx.closePath();
  }

  function drawIsland(rect){
    if (!island) return;
    const z = state.camera.zoom;
    const cellSize = GRID * z;
    if (cellSize < 2) return;

    const pad = cellSize;
    const half = cellSize/2 + 0.5;

    // batch by fill color to minimize context state changes
    ctx.fillStyle = '#101d18';
    for (const c of island.renderCells) {
      if (c.isEdge) continue;
      const s = worldToScreen(c.wx, c.wy);
      if (s.x < -pad || s.x > rect.width+pad || s.y < -pad || s.y > rect.height+pad) continue;
      ctx.fillRect(s.x - half, s.y - half, cellSize+1, cellSize+1);
    }
    ctx.fillStyle = '#152a1f';
    for (const c of island.renderCells) {
      if (!c.isEdge) continue;
      const s = worldToScreen(c.wx, c.wy);
      if (s.x < -pad || s.x > rect.width+pad || s.y < -pad || s.y > rect.height+pad) continue;
      ctx.fillRect(s.x - half, s.y - half, cellSize+1, cellSize+1);
    }
  }

  function drawGrid(rect){
    const z = state.camera.zoom;
    const step = GRID * z;
    if (step < 8) return;
    const offX = (state.camera.x * z) % step + rect.width/2 % step;
    const offY = (state.camera.y * z) % step + rect.height/2 % step;
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = offX % step; x < rect.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,rect.height); ctx.stroke();
    }
    for (let y = offY % step; y < rect.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(rect.width,y); ctx.stroke();
    }
  }

  // ---------------- Main loop ----------------
  let lastTs = performance.now();
  let economyAcc = 0;
  function loop(ts){
    const dt = Math.min(0.1, (ts - lastTs)/1000);
    lastTs = ts;
    if (!state.paused) {
      tickConstruction(dt);
      simulate(dt);
      economyAcc += dt * state.speed;
      if (economyAcc > 3) {
        economyAcc = 0;
        economyTick();
      }
    }
    render();
  }
  requestAnimationFrame(loop);

  // ---------------- UI wiring ----------------
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
      btn.blur(); // so Space/Enter go to the map, not to this button
      if (state.tool !== 'road' && cancelDraft()) pushToast('道の下書きを破棄しました', 'warn');
      const hints = {
        town: 'クリックして<b>町</b>を建設。完成まで時間がかかる。',
        road: '<b>ドラッグ</b>で道の下書き → <b>確定</b>で建設。視点移動は<b>右ドラッグ</b> / <b>Space+ドラッグ</b> / 二本指。',
        spawn: 'クリックして<b>リスポーン地点</b>を設置。ここから冒険者が旅立つ。',
        rename: '町を<b>クリック</b>すると名前を変更できる。',
        delete: 'クリックして建造物を<b>撤去</b>する。',
      };
      document.getElementById('map-hint').innerHTML = hints[state.tool] || '';
    });
  });

  document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn[data-speed]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.speed = parseFloat(btn.dataset.speed);
      state.paused = false;
      document.getElementById('btn-pause').classList.remove('active');
    });
  });
  document.getElementById('btn-pause').addEventListener('click', (e) => {
    state.paused = !state.paused;
    e.target.classList.toggle('active', state.paused);
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
      document.getElementById('tab-' + tab.dataset.tab).style.display = 'block';
    });
  });

  const sMonster = document.getElementById('s-monster');
  const sXp = document.getElementById('s-xp');
  const sDiff = document.getElementById('s-diff');
  const sPrice = document.getElementById('s-price');
  sMonster.addEventListener('input', () => {
    state.monsterDensity = parseInt(sMonster.value);
    document.getElementById('v-monster').textContent = state.monsterDensity + '%';
  });
  sXp.addEventListener('input', () => {
    state.xpMult = parseInt(sXp.value)/100;
    document.getElementById('v-xp').textContent = state.xpMult.toFixed(1) + '×';
  });
  const diffLabels = ['やさしい','普通','ハード'];
  sDiff.addEventListener('input', () => {
    state.difficulty = parseInt(sDiff.value);
    document.getElementById('v-diff').textContent = diffLabels[state.difficulty];
  });
  sPrice.addEventListener('input', () => {
    state.price = parseInt(sPrice.value);
    document.getElementById('v-price').textContent = '¥' + state.price;
  });

  // ---------------- Sidebar renders ----------------
  function renderHeader(){
    document.getElementById('stat-cash').textContent = '¥' + Math.round(state.cash).toLocaleString();
    document.getElementById('stat-subs').textContent = state.subs.toLocaleString();
    document.getElementById('stat-online').textContent = state.players.length;
    document.getElementById('stat-day').textContent = 'Day ' + state.day;
  }

  function renderSidebar(){
    document.getElementById('town-count').textContent = state.towns.length;
    const list = document.getElementById('town-list');
    if (state.towns.length === 0) {
      list.innerHTML = '<div class="empty-note">マップをクリックして最初の町を建設しよう。</div>';
      return;
    }
    list.innerHTML = state.towns.map(t => {
      if (!isBuilt(t)) {
        const pct = Math.round((1 - t.buildLeft/t.buildTotal) * 100);
        return `<div class="town-card">
          <div class="tname"><span>${t.name}</span><span style="color:var(--gold)">建設中 ${pct}%</span></div>
          <div class="tmeta">まもなく完成します</div>
        </div>`;
      }
      const crowd = countNearby(t.x, t.y, 96);
      const crowded = crowd > 18;
      return `<div class="town-card" data-rename-id="${t.id}">
        <div class="tname"><span>${t.name}</span><span style="color:var(--text-dim)">Lv.${t.level}</span></div>
        <div class="tmeta ${crowded?'crowd':''}">近隣プレイヤー ${crowd}人${crowded?' — 過密警告':''}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.town-card[data-rename-id]').forEach(card => {
      card.addEventListener('click', () => {
        const t = state.towns.find(tw => tw.id === card.dataset.renameId);
        if (t) openRenamePrompt(t);
      });
    });
  }

  function renderReport(){
    document.getElementById('r-revenue').textContent = '¥' + state.weekRevenue.toLocaleString();
    document.getElementById('r-cost').textContent = '¥' + state.weekCost.toLocaleString();
    const sat = avgSatisfaction();
    document.getElementById('r-satisfaction').textContent = sat.toFixed(0) + ' / 100';
    document.getElementById('bar-satisfaction').style.width = sat + '%';
    document.getElementById('bar-satisfaction').style.background = sat > 60 ? 'var(--green)' : sat > 35 ? 'var(--gold)' : 'var(--red)';
    const overloaded = overloadedCount();
    document.getElementById('r-crowd').textContent = overloaded;
    document.getElementById('r-placed').textContent = state.towns.length + state.roads.length + state.spawns.length;
    const load = Math.min(100, state.players.length / (state.towns.length*15+15) * 100);
    document.getElementById('bar-load').style.width = load + '%';
    document.getElementById('bar-load').style.background = load > 70 ? 'var(--red)' : 'var(--blue)';
  }

  function renderClassList(){
    document.getElementById('class-list').innerHTML = state.classes.map(c => `
      <div class="stat-row"><span class="k"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:6px;"></span>${c.name}</span><span class="v">戦力 ${c.power}</span></div>
    `).join('');
  }
  renderClassList();

  function addLog(msg, cls){
    const t = 'Day ' + state.day;
    state.logs.unshift({ msg, cls, t });
    state.logs = state.logs.slice(0, 30);
    const listEl = document.getElementById('log-list');
    listEl.innerHTML = state.logs.map(l => `<div class="log-line ${l.cls||''}"><span class="t">[${l.t}]</span>${l.msg}</div>`).join('');
  }

  function pushToast(msg, kind){
    const wrap = document.getElementById('toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ---------------- Release flow (player-triggered, any time) ----------------
  function openReleaseDialog(){
    if (state.released) return;
    const suggestedName = generateGameName();
    const nameInput = window.prompt('ゲームのタイトルを入力してください（空欄で自動生成）：', suggestedName);
    if (nameInput === null) return; // cancelled
    const versionInput = window.prompt('バージョンを入力してください（空欄で自動生成）：', generateVersion());
    if (versionInput === null) return;
    const yearInput = window.prompt('リリース年を入力してください（空欄で今年）：', String(new Date().getFullYear()));
    if (yearInput === null) return;

    releaseGame(nameInput.trim(), versionInput.trim(), yearInput.trim());
  }

  function releaseGame(nameInput, versionInput, yearInput){
    state.gameName = nameInput || generateGameName();
    state.gameVersion = versionInput || generateVersion();
    state.gameYear = yearInput || String(new Date().getFullYear());
    state.released = true;

    // testers go home, the world opens to the public
    state.players = state.players.filter(p => !p.isTester);

    document.getElementById('brand-name').textContent = state.gameName;
    document.getElementById('brand-sub').textContent = `v${state.gameVersion} — ${state.gameYear}年リリース`;
    document.title = `${state.gameName} — Ctrl/Sim`;

    const btn = document.getElementById('btn-release');
    if (btn) {
      btn.textContent = `公開中：v${state.gameVersion}`;
      btn.disabled = true;
      btn.classList.add('released');
    }

    addLog(`「${state.gameName}」（v${state.gameVersion}, ${state.gameYear}年）を正式リリースした！世界が一般加入者に開放された。`, 'pos');
    pushToast(`「${state.gameName}」をリリースしました`, 'good');
    renderHeader();
    renderSidebar();
    renderReport();
  }
  document.getElementById('btn-release').addEventListener('click', openReleaseDialog);

  // ---------------- Init ----------------
  addLog('未リリースの世界を作り始めた。準備ができたら「リリースする」を押そう。', 'pos');
  renderHeader();
  renderSidebar();
  renderReport();
})();
