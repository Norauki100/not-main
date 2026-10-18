
const $=id=>document.getElementById(id);
const Z0=5850;   // 吉浜のz。逆方向(吉浜→珀南)のルート距離は p=Z0-z
const WST=[{n:'珀南',z:0,no:'01',en:'Hakunan'},{n:'新山北',z:1300,no:'02',en:'Shinyamakita'},{n:'北川',z:2500,no:'03',en:'Kitagawa'},{n:'青山港前',z:3650,no:'04',en:'Aoyamaminatomae'},{n:'吉浜',z:5850,no:'05',en:'Yoshihama'}];   // 世界(駅の建物など)の駅
const LIMF=[[400,85,'区間'],[700,75,'住宅街'],[1000,120,'区間'],[3950,90,'山岳区間']];   // 線内最高120km/h。珀南(終着駅)は45km/h、新山北〜青山港前は制限なし   // 駅前の制限は無し
const GRF=[[150,12],[400,0],[600,-15],[850,0],[1500,10],[1800,0],[2050,-12],[2350,0],[2700,14],[2900,0],[3250,-10],[3450,0],[4100,12],[4700,0],[5000,-14],[5400,0]];
const SIGF=[200,750,1150,1520,2000,2350,2700,3150,3480,4050,5000,5550].map(z=>({z,a:'G'})),SIGR=[150,750,1700,2550,2850,3050,3550,3950,4450,5050,5450].map(z=>({z,a:'G'}));   // G=進行 Y=注意(次が赤) R=停止
const mkMag=l=>l.map((g,i)=>({i,zm:g.z-300})).filter(m=>m.zm>20);   // AWS磁石(信号の300m手前)
const MAGF=mkMag(SIGF),MAGR=mkMag(SIGR);
// 逆方向データ: 世界のzを p=Z0-z に写す
const mirrorLim=(lim,base)=>{const Z=[[-1e9,base,'区間']].concat(lim),n=Z.length,r=[];for(let i=n-2;i>=0;i--)r.push([Z0-Z[i+1][0],Z[i][1],Z[i][2]]);return{list:r,base:Z[n-1][1]}};
const _lr=mirrorLim(LIMF,45),LIMR=_lr.list,LIMRB=_lr.base;
const GRR=[];for(let i=GRF.length-1;i>=0;i--)GRR.push([Z0-GRF[i][0],-(i?GRF[i-1][1]:0)]);const GRRB=-GRF[GRF.length-1][1];
// 運転種別
const ROUTES={
fN:{key:'fN',type:'フリー',pre:'0F',lo:50,hi:99,dir:1,stops:[0,1,2,3,4],arr:[0,0,0,0,0],dep:[0,0,0,0,0],dest:'吉浜 方面',free:true},
fH:{key:'fH',type:'フリー',pre:'0F',lo:50,hi:99,dir:-1,stops:[4,3,2,1,0],arr:[0,0,0,0,0],dep:[0,0,0,0,0],dest:'珀南 方面',free:true},
ln:{key:'ln',type:'普通',pre:'1N',lo:1,hi:49,dir:1,stops:[0,1,2,3,4],arr:[0,115,265,410,590],dep:[0,145,295,440,0],dest:'吉浜 行'},
lh:{key:'lh',type:'普通',pre:'1H',lo:1,hi:49,dir:-1,stops:[4,3,2,1,0],arr:[0,150,295,445,590],dep:[0,180,325,475,0],dest:'珀南 行'},
en:{key:'en',type:'急行',pre:'3N',lo:50,hi:99,dir:1,stops:[0,2,4],arr:[0,150,365],dep:[0,175,0],dest:'吉浜 行'},
eh:{key:'eh',type:'急行',pre:'3H',lo:50,hi:99,dir:-1,stops:[4,2,0],arr:[0,190,365],dep:[0,215,0],dest:'珀南 行'}};
const OPP={ln:'lh',lh:'ln',en:'eh',eh:'en'},TURN=['珀南','吉浜'];   // 折り返しの対応 / 折り返し設備のある駅
const trk=S=>S.no==='01'&&RT&&RT.trk?String(RT.trk):(DIR>0?'2':'1');   // 番線(下りは外側=2番線(珀南は3番線)、上りは1番線(珀南は2番線))
let STN=WST,ARR=[0,0],DEP=[0,0],LIM=LIMF,LIMBASE=60,GR=GRF,GBASE=0,SIG=SIGF,MAG=MAGF,DIR=1,RT=null;   // 現在の運転種別のデータ(ルート距離pで表す)
function newNum(){RT.num=RT.pre+String(RT.lo+Math.floor(Math.random()*(RT.hi-RT.lo+1))).padStart(2,'0')}
let PX=z=>TX,XACT=[];   // 自列車の線路のx(曲線CXは別)/ 渡り線の制限25区間(ルート距離)
const SM=u=>u<=0?0:u>=1?1:u*u*(3-2*u),pick=a=>a[Math.floor(Math.random()*a.length)];
// 珀南(H01)の番線: 吉浜方面を向いて右から 1番線=x-8.2 2番線=x0 3番線=x5 4番線=x13.2
const depPath=[null,z=>-8.2+8.2*SM((z-140)/100)+5*SM((z-270)/100),z=>5*SM((z-270)/100),z=>5,z=>13.2-8.2*SM((z-140)/100)];   // 各番線から吉浜方面の本線(x=5)へ
const arrPath=[null,z=>-8.2+8.2*SM((z-140)/100),z=>0,z=>5*(1-SM((z-270)/100)),z=>5*(1-SM((z-270)/100))+8.2*(1-SM((z-140)/100))];   // 本線(x=0)から各番線へ
function setRoute(key,o){o=o||{};const R=ROUTES[key],rv=R.dir<0,off=o.dep||0;RT=R;DIR=R.dir;STN=R.stops.map(i=>Object.assign({},WST[i],{z:rv?Z0-WST[i].z:WST[i].z+40}));ARR=R.arr.map(x=>x+off);DEP=R.dep.map(x=>x+off);LIM=rv?LIMR:LIMF;LIMBASE=rv?LIMRB:45;GR=rv?GRR:GRF;GBASE=rv?GRRB:0;SIG=rv?SIGR:SIGF;MAG=rv?MAGR:MAGF;newNum();
const typ=R.type==='普通'?[1,4]:R.type==='急行'?[2,3]:[1,2,3,4];XACT=[];   // 普通は1か4番線、急行は2か3番線
if(!rv){const k=o.trk||pick(typ);RT.trk=k;const f=depPath[k];PX=z=>z<=450?f(z):TX;if(k<=2)XACT.push([270,370])}
else{const k=pick(typ);RT.trk=k;const g=arrPath[k],cr=!!o.tb;PX=z=>z<=450?g(z):(cr&&z>5000?TX*SM((z-5680)/80):0);if(k>=3)XACT.push([Z0-370,Z0-270]);if(cr)XACT.push([Z0-5760,Z0-5680])}}
setRoute('ln');
const limitAt=z=>{let l=LIMBASE;for(const e of LIM)if(z>=e[0])l=e[1];for(let i=0;i<SIG.length-1;i++)if(SIG[i].a==='Y'&&z>=SIG[i].z&&z<SIG[i+1].z)l=Math.min(l,45);for(const[a,b]of XACT)if(z>=a&&z<b)l=Math.min(l,25);return l};   // 渡り線は25km/h
const nextLim=z=>{for(const e of LIM)if(e[0]>z)return e;return null};
const gradeAt=z=>{let g=GBASE;for(const[a,v]of GR)if(z>=a)g=v;return g/1000};
let renderer,scene,cam;
try{
renderer=new THREE.WebGLRenderer({antialias:true,canvas:document.createElement('canvas')});
renderer.domElement.id='c';document.body.prepend(renderer.domElement);
}catch(e){document.body.innerHTML='<p style="padding:20px">このブラウザでは3Dを表示できません。</p>'}
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio,1.5),2));
scene=new THREE.Scene();const SKY=0xf0a46b;scene.background=new THREE.Color(SKY);scene.fog=new THREE.Fog(SKY,60,520);
cam=new THREE.PerspectiveCamera(65,1,.1,800);scene.add(cam);
const hemi=new THREE.HemisphereLight(0xffd9b0,0x3a3340,1.05);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffc48a,.9);sun.position.set(-30,40,60);scene.add(sun);
const disc=new THREE.Mesh(new THREE.CircleGeometry(38,32),new THREE.MeshBasicMaterial({color:0xfff1c9,fog:false}));disc.position.set(-130,60,-700);cam.add(disc);
const M=(c)=>new THREE.MeshLambertMaterial({color:c});
const box=(w,h,d,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof c==='number'?M(c):c);m.position.set(x,y,z);scene.add(m);return m};
const cyl=(r,h,c,x,y,z,seg=8)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),typeof c==='number'?M(c):c);m.position.set(x,y,z);scene.add(m);return m};
const LEN=6500,MID=LEN/2-100;
const SX=-2.3;   // 標識は線路の右側
const TX=5,ox=x=>x>0?x+TX:x;   // 複線: 上り線(隣)の中心X / 右側(+X)の景色を外へ寄せる
// 吉浜への区間(青山港前〜吉浜 2.2km): 線路が右へ寄って戻る曲線(右カーブ→左カーブ)。CX(z)=線路中心のX
const ZC0=4000,ZC1=5650,sm=u=>u<=0?0:u>=1?1:u*u*(3-2*u);
const CX=z=>{if(z<=ZC0||z>=ZC1)return 0;const u=z-ZC0,W=sm(u/320)*sm((ZC1-z)/320),k=2*Math.PI;return -W*(34*(1-Math.cos(k*u/1000))/2+10*(1-Math.cos(k*u/520+1.1))/2)};
const CS=z=>(CX(z+1)-CX(z-1))/2,CK=z=>(CX(z+2)-2*CX(z)+CX(z-2))/4;   // 傾き・曲率
const TUN=[[4300,4950],[5230,5480]];const inTun=z=>TUN.some(([a,b])=>z>a+4&&z<b-4);
const gr=new THREE.Mesh(new THREE.PlaneGeometry(500,LEN+600),M(0x4b5a3c));gr.rotation.x=-Math.PI/2;gr.position.set(0,0,MID);scene.add(gr);
for(const tx of[0,TX])for(const[za,zb]of[[-100,ZC0],[ZC1,LEN-100]]){const L=zb-za,c=(za+zb)/2;box(4.2,.3,L,0x6b6560,tx,.15,c);box(.12,.18,L,0xb8b8c0,tx-.72,.39,c);box(.12,.18,L,0xb8b8c0,tx+.72,.39,c)}
const dm=new THREE.Object3D();
function trackF(X,z0,z1){const n=Math.round((z1-z0)/8),bl=new THREE.InstancedMesh(new THREE.BoxGeometry(4.2,.3,1),M(0x6b6560),n),r1=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.18,1),M(0xb8b8c0),n),r2=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.18,1),M(0xb8b8c0),n),sl=[];
for(let i=0;i<n;i++){const za=z0+(z1-z0)*i/n,zb=z0+(z1-z0)*(i+1)/n,xa=X(za),xb=X(zb),len=Math.hypot(xb-xa,zb-za)+.2,cx=(xa+xb)/2,cz=(za+zb)/2,ang=Math.atan2(xb-xa,zb-za),co=Math.cos(ang),si=Math.sin(ang);
dm.rotation.set(0,ang,0);dm.scale.set(1,1,len);
dm.position.set(cx,.15,cz);dm.updateMatrix();bl.setMatrixAt(i,dm.matrix);
dm.position.set(cx-co*.72,.39,cz+si*.72);dm.updateMatrix();r1.setMatrixAt(i,dm.matrix);
dm.position.set(cx+co*.72,.39,cz-si*.72);dm.updateMatrix();r2.setMatrixAt(i,dm.matrix);
for(let j=0;j<Math.floor(len/.8);j++)sl.push([cx+si*(j*.8-len/2+.4),cz+co*(j*.8-len/2+.4),ang])}
scene.add(bl,r1,r2);const im=new THREE.InstancedMesh(new THREE.BoxGeometry(2.6,.1,.3),M(0x3b2f2a),sl.length);
dm.scale.set(1,1,1);sl.forEach(([x,z,a],k)=>{dm.position.set(x,.33,z);dm.rotation.set(0,a,0);dm.updateMatrix();im.setMatrixAt(k,dm.matrix)});dm.rotation.set(0,0,0);scene.add(im)}
trackF(z=>CX(z),ZC0,ZC1);trackF(z=>CX(z)+TX,ZC0,ZC1);
const nS=Math.floor(LEN/.8),sl=new THREE.InstancedMesh(new THREE.BoxGeometry(2.6,.1,.3),M(0x3b2f2a),nS*2);
for(let i=0;i<nS;i++)for(let k=0;k<2;k++){const zz=-100+i*.8;dm.position.set(k?TX:0,(zz>ZC0&&zz<ZC1)?-50:.33,zz);dm.updateMatrix();sl.setMatrixAt(i*2+k,dm.matrix)}scene.add(sl);
// 電柱は50mごと。架線のジグザグは電柱のところだけで折れる
const SPN=50,nP=Math.floor((LEN+100)/SPN),pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.17,7,8),M(0x55525c),nP),arm=new THREE.InstancedMesh(new THREE.BoxGeometry(5.8,.15,.15),M(0x55525c),nP);
const XZONE=[[250,400],[5650,5790]],inXZ=z=>XZONE.some(([a,b])=>z>a&&z<b);   // 渡り線の区間は、線路の間ではなく両わきに門型の柱を立てる
for(let i=0;i<nP;i++){const z=-80+i*SPN,cx=CX(z)+2.5,hide=inXZ(z);dm.rotation.set(0,0,0);dm.position.set(cx,hide?-50:3.5,z);dm.updateMatrix();pole.setMatrixAt(i,dm.matrix);dm.position.set(cx,hide?-50:6.3,z);dm.rotation.set(0,Math.atan(CS(z)),0);dm.updateMatrix();arm.setMatrixAt(i,dm.matrix);
if(hide){cyl(.15,7,0x55525c,-3.4,3.5,z);cyl(.15,7,0x55525c,TX+3.4,3.5,z);box(TX+6.8,.25,.25,0x55525c,2.5,6.6,z)}}dm.rotation.set(0,0,0);scene.add(pole,arm);
// 架線(交流): 上に吊架線(たるむ)、下にトロリ線(電柱ごとに±15cm、左右交互)、2本をハンガでつなぐ
{const Y0=5.5,Y1=6.45,SAG=.45,ZZ=.15,NSG=10,NH=10,V=THREE.Vector3;
const cw=new THREE.InstancedMesh(new THREE.BoxGeometry(.045,.045,1),M(0x2b2b2e),nP*2*NSG),ms=new THREE.InstancedMesh(new THREE.BoxGeometry(.04,.04,1),M(0x3a3a3f),nP*2*NSG),hg=new THREE.InstancedMesh(new THREE.BoxGeometry(.015,1,.015),M(0x555560),nP*2*NH);
const seg=(im,n,a,b)=>{dm.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);dm.lookAt(b);dm.scale.set(1,1,a.distanceTo(b));dm.updateMatrix();im.setMatrixAt(n,dm.matrix);dm.scale.set(1,1,1)};
let ci=0,mi=0,hi=0;
for(const tx of[0,TX])for(let i=0;i<nP;i++){const z0=-80+i*SPN,s0=(i%2?-1:1)*ZZ,zg=u=>s0*(1-2*u);
let pc=new V(tx+CX(z0)+zg(0),Y0,z0),pm=new V(tx+CX(z0)+zg(0),Y1,z0);
for(let j=1;j<=NSG;j++){const u=j/NSG,z=z0+SPN*u,x=tx+CX(z)+zg(u),c=new V(x,Y0,z),m=new V(x,Y1-SAG*4*u*(1-u),z);seg(cw,ci++,pc,c);seg(ms,mi++,pm,m);pc=c;pm=m}
for(let k=0;k<NH;k++){const u=k/NH,z=z0+SPN*u,L=Y1-SAG*4*u*(1-u)-Y0;dm.rotation.set(0,0,0);dm.position.set(tx+CX(z)+zg(u),Y0+L/2,z);dm.scale.set(1,L,1);dm.updateMatrix();hg.setMatrixAt(hi++,dm.matrix);dm.scale.set(1,1,1)}}
dm.rotation.set(0,0,0);dm.scale.set(1,1,1);scene.add(cw,ms,hg)}
function tex(draw,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));return new THREE.CanvasTexture(c)}
const face=(t,w,h,x,y,z)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,transparent:true}));m.rotation.y=Math.PI;m.position.set(x,y,z);scene.add(m)};
const limTex=k=>tex(g=>{g.fillStyle='#fff';g.beginPath();g.arc(64,64,62,0,7);g.fill();g.strokeStyle='#d62828';g.lineWidth=14;g.beginPath();g.arc(64,64,54,0,7);g.stroke();g.fillStyle='#111';g.font='bold 58px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(k,64,68)},128,128);
const advTex=(k,m)=>tex(g=>{g.fillStyle='#f2c230';g.fillRect(0,0,256,128);g.strokeStyle='#222';g.lineWidth=8;g.strokeRect(4,4,248,120);g.fillStyle='#111';g.textAlign='center';g.textBaseline='middle';g.font='bold 30px sans-serif';g.fillText('予告 '+k+' km/h',128,38);g.font='bold 34px sans-serif';g.fillText('▼ '+m+'m先',128,86)},256,128);
const faceR=(t,w,h,x,y,z)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,transparent:true}));m.position.set(x,y,z);scene.add(m)};
// 標識(制限・予告・勾配)。rev=逆方向(隣の線路・進行方向は-z・右側は+x側)
function buildSigns(lim,gr,rev){const ws=p=>rev?Z0-p:p,sx=z=>rev?-SX+CX(z):TX+SX+CX(z),fc=rev?faceR:face,po=rev?-.1:.1;
lim.forEach(([p,k],i)=>{const z=ws(p-4);fc(limTex(k),.75,.75,sx(z),1.75,z);box(.06,1.4,.06,0x555,sx(z),.7,z+po);
const pk=i?lim[i-1][1]:0;if(i&&k<pk){const za=Math.max(p-300,lim[i-1][0]+30),zw=ws(za);fc(advTex(k,Math.round(p-za)),1.1,.55,sx(zw),1.5,zw);box(.06,1.2,.06,0x555,sx(zw),.6,zw+po)}});
for(const[p,v]of gr){const up=v>0,dn=v<0,z=ws(p+15);fc(tex(g=>{g.fillStyle='#fff';g.fillRect(0,0,256,128);g.strokeStyle='#222';g.lineWidth=8;g.strokeRect(4,4,248,120);g.fillStyle=up?'#c62828':dn?'#1565c0':'#222';g.font='bold 40px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(up?'上り':dn?'下り':'水平',128,40);g.font='bold 46px sans-serif';g.fillText(Math.abs(v)+'‰',128,92)},256,128),1.1,.55,sx(z),1.5,z);box(.06,1.2,.06,0x555,sx(z),.6,z+po)}}
buildSigns(LIMF,GRF,false);buildSigns(LIMR,GRR,true);
function buildSig(list,rev){for(const g of list){const wz=rev?Z0-g.z:g.z,x=(rev?2.6:TX-2.6)+CX(wz),y0=3.4;cyl(.08,y0,0x4a4d55,x,y0/2,wz);box(.7,1.5,.35,0x15161b,x,y0+.3,wz);g.m=[];
[[.45,0x33ff77,0x0f2a18],[0,0xffcc22,0x2e270c],[-.45,0xff3b2e,0x2e0e0c]].forEach(([dy,c,off],k)=>{const mt=new THREE.MeshBasicMaterial({color:k===0?c:off}),m=new THREE.Mesh(new THREE.CircleGeometry(.2,16),mt);if(!rev)m.rotation.y=Math.PI;m.position.set(x,y0+.3+dy,wz+(rev?.18:-.18));scene.add(m);g.m.push([mt,c,off])})}}
buildSig(SIGF,false);buildSig(SIGR,true);
function updSig(){const J=s.jam&&s.jam.ph<2?s.jam:null;SIG.forEach((g,i)=>{const a=J?(i===J.j?'R':i===J.j-1?'Y':'G'):'G';if(a===g.a&&g.set)return;g.a=a;g.set=1;const on=[a==='G',a==='Y',a==='R'];g.m.forEach(([mt,c,off],k)=>mt.color.setHex(on[k]?c:off))})}
for(const m of MAGF)box(.5,.06,.9,0xf2c230,TX+CX(m.zm),.37,m.zm);
for(const m of MAGR){const z=Z0-m.zm;box(.5,.06,.9,0xf2c230,CX(z),.37,z)}
// ---- 駅の設備 ----
const MB=c=>new THREE.MeshBasicMaterial({color:c});
const bsides=S=>S===WST[0]?[]:S===WST[3]?[1]:[-1,1];   // 駅舎の側(珀南は専用の駅舎、青山港前は海側=左だけ)
const inBld=(x,z)=>{for(let i=1;i<WST.length;i++){const S=WST[i];if(z>S.z+2&&z<S.z+36)for(const sd of bsides(S))if(sd<0?x<-6.5:x>11.4)return true}return false};
const faceX=(tx,w,h,x,y,z,d)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tx,transparent:true}));m.rotation.y=d>0?Math.PI/2:-Math.PI/2;m.position.set(x,y,z);scene.add(m)};
const facadeTex=S=>tex(g=>{g.fillStyle='#d9d2c4';g.fillRect(0,0,1920,256);g.fillStyle='#000080';g.fillRect(0,8,1920,64);g.fillStyle='#fff';g.font='bold 44px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H'+S.no+'  '+S.n+'駅',960,42);
for(let i=0;i<9;i++){const x=40+i*205;if(i===4){g.fillStyle='#1b2230';g.fillRect(x,96,170,160);g.fillStyle='#ffe9a8';g.fillRect(x+10,106,150,10);g.fillStyle='#fff';g.font='bold 28px sans-serif';g.fillText('改札口',x+85,150);continue}
g.fillStyle=(i*7%3===0)?'#f3e2a0':'#2a4766';g.fillRect(x,100,170,100);g.fillStyle='#b9b09c';g.fillRect(x,100,170,6);g.fillRect(x+84,100,3,100)}
g.fillStyle='#b9b09c';g.fillRect(0,236,1920,20)},1920,256);
const gateTex=()=>tex(g=>{g.fillStyle='#1f6f4a';g.fillRect(0,0,512,100);g.fillStyle='#fff';g.font='bold 56px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('改札口',256,52)},512,100);
function furn(px,m,a){   // ベンチ・照明・自販機
for(let i=0;i<3;i++){const z=a+25+i*32;box(.5,.1,1.8,0x6b4a2f,px,1.55,z);box(.08,.5,1.8,0x6b4a2f,px+.28*m,1.85,z);box(.08,.45,.08,0x333333,px,1.32,z-.8);box(.08,.45,.08,0x333333,px,1.32,z+.8)}
for(let i=0;i<5;i++){const z=a+18+i*26;cyl(.05,3.2,0x555960,px+1.3*m,2.7,z);box(.55,.12,.3,MB(0xffe9a8),px+1.3*m,4.45,z)}
box(.8,2,.7,0xc0392b,px-1.6*m,2.1,a+8);box(.8,2,.7,0x2a6fb0,px-1.6*m,2.1,a+9.3);box(.7,1.4,.1,MB(0xfff2c0),px-1.6*m,2.4,a+8)}
function stationBuilding(S,side){const pe=side<0?-6.2:TX+6.2,dir=side<0?-1:1,bx=u=>pe+dir*u,z0=S.z+6,len=22,zc=z0+len/2,fd=-dir;
box(2,1.1,len,0xa9a29a,bx(1),.55,zc);   // ホーム背面の通路
box(4,4.4,len,0xd9d2c4,bx(4.2),2.2,zc);box(5.2,.35,len+1.2,0x4a4658,bx(4.2),4.6,zc);   // 駅舎(奥行4m)と屋根
box(3.4,.2,len,0x4a4658,bx(.9),4.3,zc);for(let i=0;i<4;i++)cyl(.12,3.2,0x55525c,bx(-.1),2.7,z0+2+i*6);
faceX(facadeTex(S),len,len/7.5,bx(2.18),2.7,zc,fd);   // 正面(駅名・窓・改札口)
for(let i=0;i<6;i++){const z=z0+5+i*1.2;box(1.5,1,.4,0x8a909a,bx(1),1.6,z);box(1.5,.05,.3,0x555b66,bx(1),2.12,z);box(.28,.06,.28,MB(0x33ff77),bx(.6),2.17,z)}   // 自動改札機
faceX(gateTex(),3.4,.7,bx(1),3.7,z0+8.5,fd)}
for(const S of WST){const a=S.z-50,b=S.z+90,c=(a+b)/2;
box(4.2,1.1,b-a,0xa9a29a,TX+4.1,.55,c);box(.3,.02,b-a,0xe6c34a,TX+2.25,1.11,c);box(4.4,.15,b-a-10,0x6c6a78,TX+4.1,4.7,c);for(let i=0;i<7;i++)cyl(.1,3.6,0x55525c,TX+5.9,2.9,a+15+i*20);
box(4.2,1.1,b-a,0xa9a29a,-4.1,.55,c);box(.3,.02,b-a,0xe6c34a,-2.25,1.11,c);box(4.4,.15,b-a-10,0x6c6a78,-4.1,4.7,c);
for(let i=0;i<7;i++)cyl(.1,3.6,0x55525c,-5.9,2.9,a+15+i*20);
// 停止位置目標(屋根から吊る): 2・4・6両。列車の後端がホーム後端から10mの位置に先頭が来る。下り=外側線(+X側)は+z向き、上り=内側(-X側)は-z向き
const stopTex=n=>tex(g=>{g.fillStyle='#000080';g.fillRect(0,0,128,96);g.fillStyle='#fff';g.font='bold 22px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('停止位置',64,20);g.font='bold 54px sans-serif';g.fillText(n+'両',64,62)},128,96);
for(const n of[2,4,6]){const t2=stopTex(n),zd=S.z+20*n-40,zu=S.z+80-20*n;cyl(.03,.8,0x888888,TX+2.6,4.3,zd+.1);face(t2,.8,.6,TX+2.6,3.65,zd);cyl(.03,.8,0x888888,-2.6,4.3,zu-.1);faceR(t2,.8,.6,-2.6,3.65,zu)}
const nmt=lb=>tex(g=>{g.fillStyle='#000080';g.fillRect(0,0,512,128);g.fillStyle='#fff';g.font='bold 46px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H'+S.no+'  '+S.n,256,46);g.font='bold 30px sans-serif';g.fillText(lb,256,98)},512,128);
face(nmt(S===WST[0]?'3・4番線':'2番線'),5,1.25,TX+4.1,3.7,a+4);faceR(nmt(S===WST[0]?'1・2番線':'1番線'),5,1.25,-4.1,3.7,b-4);furn(-4.1,1,a);furn(TX+4.1,-1,a);for(const sd of bsides(S))stationBuilding(S,sd)}
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const ASPH=0x3a3b42;
const RZ=480,CUT0=3900,CUT1=5750,inCut=z=>z>CUT0&&z<CUT1;   // 右側の道路は山側(曲線区間)で途切れる
const rdSeg=(sx,z0,z1)=>{const L=z1-z0,c=(z0+z1)/2;box(7,.06,L,ASPH,ox(sx*17),.03,c);box(2.2,.1,L,0x8f8a82,ox(sx*21.6),.05,c)};
rdSeg(1,RZ,LEN+300);rdSeg(-1,RZ,CUT0);rdSeg(-1,CUT1,LEN+300);
function railSeg(x,gaps){let a=RZ;const end=LEN+300;gaps.sort((p,q)=>p[0]-q[0]);for(const[g0,g1]of gaps){if(g0>a)box(.04,.04,g0-a,0x6b7076,x,1.05,(a+g0)/2);a=g1}if(end>a)box(.04,.04,end-a,0x6b7076,x,1.05,(a+end)/2)}
{const bg=S=>[S.z+2,S.z+36];railSeg(-8,[[3470,CUT1]].concat(WST.filter(S=>bsides(S).includes(-1)).map(bg)));railSeg(ox(8),WST.filter(S=>bsides(S).includes(1)).map(bg))}
const nD=Math.floor((LEN+400)/6),dash=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.02,2.4),new THREE.MeshLambertMaterial({color:0xe8e2c4}),nD*2);
for(let i=0;i<nD;i++)for(let k=0;k<2;k++){dm.position.set(k?17+TX:-17,(-200+i*6<RZ||(!k&&inCut(-200+i*6)))?-50:.07,-200+i*6);dm.updateMatrix();dash.setMatrixAt(i*2+k,dm.matrix)}scene.add(dash);
const nF=Math.floor((LEN+400)/6),fp=new THREE.InstancedMesh(new THREE.BoxGeometry(.08,1.1,.08),M(0x6b7076),nF*2);
for(let i=0;i<nF;i++)for(let k=0;k<2;k++){const zf=-200+i*6;dm.position.set(k?8+TX:-8,(zf<RZ||(!k&&zf>3470&&zf<3900)||(!k&&inCut(zf))||inBld(k?8+TX:-8,zf))?-50:.55,zf);dm.updateMatrix();fp.setMatrixAt(i*2+k,dm.matrix)}scene.add(fp);
const nL=Math.floor((LEN+400)/30),lp=new THREE.InstancedMesh(new THREE.CylinderGeometry(.05,.07,5,6),M(0x555960),nL*2),lh=new THREE.InstancedMesh(new THREE.BoxGeometry(.6,.15,.3),new THREE.MeshBasicMaterial({color:0xffe9a8}),nL*2);
for(let i=0;i<nL;i++)for(let k=0;k<2;k++){const x=k?13+TX:-13,z=-190+i*30;dm.position.set(x,(z<RZ||(!k&&inCut(z)))?-50:2.5,z);dm.updateMatrix();lp.setMatrixAt(i*2+k,dm.matrix);dm.position.set(x+(k?-.3:.3),(z<RZ||(!k&&inCut(z)))?-50:5,z);dm.updateMatrix();lh.setMatrixAt(i*2+k,dm.matrix)}scene.add(lp,lh);
for(let i=0,N=Math.round(22*LEN/1500);i<N;i++){const x=ox((rnd()<.5?-1:1)*(17+(rnd()<.5?-1.7:1.7))),z=RZ+rnd()*(LEN-RZ),c=[0xb23a3a,0xe8e8ec,0x2f4f7a,0x23262b,0xc9b037][i%5];if(x<0&&inCut(z))continue;box(1.8,.8,4.2,c,x,.55,z);box(1.6,.6,2.2,0x1d2430,x,1.2,z-.2)}
for(let i=0,N=Math.round(150*LEN/1500);i<N;i++){const side=rnd()<.5?-1:1,h=6+rnd()*28,w=8+rnd()*12;const dd=8+rnd()*10,bx=ox(side*(26+rnd()*45)),bz=rnd()*LEN-50;if((bx>0&&bz>3200&&bz<5500)||(bx<0&&bz>3850&&bz<5800))continue;box(w,h,dd,[0x3a3548,0x4a4458,0x575066,0x453a4a][i%4],bx,h/2,bz)}
const TG=new THREE.CylinderGeometry(.2,.3,2.4,8),TM=M(0x4a3426),CG=new THREE.IcosahedronGeometry(2.1,1),CMt=M(0x35553a);
for(let i=0,N=Math.round(60*LEN/1500);i<N;i++){const side=rnd()<.5?-1:1,x=ox(side*(22+rnd()*28)),z=rnd()*LEN;if((x<0&&WST.some(S=>z>S.z-60&&z<S.z+100))||(x>0&&z>3250&&z<5500)||(x<0&&z>3850&&z<5800)||(z<480&&Math.abs(x)<24))continue;{const tr=new THREE.Mesh(TG,TM);tr.position.set(x,1.2,z);scene.add(tr);const cr=new THREE.Mesh(CG,CMt);cr.position.set(x,4.4,z);cr.scale.set(1,1.25,1);scene.add(cr)}}
// ---- 追加線路・駅の作り込み ----
function track(x,z0,z1,buf){const L=z1-z0,c=(z0+z1)/2;box(4.2,.3,L,0x6b6560,x,.15,c);box(.12,.18,L,0xb8b8c0,x-.72,.39,c);box(.12,.18,L,0xb8b8c0,x+.72,.39,c);
const n=Math.floor(L/.8),im=new THREE.InstancedMesh(new THREE.BoxGeometry(2.6,.1,.3),M(0x3b2f2a),n);for(let i=0;i<n;i++){dm.position.set(x,.33,z0+i*.8);dm.updateMatrix();im.setMatrixAt(i,dm.matrix)}scene.add(im);
if(buf){const bz=buf===1?z0+.4:z1-.4;box(2.4,.7,.5,0x8b1f1f,x,.8,bz);box(.12,.5,.5,0xe6c34a,x-.9,1.3,bz)}}
function branch(x0,x1,z0,z1){const n=Math.max(6,Math.round((z1-z0)/8)),sm=u=>u*u*(3-2*u),X=u=>x0+(x1-x0)*sm(u),sl=[];
for(let i=0;i<n;i++){const ta=i/n,tb=(i+1)/n,xa=X(ta),xb=X(tb),za=z0+(z1-z0)*ta,zb=z0+(z1-z0)*tb,len=Math.hypot(xb-xa,zb-za)+.2,cx=(xa+xb)/2,cz=(za+zb)/2,ang=Math.atan2(xb-xa,zb-za),co=Math.cos(ang),si=Math.sin(ang);
const seg=(w,h,y,c,off)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,len),M(c));m.position.set(cx+co*off,y,cz-si*off);m.rotation.y=ang;scene.add(m)};
seg(4.2,.3,.15,0x6b6560,0);seg(.12,.18,.39,0xb8b8c0,-.72);seg(.12,.18,.39,0xb8b8c0,.72);
for(let j=0;j<Math.floor(len/.8);j++)sl.push([cx+si*(j*.8-len/2+.4),cz+co*(j*.8-len/2+.4),ang])}
const im=new THREE.InstancedMesh(new THREE.BoxGeometry(2.6,.1,.3),M(0x3b2f2a),sl.length);
sl.forEach(([x,z,a],k)=>{dm.position.set(x,.33,z);dm.rotation.y=a;dm.updateMatrix();im.setMatrixAt(k,dm.matrix)});dm.rotation.y=0;scene.add(im)}
function mkTrain(n,body,stripe,x,z0){for(let i=0;i<n;i++){const z=z0+i*20+10;box(2.9,3.3,19,body,x,2.25,z);box(2.94,.5,19.02,stripe,x,1.35,z);box(2.94,.95,17,0x1d2430,x,3.1,z);for(const dz of[-6.5,0,6.5])for(const sg of[-1,1])box(.05,2,1.3,0x2a2f3a,x+sg*1.47,2,z+dz);const r=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.45,19,16),M(body));r.rotation.x=Math.PI/2;r.scale.set(1,1,.28);r.position.set(x,3.9,z);scene.add(r)}}
function mkFreight(x,z0){box(3,3.6,15,0x8a2a22,x,2.4,z0+7.5);box(3.04,.5,15.02,0xe6c34a,x,1.3,z0+7.5);box(2.4,1,1.2,0x1d2430,x,3.6,z0+1);
const cols=[0x4a4f57,0x6b4a2f,0x3f5a4a,0x575b66,0x7a5a36,0x4a4f57,0x3f5a4a];
for(let i=0;i<7;i++){const z=z0+17+i*15;box(2.9,.3,13,0x222428,x,.75,z+6.5);box(2.8,2,12.6,cols[i],x,1.9,z+6.5)}}
// 珀南(H01): 2面4線+留置線2のターミナル
box(2.4,.7,.5,0x8b1f1f,0,.8,-99.6);box(2.4,.7,.5,0x8b1f1f,TX,.8,-99.6);
for(const x of[-8.2,13.2])track(x,-100,140,1);
branch(-8.2,0,140,240);branch(13.2,TX,140,240);   // ホーム端(90m)を出て50mで本線へ
for(const x of[-12.4,17.4])track(x,-100,40,1);
branch(-12.4,-8.2,40,140);branch(17.4,13.2,40,140);
mkTrain(4,0xd9dde2,0x000080,-12.4,-60);mkTrain(4,0xd9dde2,0x000080,17.4,-70);mkTrain(4,0xd9dde2,0x000080,13.2,-95);
// 珀南の出発信号(各番線ホーム先端、発車5秒前に青)
const HDS=[];
function mkDepSig(x,z){const y0=3.4;cyl(.08,y0,0x4a4d55,x,y0/2,z);box(.7,1.5,.35,0x15161b,x,y0+.3,z);const lights=[];
[[.45,0x33ff77,0x0f2a18],[0,0xffcc22,0x2e270c],[-.45,0xff3b2e,0x2e0e0c]].forEach(([dy,c,off],k)=>{const mt=new THREE.MeshBasicMaterial({color:k===2?c:off}),m=new THREE.Mesh(new THREE.CircleGeometry(.2,16),mt);m.rotation.y=Math.PI;m.position.set(x,y0+.3+dy,z-.18);scene.add(m);lights.push([mt,c,off])});
return{m:lights,a:'R'}}
[-8.2,0,TX,13.2].forEach(tx=>HDS.push(mkDepSig(tx+2.15,108)));
function updHds(){const fromH=DIR>0&&STN[0]&&STN[0].n==='珀南',k=RT&&RT.trk?RT.trk:0,green=fromH&&((s.mode==='dwell'&&s.tn===0&&s.dep-s.t<=5)||(s.mode==='run'&&s.z<200));
HDS.forEach((g,i)=>{const a=(i+1===k&&green)?'G':'R';if(a===g.a)return;g.a=a;const on=[a==='G',a==='Y',a==='R'];g.m.forEach(([mt,c,off],j)=>mt.color.setHex(on[j]?c:off))})}
box(27,.25,170,0x6c6a78,2.5,7.2,-15);for(const z of[-80,-40,-5,35]){box(.3,7,.3,0x55525c,-4.1,3.5,z);box(.3,7,.3,0x55525c,TX+4.1,3.5,z)}
{const m=new THREE.Mesh(new THREE.PlaneGeometry(46,5),new THREE.MeshBasicMaterial({map:tex(g=>{g.fillStyle='#cfc7b8';g.fillRect(0,0,1024,110);g.fillStyle='#1f6f4a';g.fillRect(0,0,1024,50);g.fillStyle='#fff';g.font='bold 34px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H01  珀南駅',512,27);
for(let i=0;i<14;i++){g.fillStyle=i%3?'#2a4766':'#f3e2a0';g.fillRect(20+i*70,62,52,40)}},1024,110)}));m.position.set(2.5,5.2,-100.9);scene.add(m)}
box(48,9,26,0xcfc7b8,2.5,4.5,-114);box(50,.5,28,0x4a4658,2.5,9.2,-114);
for(const px of[-4.1,TX+4.1]){box(4.2,1.1,48,0xa9a29a,px,.55,-74);for(let i=0;i<4;i++){const x=px-1.35+i*.9;box(.4,1,1.4,0x8a909a,x,1.6,-92);box(.3,.06,.3,MB(0x33ff77),x,2.13,-92)}}
// 青山港前(H04): 2面3線、右側だけ分岐する側線に貨物列車を留置、左は海
track(-8.2,3480,3790,1);branch(-8.2,0,3790,3890);mkFreight(-8.2,3570);   // ホーム端(3740m)を出て50mで分岐
{const sea=new THREE.Mesh(new THREE.PlaneGeometry(500,2000),M(0x2b6c8c));sea.rotation.x=-Math.PI/2;sea.position.set(287,.03,4250);scene.add(sea);
box(8,.12,1900,0xd9c08a,32.2,.06,4200);box(.6,1.2,1900,0x8f8a82,27.9,.6,4200)}
// ---- 折り返し設備(X渡り線)・車止め ----
for(const[za,zb]of[[270,370],[5680,5760]]){branch(0,TX,za,zb);branch(TX,0,za,zb)}
box(2.4,.7,.5,0x8b1f1f,0,.8,6395);box(2.4,.7,.5,0x8b1f1f,TX,.8,6395);
// ---- 待避線・留置線・渡り線にも架線 ----
{const V=THREE.Vector3,wg=new THREE.BoxGeometry(.045,.045,1),m1=M(0x2b2b2e),m2=M(0x3a3a3f);
const wseg=(a,b,mat)=>{const m=new THREE.Mesh(wg,mat);m.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);m.lookAt(b);m.scale.set(1,1,a.distanceTo(b));scene.add(m)};
const wireF=(X,z0,z1)=>{for(let z=z0;z<z1-1e-6;z+=10){const z2=Math.min(z+10,z1);wseg(new V(X(z),5.5,z),new V(X(z2),5.5,z2),m1);wseg(new V(X(z),6.3,z),new V(X(z2),6.3,z2),m2)}};
const bX=(x0,x1,z0,z1)=>z=>x0+(x1-x0)*sm((z-z0)/(z1-z0));
const pol=(x,z,w,ax)=>{cyl(.13,7,0x55525c,x,3.5,z);box(w,.15,.15,0x55525c,ax,6.3,z)};
// 珀南: 外側線(-8.2,13.2)・留置線(-12.4,17.4)・本線への合流
wireF(()=>-8.2,-100,140);wireF(bX(-8.2,0,140,240),140,240);wireF(()=>13.2,-100,140);wireF(bX(13.2,TX,140,240),140,240);
wireF(()=>-12.4,-100,40);wireF(bX(-12.4,-8.2,40,140),40,140);wireF(()=>17.4,-100,40);wireF(bX(17.4,13.2,40,140),40,140);
for(let z=-80;z<=130;z+=50){pol(-10.3,z,5.8,-10.3);pol(15.3,z,5.8,15.3)}
for(const z of[170,215]){const xl=bX(-8.2,0,140,240)(z),xr=bX(13.2,TX,140,240)(z);pol(xl-2.6,z,2.6,xl-1.3);pol(xr+2.6,z,2.6,xr+1.3)}
// 折り返しの渡り線
for(const[za,zb]of[[270,370],[5680,5760]]){wireF(bX(0,TX,za,zb),za,zb);wireF(bX(TX,0,za,zb),za,zb)}
// 青山港前の貨物側線
wireF(()=>-8.2,3480,3790);wireF(bX(-8.2,0,3790,3890),3790,3890);
for(let z=3500;z<=3780;z+=50)pol(-10.8,z,2.6,-9.5);
for(const z of[3830,3870]){const x=bX(-8.2,0,3790,3890)(z);pol(x-2.6,z,2.6,x-1.3)}}
// ---- 踏切(駅間に1か所) ----
const XING=[560,1900,3050,5640].map(z=>({z,arm:0,act:false}));
for(const X of XING){const z=X.z;box(52,.1,6,ASPH,2.5,.4,z);box(52,.02,.18,0xe9e9e9,2.5,.46,z-2.7);box(52,.02,.18,0xe9e9e9,2.5,.46,z+2.7);
X.lampA=new THREE.MeshBasicMaterial({color:0x3a0f0f});X.lampB=new THREE.MeshBasicMaterial({color:0x3a0f0f});X.arms=[];
for(const[px,pz,sg,fc]of[[-5.8,z-4,1,-1],[-5.8,z+4,0,-1],[TX+5.8,z+4,-1,1],[TX+5.8,z-4,0,1]]){cyl(.07,3.2,0xeeeeee,px,1.6,pz);box(.14,.7,1.1,0x222222,px+fc*.12,2.95,pz);
for(const[mat,dz]of[[X.lampA,-.35],[X.lampB,.35]]){const m=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),mat);m.position.set(px+fc*.24,2.95,pz+dz);scene.add(m)}
if(sg){const pv=new THREE.Group();pv.position.set(px,1.25,pz);for(let i=0;i<6;i++){const sgm=new THREE.Mesh(new THREE.BoxGeometry(.1,.14,.7),M(i%2?0xf4f4f4:0xd32f2f));sgm.position.z=sg*(.35+i*.7);pv.add(sgm)}scene.add(pv);X.arms.push({g:pv,sg})}}}
const xAct=X=>{const wz=DIR>0?s.z:Z0-s.z;let a=DIR>0?(wz<X.z+12&&X.z-wz<420):(wz>X.z-12&&wz-X.z<420);
if(ONC.on){const ow=DIR>0?ONC.q:Z0-ONC.q;if(DIR>0?(ow>X.z-12&&ow-X.z<420):(ow<X.z+12&&X.z-ow<420))a=true}return a};
let xbT=0,xbK=0;
function updCross(dt){const wz=DIR>0?s.z:Z0-s.z,bl=performance.now()%900<450;let dmin=1e9;
for(const X of XING){X.act=(s.mode==='run'||s.mode==='dwell')&&xAct(X);X.arm+=((X.act?1:0)-X.arm)*Math.min(1,dt*(X.act?.8:1.3));
for(const a of X.arms)a.g.rotation.x=a.sg>0?-1.35*(1-X.arm):1.35*(1-X.arm);
X.lampA.color.setHex(X.act&&bl?0xff2a1a:0x3a0f0f);X.lampB.color.setHex(X.act&&!bl?0xff2a1a:0x3a0f0f);
if(X.act)dmin=Math.min(dmin,Math.abs(wz-X.z))}
xbT-=dt;if(xbT<=0){xbT=.42;xbK^=1;if(dmin<520)kankan(.42*Math.exp(-(dmin/260)*(dmin/260))+.05,xbK)}}
function kankan(v,hi){if(!A)return;const t0=A.currentTime,f=hi?1008:756;
for(const[ty,a,fr,q]of[['square',.55,f,0],['sine',.85,f,0],['triangle',.28,f*2,0]]){const o=A.createOscillator(),g=A.createGain();o.type=ty;o.frequency.value=fr;g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(v*a,t0+.003);g.gain.exponentialRampToValueAtTime(.0004,t0+.22);o.connect(g);g.connect(A.m);o.start(t0);o.stop(t0+.24)}
const b=A.createBufferSource();b.buffer=A.nb;const fl=A.createBiquadFilter();fl.type='bandpass';fl.frequency.value=f;fl.Q.value=4;const ng=A.createGain();ng.gain.setValueAtTime(v*.18,t0);ng.gain.exponentialRampToValueAtTime(.001,t0+.08);b.connect(fl);fl.connect(ng);ng.connect(A.m);b.start(t0,Math.random(),.1)}
// ---- トンネルと山(青山港前〜吉浜) ----
{const BK=new THREE.MeshBasicMaterial({color:0x3a3733}),RK=new THREE.MeshBasicMaterial({color:0x2e2c29}),LK=new THREE.MeshBasicMaterial({color:0xffe0a0}),HM=M(0x3e5a3b),PM=M(0x9a968e);
let nSeg=0;for(const[a,b]of TUN)nSeg+=Math.floor((b-a)/10);
const wl=new THREE.InstancedMesh(new THREE.BoxGeometry(1,8.4,1),BK,nSeg*2),rf=new THREE.InstancedMesh(new THREE.BoxGeometry(12.2,1,1),RK,nSeg),lm=new THREE.InstancedMesh(new THREE.BoxGeometry(.25,.25,3),LK,nSeg*2),cl=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.15,4),LK,nSeg);
const put=(im,i,x,y,z,ang,sz)=>{dm.position.set(x,y,z);dm.rotation.set(0,ang,0);dm.scale.set(1,1,sz);dm.updateMatrix();im.setMatrixAt(i,dm.matrix)};
let n=0;for(const[a,b]of TUN){const N=Math.floor((b-a)/10);for(let k=0;k<N;k++){const zc=a+5+k*10,cx=CX(zc)+2.5,ang=Math.atan(CS(zc)),co=Math.cos(ang),si=Math.sin(ang);
for(const[j,off]of[[0,-5.6],[1,5.6]]){put(wl,n*2+j,cx+co*off,4.2,zc-si*off,ang,10.6);const lo=off<0?-4.9:4.9;put(lm,n*2+j,cx+co*lo,5.2,zc-si*lo,ang,1)}
put(rf,n,cx,8.8,zc,ang,10.6);put(cl,n,cx,8.2,zc,ang,1);n++}}
dm.rotation.set(0,0,0);dm.scale.set(1,1,1);scene.add(wl,rf,lm,cl);
const hills=[];
for(let z=3950;z<=5750;z+=90){hills.push([CX(z)-60-rnd()*60,z,30+rnd()*20,10+rnd()*16,45]);if(z>5300)hills.push([CX(z)+60+rnd()*50,z,30+rnd()*20,10+rnd()*14,45])}
const hm=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),HM,hills.length);
hills.forEach(([x,z,sx,sy,sz],i)=>{dm.position.set(x,0,z);dm.rotation.set(0,0,0);dm.scale.set(sx,sy,sz);dm.updateMatrix();hm.setMatrixAt(i,dm.matrix)});dm.scale.set(1,1,1);scene.add(hm);
const PRF=[[-34,0],[-28,3],[-20,8],[-12,13],[-5,15.5],[0,16],[5,15.5],[12,13],[20,8],[28,3],[34,0]],MP=new THREE.MeshLambertMaterial({color:0x3e5a3b,side:THREE.DoubleSide});
for(const[a,b]of TUN){const z0=a+.8,z1=b-.8,N=Math.max(2,Math.round((z1-z0)/10)),pos=[],idx=[],m=PRF.length;
for(let i=0;i<=N;i++){const zs=z0+(z1-z0)*i/N,cx=CX(zs)+2.5,ang=Math.atan(CS(zs)),co=Math.cos(ang),si=Math.sin(ang);for(const[px,py]of PRF)pos.push(cx+co*px,py,zs-si*px)}
for(let i=0;i<N;i++)for(let j=0;j<m-1;j++){const q=i*m+j;idx.push(q,q+m,q+1,q+1,q+m,q+m+1)}
const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();scene.add(new THREE.Mesh(g,MP));
const sh=new THREE.Shape();sh.moveTo(-34,0);sh.lineTo(-6.1,0);sh.lineTo(-6.1,9.4);sh.lineTo(6.1,9.4);sh.lineTo(6.1,0);sh.lineTo(34,0);for(let j=m-2;j>=0;j--)sh.lineTo(PRF[j][0],PRF[j][1]);
for(const[zp,fl]of[[z0,Math.PI],[z1,0]]){const cm=new THREE.Mesh(new THREE.ShapeGeometry(sh),MP);cm.position.set(CX(zp)+2.5,0,zp);cm.rotation.y=fl+Math.atan(CS(zp));scene.add(cm)}}   // 山の外皮と、出入口の穴をあけた両端の壁
for(const[a,b]of TUN)for(const zp of[a,b]){const cx=CX(zp)+2.5,ang=Math.atan(CS(zp)),co=Math.cos(ang),si=Math.sin(ang);
const pc=(w,h,d,x,y)=>{const m=box(w,h,d,PM,cx+co*x,y,zp-si*x);m.rotation.y=ang};pc(3.2,10,1.5,-6.7,5);pc(3.2,10,1.5,6.7,5);pc(16.6,1.8,1.5,0,9.2)}
for(const[a,b]of TUN){const m=new THREE.Mesh(new THREE.PlaneGeometry(10.2,8.3),new THREE.MeshBasicMaterial({color:SKY,fog:false}));m.rotation.y=Math.PI;m.position.set(CX(b)+2.5,4.15,b+.5);scene.add(m)}}
// 対向列車(上り線を走る)。駅に停車し、珀南の番線が空いている側へ入る
const ONC={on:false,q:0,v:20,tv:20,cd:25,dwell:0,stopQ:null,xk:2,g:new THREE.Group()};
{const add=(w,h,d,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof c==='number'?M(c):c);m.position.set(x,y,z);ONC.g.add(m)};
for(let i=0;i<4;i++){const z=-30+i*20;add(2.9,3.3,19,0xd9dde2,0,2.25,z);add(2.94,.5,19.02,0x000080,0,1.35,z);add(2.94,.95,17,0x1d2430,0,3.1,z);for(const dz of[-6.5,0,6.5])for(const sg of[-1,1])add(.05,2,1.3,0x2a2f3a,sg*1.47,2,z+dz);{const r=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.45,19,16),M(0xd9dde2));r.rotation.x=Math.PI/2;r.scale.set(1,1,.28);r.position.set(0,3.9,z);ONC.g.add(r)}}
add(2.2,1,.1,0x1d2430,0,3,-39.55);const hl=new THREE.MeshBasicMaterial({color:0xfff6d0});add(.4,.3,.1,hl,-.9,1.1,-39.6);add(.4,.3,.1,hl,.9,1.1,-39.6)}
ONC.g.position.x=TX;ONC.g.visible=false;scene.add(ONC.g);
function npcStops(){return DIR>0?WST.map(S=>S.z):WST.map(S=>Z0-S.z)}
function nextNpcStop(q){const st=npcStops().filter(p=>p<q-25);return st.length?Math.max(...st):null}
function npcX(wz){if(DIR>0){const f=arrPath[ONC.xk]||(z=>0);return CX(wz)+(wz<=450?f(wz):0)}return CX(wz)+TX}
// cab
const cab=new THREE.Group();cam.add(cab);
const CM=c=>new THREE.MeshLambertMaterial({color:c});
const cb=(w,h,d,c,x,y,z,rx=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),CM(c));m.position.set(x,y,z);m.rotation.x=rx;cab.add(m);return m};
const CREAM=0xd8d1c0,NAVY=0x2c3340,BLK=0x16171c;
cb(3.4,.5,.95,CREAM,0,-.87,-1.2);
cb(3.4,.04,.95,NAVY,0,-.6,-1.2);
cb(3.4,.035,.02,0xd8161c,0,-.575,-1.68);
cb(1.9,.3,.14,BLK,0,-.46,-1.6);
cb(.9,.34,.6,0x232a36,1.6,-.45,-1.25);
cb(.06,1.5,.06,CREAM,-1.3,.1,-1.3);cb(.06,1.5,.06,CREAM,1.3,.1,-1.3);
cb(3.4,.12,.2,0xcfc9ba,0,.84,-1.2);
cb(.5,.07,.02,0x2f6fb0,0,.55,-1.2);cb(.02,.25,.02,0x333333,-.18,.67,-1.2);cb(.02,.25,.02,0x333333,.18,.67,-1.2);
function mkMon(cw,ch,pw,ph,x,y,z){const c=document.createElement('canvas');c.width=cw*2;c.height=ch*2;const tx=new THREE.CanvasTexture(c);const m=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),new THREE.MeshBasicMaterial({map:tx}));m.position.set(x,y,z);m.rotation.x=-.35;cab.add(m);cb(pw+.06,ph+.06,.04,BLK,x,y,z-.05,-.35);const gx=c.getContext('2d');gx.scale(2,2);return{g:gx,t:tx}}
const main=mkMon(640,256,.8,.32,0,-.43,-1.1),left=mkMon(400,272,.42,.29,-.76,-.44,-1.12),right=mkMon(400,272,.42,.29,.76,-.44,-1.12);
const pilot=mkMon(880,99,.8,.09,0,-.205,-1.5);cb(.04,.1,.04,0x333640,0,-.29,-1.52);
cb(.22,.05,.22,0x33363f,.47,-.58,-1.05);
const lv=new THREE.Group();lv.position.set(.47,-.56,-1.05);cab.add(lv);
const st=new THREE.Mesh(new THREE.BoxGeometry(.06,.34,.06),CM(0x9aa0aa));st.position.y=.17;lv.add(st);
const hd=new THREE.Mesh(new THREE.BoxGeometry(.13,.08,.12),CM(0x1d1e24));hd.position.y=.36;lv.add(hd);
const clk=sec=>{const q=7*3600+30*60+Math.floor(sec);return Math.floor(q/3600)+':'+String(Math.floor(q%3600/60)).padStart(2,'0')+':'+String(q%60).padStart(2,'0')};
function drawSide(){
const T=s.t,tn=s.tn,arr=s.mode==='dwell'||s.mode==='done',d=STN[tn].z-s.z,near=d<300&&d>-5,S=STN[tn];
let g=left.g;g.fillStyle='#f4f1e8';g.fillRect(0,0,400,272);g.fillStyle='#2c3340';g.fillRect(0,0,400,40);
g.textBaseline='middle';g.textAlign='left';g.fillStyle='#fff';g.font='bold 22px sans-serif';g.fillText('時刻表',14,21);
g.fillStyle='#111';g.font='bold 18px sans-serif';g.fillText('駅',14,58);g.textAlign='right';g.fillText('着',270,58);g.fillText('発',384,58);
STN.forEach((X,i)=>{const y=62+i*24;if(i===tn){g.fillStyle='#fff3c4';g.fillRect(6,y,388,24)}
g.strokeStyle='#bbb';g.lineWidth=1;g.beginPath();g.moveTo(8,y);g.lineTo(392,y);g.stroke();
g.fillStyle='#111';g.textAlign='left';g.font='19px sans-serif';g.fillText(X.n,14,y+13);
g.textAlign='right';g.font='17px sans-serif';g.fillText(i&&!RT.free?clk(ARR[i]):'‥',270,y+13);g.fillText(i<STN.length-1&&!RT.free?clk(DEP[i]):'‥',384,y+13)});
g.textAlign='left';g.fillStyle='#555';g.font='18px sans-serif';g.fillText('現在時刻',14,198);
g.fillStyle='#111';g.font='bold 32px sans-serif';g.fillText(clk(T),110,198);
let txt,col;
if(s.mode==='dwell'){const w=s.dep-T;txt=w>1?'発車まで あと '+Math.ceil(w)+' 秒':w>0?'まもなく発車できます':'発車時刻です';col='#1b7f3b'}
else if(s.mode==='done'){txt='運転終了';col='#555'}
else if(RT.free){txt='フリードライブ';col='#555'}
else{const rem=ARR[tn]-T;if(rem<0){txt='遅れ '+Math.round(-rem)+' 秒';col='#c62828'}else{txt='定刻まであと '+Math.round(rem)+' 秒';col='#1b7f3b'}}
g.fillStyle=col;g.font='bold 26px sans-serif';g.fillText(txt,14,242);
g=right.g;g.fillStyle='#0b1a12';g.fillRect(0,0,400,272);g.fillStyle='#000080';g.fillRect(0,0,400,44);
g.fillStyle='#fff';g.textAlign='left';g.font='bold 24px sans-serif';g.fillText(RT.num+'　'+RT.type,14,23);g.textAlign='right';g.fillText(RT.dest+'　4両',388,23);
g.textAlign='left';g.fillStyle='#9fd8b4';g.font='24px sans-serif';g.fillText(arr?'ただいま':near?'まもなく':'次は',20,90);g.textAlign='right';g.font='20px sans-serif';g.fillText('珀南本線　'+trk(S)+'番線',388,90);g.textAlign='left';
g.fillStyle='#fff';g.font='bold 64px sans-serif';g.fillText(S.n,20,148);
g.fillStyle='#f2b01e';g.fillRect(20,178,120,50);g.fillStyle='#2b1a00';g.textAlign='center';g.font='bold 32px sans-serif';g.fillText(arr?'到着':'停車',80,204);
g.strokeStyle='#fff';g.lineWidth=3;g.strokeRect(300,170,76,56);g.fillStyle='#fff';g.font='bold 18px sans-serif';g.fillText('H',338,188);g.font='bold 26px sans-serif';g.fillText(S.no,338,210);
g.textAlign='left';g.fillStyle='#9fd8b4';g.font='20px sans-serif';g.fillText('Next stop: '+S.en,20,252);
left.t.needsUpdate=true;right.t.needsUpdate=true}
function drawPilot(){const g=pilot.g,W=880,H=99,now=performance.now(),bl=now%700<350;
g.fillStyle='#0b0d11';g.fillRect(0,0,W,H);
const run=s.mode==='run'||s.mode==='ready'||(s.mode==='dwell'&&s.dc&&s.dep-s.t<=2.3),isRun=s.mode==='run',over=s.v*3.6-limitAt(s.z);
const L=[['戸閉','#f4f4ea',run],['力行','#5fe08a',isRun&&s.pow>.06],['制動','#ffb454',s.mode!=='ready'&&s.brk>.08],['ATS','#ff4a3d',isRun&&(s.ats||s.aeb)],['AWS','#ffb000',isRun&&(s.aws==='ack'||(s.aws==='warn'&&bl))],['超過','#ffd23d',isRun&&!s.ats&&over>1&&bl],['電鈴','#fff08a',now<bellUntil]];
L.forEach(([n,c,on],i)=>{const x=63+i*126,y=36;
if(on){const r=g.createRadialGradient(x,y,8,x,y,46);r.addColorStop(0,c+'cc');r.addColorStop(1,c+'00');g.fillStyle=r;g.fillRect(x-48,y-36,96,96)}
g.beginPath();g.arc(x,y,20,0,7);g.fillStyle=on?c:'#2a2d34';g.fill();g.lineWidth=3;g.strokeStyle='#5b606b';g.stroke();
g.fillStyle=on?'#fff':'#8a8f99';g.font='bold 22px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(n,x,82)});
pilot.t.needsUpdate=true}
function drawMon(){
const g=main.g,W=640,H=256,kmh=s.v*3.6,lim=limitAt(s.z),over=kmh-lim,d=STN[s.tn].z-s.z,gv=Math.round(gradeAt(s.z)*1000);
g.fillStyle='#0a1520';g.fillRect(0,0,W,H);g.fillStyle='#16283a';g.fillRect(0,0,W,34);
g.textBaseline='middle';g.textAlign='left';g.fillStyle='#9fc6e8';g.font='bold 20px sans-serif';g.fillText('運転状況',14,17);
g.fillStyle='#fff';g.textAlign='right';g.font='bold 130px sans-serif';g.fillText(Math.round(kmh),300,128);
g.textAlign='left';g.font='bold 24px sans-serif';g.fillStyle='#9fc6e8';g.fillText('km/h',310,150);
g.font='bold 54px sans-serif';g.fillStyle='#ffb454';g.fillText(s.ats?'ATS':nName(s.n),24,212);
{const nx=nextLim(s.z),dn=nx?nx[0]-s.z:0;g.textAlign='left';
if(nx&&dn<1500&&nx[0]<STN[s.tn].z){const dec=nx[1]<lim;g.fillStyle='#9fc6e8';g.font='18px sans-serif';g.fillText('次の制限 ('+nx[2]+')',130,190);g.fillStyle=dec?'#ff9e80':'#9fe0b0';g.font='bold 30px sans-serif';g.fillText(nx[1]+' km/h  '+Math.round(dn)+' m',130,214)}
else{g.fillStyle='#9fc6e8';g.font='18px sans-serif';g.fillText('次の制限 なし',130,190)}}
g.strokeStyle='#2b4259';g.lineWidth=2;g.beginPath();g.moveTo(352,50);g.lineTo(352,H-50);g.stroke();
g.font='20px sans-serif';g.fillStyle='#9fc6e8';g.fillText(d>=0?'停止位置まで':'停止位置を過ぎた',372,64);
g.font='bold 54px sans-serif';g.fillStyle='#fff';g.fillText((Math.abs(d)<50?Math.abs(d).toFixed(1):Math.round(Math.abs(d)))+' m',372,112);
g.font='20px sans-serif';g.fillStyle='#9fc6e8';g.fillText('勾配',372,160);
g.font='bold 34px sans-serif';g.fillStyle=gv>0?'#ff8a80':gv<0?'#82b1ff':'#fff';g.fillText(gv>0?'上り '+gv+'‰':gv<0?'下り '+(-gv)+'‰':'水平',372,196);
g.fillStyle='#fff';g.beginPath();g.arc(572,196,38,0,7);g.fill();g.strokeStyle='#d62828';g.lineWidth=8;g.beginPath();g.arc(572,196,32,0,7);g.stroke();g.fillStyle='#111';g.textAlign='center';g.font='bold 30px sans-serif';g.fillText(lim,572,198);
if(s.mode==='run'&&(s.ats||over>1)){g.fillStyle=s.ats?'#d62828':'#e6a100';g.fillRect(0,H-32,W,32);g.fillStyle='#fff';g.font='bold 22px sans-serif';g.fillText(s.ats?'ATS 非常ブレーキ作動中':'制限速度超過',W/2,H-15)}
main.t.needsUpdate=true;drawSide();drawPilot();lv.rotation.x=s.n*.07}
// audio
let A=null,bellUntil=0;
let VOL=50;try{const v=localStorage.getItem('tsVol2');if(v!==null)VOL=+v}catch(e){}
const masterVol=()=>VOL/50*.9;   // 新50 = 旧100
let SHK=50;try{const v=localStorage.getItem('tsShk2');if(v!==null)SHK=+v}catch(e){}
const nName=n=>n>0?'P'+n:n===0?'N':n===-9?'EB':'B'+(-n);
const BR=[0,1,1.6,2.2,2.8,3,3.4,3.6,4,4.4].map(x=>x/3.6);   // 減速度 B1..B8,EB [m/s²](km/h/sを3.6で割る)
function accelOf(n,v){let a;if(n===1)a=1;else if(n<=4){const x=[0,0,30,60,75][n];a=v<=x?2.3:v>=x+30?.3:2.3+(.3-2.3)*(v-x)/30}else a=v<=75?2.3:v>=90?1:2.3+(1-2.3)*(v-75)/15;return a/3.6}   // 加速度 [m/s²]
const FM=(96/17)*4/(Math.PI*1.067)/3.6;   // モーター周波数(Hz) / 速度(km/h) ※OTOTETSU「名鉄1」: ギア96:17, 8極, 車輪径1067mm
const INV=[[0,8,440,450],[8,10,450,900],[10,35,900,900]];
function carrier(kmh){if(kmh>=35)return 5*FM*kmh;for(const[a,b,lo,hi]of INV)if(kmh<b)return lo+(hi-lo)*Math.max(0,(kmh-a)/(b-a));return 900}
const AX=[2,4.1,15.5,17.6,22,24.1,35.5,37.6];   // 運転台から各車軸までの距離(m)
function audio(){if(A)return;try{
A=new(window.AudioContext||window.webkitAudioContext)();const sr=A.sampleRate;
A.m=A.createGain();A.m.gain.value=masterVol();A.m.connect(A.destination);
const nb=A.createBuffer(1,sr*2,sr),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;A.nb=nb;
const nz=(type,freq,q)=>{const so=A.createBufferSource();so.buffer=nb;so.loop=true;const f=A.createBiquadFilter();f.type=type;f.frequency.value=freq;if(q)f.Q.value=q;const g=A.createGain();g.gain.value=0;so.connect(f);f.connect(g);g.connect(A.m);so.start(0,Math.random()*1.5);return{f,g}};
A.run=nz('lowpass',250);A.sq=nz('bandpass',3000,3);A.air=nz('highpass',2200);A.ps=nz('bandpass',600,.6);
// モーター音: インバーターのPWM波形(正弦波と三角波の比較)を直接計算する
const P=A.mp={fm:0,fc:440,np:5,sync:false,m:0,g:0,gs:0,fs:440,ph:0,pc:0,rp:0,bn:0,gp:0};
const sp=A.createScriptProcessor(2048,0,1);
sp.onaudioprocess=e=>{const o=e.outputBuffer.getChannelData(0);
for(let i=0;i<o.length;i++){P.gs+=(P.g-P.gs)*.0015;P.fs+=(P.fc-P.fs)*.004;
P.ph+=P.fm/sr;if(P.ph>=1)P.ph-=1;
let c;if(P.sync){c=(P.ph*P.np)%1}else{P.pc+=P.fs/sr;if(P.pc>=1)P.pc-=1;c=P.pc}
const tri=4*Math.abs(c-.5)-1,ref=P.m*Math.sin(6.2831853*P.ph),pw=ref>tri?1:-1;   // VVVFのPWM
P.bn+=(pw-P.bn)*.35;   // 角を丸める簡易ローパス
o[i]=P.bn*.7*P.gs}};   // これはインバーター音だけ
const hp=A.createBiquadFilter();hp.type='highpass';hp.frequency.value=250;
const lp=A.createBiquadFilter();lp.type='lowpass';lp.frequency.value=3600;
const mg=A.createGain();mg.gain.value=.09;
sp.connect(hp);hp.connect(lp);lp.connect(mg);mg.connect(A.m);
// モーター本体の音(インバーターとは別): 磁気音の唸りと歯車音
{const mlp=A.createBiquadFilter();mlp.type='lowpass';mlp.frequency.value=1500;mlp.connect(A.m);
const mk=(type,dst)=>{const o=A.createOscillator();o.type=type;o.frequency.value=60;const g=A.createGain();g.gain.value=0;o.connect(g);g.connect(dst);o.start();return{o,g}};
A.mh=mk('sawtooth',mlp);A.mw=mk('triangle',mlp)}
A.pn=0;A.pm='ready';A.jit=1;A.jt=0;A.jk=null;A.ft=0;
}catch(e){A=null}}
function beep(){if(!A)return;const o=A.createOscillator(),g=A.createGain();o.frequency.value=783.99;g.gain.value=.05;o.connect(g);g.connect(A.m);o.start();o.stop(A.currentTime+.15)}   // その他の警報音: G5
function awsTone(){if(!A)return;const t0=A.currentTime,o=A.createOscillator(),g=A.createGain();o.frequency.value=880;g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(.07,t0+.01);g.gain.setValueAtTime(.07,t0+.35);g.gain.linearRampToValueAtTime(.0001,t0+.4);o.connect(g);g.connect(A.m);o.start(t0);o.stop(t0+.42)}   // AWS: A5
function chime(){if(!A)return;const t0=A.currentTime;for(const f of[1320,1980]){const o=A.createOscillator(),g=A.createGain();o.frequency.value=f;g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(.12,t0+.01);g.gain.exponentialRampToValueAtTime(.0005,t0+1.1);o.connect(g);g.connect(A.m);o.start(t0);o.stop(t0+1.2)}}
function awsHit(m){if(SIG[m.i].a==='G'){if(s.aws==='warn')return;s.aws='clear';chime()}else{s.aws='warn';s.awsT=8;s.hb=0}}
// ランダムイベント: 前の列車が詰まっていて赤信号(手前の信号は黄)になる
function planJam(){s.jam=null;return;   // 渋滞イベントは無効化
const a=STN[s.tn-1].z+120,b=STN[s.tn].z-80,c=[];
for(let j=1;j<SIG.length;j++)if(SIG[j-1].z>a&&SIG[j].z<b&&SIG[j].z-SIG[j-1].z>=330)c.push(j);
if(!c.length)return;s.jam={j:c[Math.floor(Math.random()*c.length)],ph:0,t:0,T:45+Math.random()*30}}
function ack(){if(s.mode==='run'&&s.aws==='warn'&&!s.paused)s.aws='ack'}
// 電鈴(ジリリリ…と鳴るベル)。車掌の発車合図にだけ使う
function ring(){bellUntil=performance.now()+640;if(!A)return;const t0=A.currentTime;   // 電鈴: C4(261.6Hz)を2回、全体で約0.6秒
for(const st of[0,.34]){const env=A.createGain(),am=A.createGain(),s0=t0+st;am.gain.value=.55;
env.gain.setValueAtTime(.0001,s0);env.gain.linearRampToValueAtTime(.35,s0+.01);env.gain.setValueAtTime(.35,s0+.25);env.gain.linearRampToValueAtTime(.0001,s0+.28);
const lfo=A.createOscillator(),lg=A.createGain();lfo.frequency.value=26;lg.gain.value=.45;lfo.connect(lg);lg.connect(am.gain);lfo.start(s0);lfo.stop(s0+.3);
am.connect(env);env.connect(A.m);
for(const[f,ty,a]of[[261.63,'triangle',1],[523.25,'square',.22],[784.9,'sine',.2]]){const o=A.createOscillator(),og=A.createGain();o.type=ty;o.frequency.value=f;og.gain.value=a;o.connect(og);og.connect(am);o.start(s0);o.stop(s0+.3)}}}
// 警笛: 実測に合わせた重音(482.3Hzと496.9Hz、差14.6Hzのうなり)。各音は1〜8次倍音(3次基準で -24.6/-14.8/0/-17.7/-18.7/-33/-39/-43 dB)
// 立ち上がりは約-24dBから約0.3秒でじわっと上げて保つ。冒頭に小さな空気音。押している間鳴る
let hornN=null;
function hornOn(){audio();if(!A||hornN||s.paused)return;const t0=A.currentTime,g=A.createGain(),os=[];
g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(1,t0+.025);g.connect(A.m);
for(const f of[482.3,496.9])[-24.6,-14.8,0,-17.7,-18.7,-33,-39,-43].forEach((db,k)=>{const o=A.createOscillator(),og=A.createGain();o.frequency.value=f*(k+1);og.gain.value=.12*Math.pow(10,db/20);o.connect(og);og.connect(g);o.start(t0);os.push(o)});
puff(.2,.03,3000);hornN={g,os}}
function hornOff(){if(!hornN)return;const{g,os}=hornN,t0=A.currentTime;hornN=null;g.gain.cancelScheduledValues(t0);g.gain.setValueAtTime(Math.max(.0002,g.gain.value),t0);g.gain.linearRampToValueAtTime(.0001,t0+.25);os.forEach(o=>o.stop(t0+.3))}
// ドアの音
function puff(dur,gn,f){const t0=A.currentTime,b=A.createBufferSource();b.buffer=A.nb;const fl=A.createBiquadFilter();fl.type='bandpass';fl.frequency.value=f;fl.Q.value=.7;const g=A.createGain();g.gain.setValueAtTime(.0001,t0);g.gain.linearRampToValueAtTime(gn,t0+.05);g.gain.exponentialRampToValueAtTime(.001,t0+dur);b.connect(fl);fl.connect(g);g.connect(A.m);b.start(t0,Math.random()*1.5,dur+.1)}
function thump(delay,f0,gn){const t0=A.currentTime+delay,o=A.createOscillator(),g=A.createGain();o.type='triangle';o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(f0*.4,t0+.15);g.gain.setValueAtTime(gn,t0);g.gain.exponentialRampToValueAtTime(.001,t0+.2);o.connect(g);g.connect(A.m);o.start(t0);o.stop(t0+.25)}
function dchime(){const t0=A.currentTime;[[880,0],[660,.22]].forEach(([f,d])=>{const o=A.createOscillator(),g=A.createGain();o.frequency.value=f;g.gain.setValueAtTime(.0001,t0+d);g.gain.linearRampToValueAtTime(.1,t0+d+.01);g.gain.exponentialRampToValueAtTime(.001,t0+d+.35);o.connect(g);g.connect(A.m);o.start(t0+d);o.stop(t0+d+.4)})}
function doorOpen(){if(!A)return;dchime();puff(.9,.22,2500);thump(.15,110,.5);thump(1,100,.5)}
function doorClose(){if(!A)return;dchime();puff(.8,.2,2200);thump(.25,100,.45);thump(.9,130,.6)}
function air(gn,dur){const t=A.currentTime,g=A.air.g.gain;g.cancelScheduledValues(t);g.setValueAtTime(gn,t);g.exponentialRampToValueAtTime(.0005,t+dur)}
function clack(v,rattle){const t=A.currentTime,hits=rattle?2:1;
for(let h=0;h<hits;h++){const t1=t+h*(.028+.012*Math.random()),nv=v*(h?0.75:1);
const b=A.createBufferSource();b.buffer=A.nb;const f=A.createBiquadFilter();f.type='bandpass';f.frequency.value=(rattle?280:450)+Math.random()*(rattle?420:250);f.Q.value=rattle?1.4:.8;const g=A.createGain();g.gain.setValueAtTime((rattle?.7:.4)*nv,t1);g.gain.exponentialRampToValueAtTime(.001,t1+(rattle?.22:.15));b.connect(f);f.connect(g);g.connect(A.m);b.start(t1,Math.random()*1.5,.25);
const o=A.createOscillator(),og=A.createGain();o.type='triangle';o.frequency.setValueAtTime(rattle?90+Math.random()*50:140,t1);o.frequency.exponentialRampToValueAtTime(55,t1+.22);og.gain.setValueAtTime((rattle?1.05:.6)*nv,t1);og.gain.exponentialRampToValueAtTime(.001,t1+.28);o.connect(og);og.connect(A.m);o.start(t1);o.stop(t1+.32)}}
const FROG=[[40,250],[260,380],[3785,3895],[5670,5770]];
const inFrog=z=>FROG.some(([a,b])=>z>=a&&z<b);
function audioUpdate(dt){
const kmh=s.v*3.6,run=s.mode==='run',t=A.currentTime,P=A.mp;
{const dz=ONC.on?ONC.q-s.z:999,ad=Math.abs(dz);A.ps.g.gain.setTargetAtTime(ONC.on?.32*Math.exp(-(ad/55)*(ad/55)):0,t,.08);A.ps.f.frequency.setTargetAtTime(dz>0?750:430,t,.2)}
A.run.g.gain.setTargetAtTime(Math.min(.16,s.v/30*.16)*(1+.8*tun),t,.1);A.run.f.frequency.setTargetAtTime(200+s.v*18,t,.1);
// モーター(力行 + 電気ブレーキ)。EB・ATS中は空気ブレーキのみ
const pw=run?s.pow/.64:0,regen=run&&!s.ats&&s.n>-9?Math.min(1,s.brk/1.1)*Math.max(0,Math.min(1,(kmh-3)/8)):0;
P.g=Math.min(1,Math.max(pw,regen));P.m=Math.max(0,Math.min(1,.12+kmh/38));P.fm=FM*kmh;
if(kmh>=35){P.sync=true;P.np=5}else{P.sync=false;A.jt-=1;if(A.jt<=0){A.jit=1+(Math.random()-.5)*.012;A.jt=3}P.fc=carrier(kmh)*A.jit}
// モーター音: 速度とともに少しずつ高くなる(最大でも650Hz程度)。音量はインバーターより控えめ
{const f0=180+kmh*4.5,ld=run?Math.max(.4,Math.min(1,P.g)):.4,lv=kmh>.5?Math.min(1,.2+kmh/30):0;
A.mh.o.frequency.setTargetAtTime(f0,t,.08);A.mh.g.gain.setTargetAtTime(.035*lv*ld,t,.15);
A.mw.o.frequency.setTargetAtTime(f0*2,t,.08);A.mw.g.gain.setTargetAtTime(.02*lv*ld,t,.15)}
// ブレーキのきしみ(低速)
const sq=run&&s.brk>.25&&kmh>.5&&kmh<20?s.brk*(1-kmh/20):0;
A.sq.g.gain.setTargetAtTime(Math.min(.1,.1*sq)*(1+.5*tun),t,.08);A.sq.f.frequency.setTargetAtTime(2600+kmh*40,t,.1);
// ブレーキ弁の空気音
if(s.n!==A.pn){if(s.n<A.pn&&s.n<0)air(.1,.9);else if(s.n>A.pn&&A.pn<0)air(.16,1.8);A.pn=s.n}
if(A.pm==='run'&&(s.mode==='done'||s.mode==='dwell'))air(.22,2.4);A.pm=s.mode;
// レールのジョイント音(25mごと、各車軸が通過するたびに)。分岐器はガタゴトと大きく
const wzA=DIR>0?s.z:Z0-s.z,frog=inFrog(wzA);
if(!run||s.v<.3||!A.jk){A.jk=AX.map(o=>Math.floor((s.z-o)/25));A.ft=0}
else{AX.forEach((o,i)=>{const k=Math.floor((s.z-o)/25);if(k!==A.jk[i]){A.jk[i]=k;clack(Math.min(1,(.35+s.v/25)*(frog?2.4:1))/(1+o/15),frog)}});
if(frog){A.ft+=s.v*dt;if(A.ft>1.4+Math.random()*1.6){A.ft=0;clack(.55+Math.min(.7,s.v/18),true)}}}}
// state
let s;
function newState(mode){return{z:0,v:0,n:0,pow:0,brk:0,t:0,ats:false,pen:0,pen0:0,moved:false,mode,bt:0,tn:1,res:[],clk:false,dw:0,rg:false,rt:0,paused:false,aws:'clear',awsT:0,hb:0,aeb:false,jam:null,pl:60,gr:0,sp:false,dep:0,dc:false}}
function reset(o){o=o||{};newNum();s=newState(RT.free?'run':'dwell');s.tn=RT.free?1:0;s.t=o.t0!==undefined?o.t0:(RT.free?0:-30);s.clk=true;s.n=-6;s.z=STN[0].z;s.dep=DEP[0];closeMenu();hideToast();ONC.on=false;ONC.cd=25;ONC.g.visible=false;$('ov').className='';$('ov').style.display='none';$('warn').style.display='none'}
s=newState('ready');
const bar=$('bar');for(let k=0;k<15;k++){const i=document.createElement('i');i.className=k<9?'b':k===9?'n':'';bar.appendChild(i)}
const setN=n=>{if((s.mode==='run'||s.mode==='dwell')&&!s.paused)s.n=Math.max(-9,Math.min(5,n))};
addEventListener('keydown',e=>{if(e.repeat)return;audio();const k=e.key;
if(k==='Escape'||k==='p'||k==='P'){if(menuKind==='pause')closeMenu();else if(menuKind==='help'||menuKind==='set')showMenu(prevMenu);else openPause();e.preventDefault();return}
if(menuKind)return;
if(k==='ArrowUp'||k==='w'||k==='W'){hold(-1);e.preventDefault()}
else if(k==='ArrowDown'||k==='s'||k==='S'){hold(1);e.preventDefault()}
else if(k===' '){setN(-9);e.preventDefault()}
else if(k==='q'||k==='Q')ack();
else if(k==='h'||k==='H')hornOn();
else if(k==='r'||k==='R'){if(s.mode!=='ready')reset()}});
let ht=null,hi=null;
function stopHold(){clearTimeout(ht);clearInterval(hi);ht=hi=null}
function hold(d){stopHold();setN(s.n+d);ht=setTimeout(()=>{hi=setInterval(()=>setN(s.n+d),110)},350)}
addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown','w','W','s','S'].includes(e.key))stopHold();if(e.key==='h'||e.key==='H')hornOff()});
addEventListener('blur',()=>{stopHold();hornOff()});
for(const[id,d]of[['bUp',1],['bDn',-1]]){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();audio();hold(d)});['pointerup','pointercancel','pointerleave'].forEach(t=>b.addEventListener(t,stopHold))}
$('bAck').addEventListener('pointerdown',e=>{e.preventDefault();audio();ack()});
{const b=$('bHorn');b.addEventListener('pointerdown',e=>{e.preventDefault();hornOn()});['pointerup','pointercancel','pointerleave'].forEach(x=>b.addEventListener(x,hornOff))}
// ---- 通知(ブラックアウトなし) / フリードライブ ----
let toastT=0;
function showToast(msg,ask){const e=$('toast');e.innerHTML='<span>'+msg+'</span>'+(ask?'<button data-t="y">折り返す</button><button data-t="n">続ける</button>':'');e.classList.add('on');clearTimeout(toastT);if(!ask)toastT=setTimeout(hideToast,2800)}
function hideToast(){$('toast').classList.remove('on')}
$('toast').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset.t;hideToast();if(s)s.tt=false;if(a==='y')turnBack()});
function offerTurn(){s.tt=true;showToast('折り返しますか？',true)}
function turnBack(){const near=STN.find(x=>TURN.includes(x.n)&&Math.abs(s.z-x.z)<70);if(!near)return;const aY=near.n==='吉浜';startFree(WST.findIndex(w=>w.n===near.n),-DIR,true,{t0:s.t,pos:Z0-s.z+80,trk:aY?undefined:RT.trk,tb:aY})}
function startFree(idx,dir,turned,o){o=o||{};audio();setRoute(dir>0?'fN':'fH',o);reset(o);const S=STN.find(x=>x.n===WST[idx].n);s.z=o.pos!==undefined?o.pos:S.z;const nx=STN.findIndex(x=>x.z>s.z+1);s.tn=nx<0?STN.length-1:nx;if(turned)showToast('折り返しました(運転台を移動)',false)}
function freeStep(){while(s.tn<STN.length-1&&s.z>STN[s.tn].z+90)s.tn++;
const endP=DIR>0?6390:5940;if(s.z>endP){s.z=endP;s.v=0}   // 線路の終端(車止め)
if(s.v>1){if(s.tt){s.tt=false;hideToast()}}
else if(s.v<.03&&s.moved){s.moved=false;if(STN.some(x=>TURN.includes(x.n)&&Math.abs(s.z-x.z)<70))offerTurn()}}
// ---- メニュー ----
let menuKind=null,prevMenu='title';
const menuEl=$('menu'),mbox=$('mbox');
function startGame(k){audio();setRoute(k||RT.key);reset()}
function closeMenu(){menuKind=null;menuEl.style.display='none';if(s)s.paused=false}
function openPause(){if(s.mode==='ready'||menuKind)return;s.paused=true;stopHold();showMenu('pause')}
function toTitle(){s=newState('ready');$('ov').style.display='none';showMenu('title')}
function showMenu(k){if((k==='help'||k==='set')&&(menuKind==='title'||menuKind==='pause'))prevMenu=menuKind;
menuKind=k;menuEl.style.display='flex';let h='';
if(k==='freest')h='<h1>スタートする駅</h1><div class="ml"><button class="go" data-a="free:0:1">珀南 → 吉浜方面</button><button data-a="free:1:1">新山北 → 吉浜方面</button><button data-a="free:1:-1">新山北 → 珀南方面</button><button data-a="free:2:1">北川 → 吉浜方面</button><button data-a="free:2:-1">北川 → 珀南方面</button><button data-a="free:3:1">青山港前 → 吉浜方面</button><button data-a="free:3:-1">青山港前 → 珀南方面</button><button data-a="free:4:-1">吉浜 → 珀南方面</button><button data-a="select">戻る</button></div>';
else if(k==='select')h='<h1>運転メニュー</h1><div class="ml"><button class="go" data-a="route:ln">普通 珀南 → 吉浜</button><button data-a="route:lh">普通 吉浜 → 珀南</button><button data-a="route:en">急行 珀南・北川・吉浜</button><button data-a="route:eh">急行 吉浜・北川・珀南</button><button data-a="freesel">フリードライブ</button><button data-a="totitle">戻る</button></div>';
else if(k==='title')h='<h1>珀南鉄道 珀南本線</h1><p class="sub">珀南 → 新山北 → 北川 → 青山港前 → 吉浜</p><div class="ml"><button class="go" data-a="start">運転開始</button><button data-a="help">遊び方</button><button data-a="set">設定</button></div>';
else if(k==='pause')h='<h1>一時停止</h1><div class="ml"><button class="go" data-a="resume">再開</button><button data-a="restart">最初からやり直す</button><button data-a="help">遊び方</button><button data-a="set">設定</button><button data-a="title">タイトルへ戻る</button></div>';
else if(k==='help')h='<h1>遊び方</h1><p>各駅のホームにある黄色い停止位置標識の真横に、先頭を止めてください。</p><p>停車後は発車の少し前にドアが閉まり、閉まったあとに電鈴が鳴ります。電鈴の約1.5秒後が発車時刻で、ボタン操作は不要です。ゲームは 珀南 で発車30秒前・ドアが開いた状態から始まります。電鈴を聞いたら、力行して発車します。</p><p><kbd>↓</kbd>/<kbd>S</kbd> 力行側へ1段　<kbd>↑</kbd>/<kbd>W</kbd> ブレーキ側へ1段　<kbd>Space</kbd> 非常ブレーキ　<kbd>H</kbd> 警笛　<kbd>R</kbd> やり直し　<kbd>Esc</kbd> メニュー</p><p>制限速度を超えると警報音が鳴り、さらに超えるとATSが非常ブレーキをかけて減点されます。ブレーキは効くまで少し遅れます。信号の300m手前にAWS磁石があり、青信号(進行)ならチャイムが鳴ります。</p><p>上り坂と下り坂もあり、隣の線路を対向列車が通ります。</p><div class="ml"><button data-a="back">戻る</button></div>';
else if(k==='set')h='<h1>設定</h1><label class="set">揺れ<input type="range" id="shk" min="0" max="100" value="'+SHK+'"><span id="shkv">'+SHK+'%</span></label><label class="set">音量<input type="range" id="vol" min="0" max="100" value="'+VOL+'"><span id="volv">'+VOL+'%</span></label><div class="ml"><button data-a="back">戻る</button></div>';
mbox.innerHTML=h;const v=$('vol');if(v)v.oninput=e=>{VOL=+e.target.value;$('volv').textContent=VOL+'%';try{localStorage.setItem('tsVol2',VOL)}catch(_){}};
const sh=$('shk');if(sh)sh.oninput=e=>{SHK=+e.target.value;$('shkv').textContent=SHK+'%';try{localStorage.setItem('tsShk2',SHK)}catch(_){}};
const f=mbox.querySelector('button');if(f)f.focus()}
mbox.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;audio();const a=b.dataset.a;
if(a==='start')showMenu('select');else if(a&&a.indexOf('route:')===0)startGame(a.slice(6));else if(a==='totitle')showMenu('title');else if(a==='select')showMenu('select');else if(a==='freesel')showMenu('freest');else if(a&&a.indexOf('free:')===0){const q=a.split(':');startFree(+q[1],+q[2])}else if(a==='resume')closeMenu();else if(a==='restart')reset();else if(a==='help')showMenu('help');else if(a==='set')showMenu('set');else if(a==='back')showMenu(prevMenu);else if(a==='title')toTitle()});
$('mbtn').onclick=()=>{audio();if(menuKind==='pause')closeMenu();else openPause()};
showMenu('title');
function judge(over){const i=s.tn,S=STN[i],err=s.z-S.z,a=Math.abs(err);let g,b;
if(over){g='D';b=0}else if(a<=.5){g='S';b=100}else if(a<=1){g='A';b=90}else if(a<=3){g='B';b=75}else if(a<=10){g='C';b=50}else{g='D';b=20}
const dl=s.t-ARR[i],late=Math.max(0,Math.round(dl-5)),pen=s.pen-s.pen0,sc=Math.max(0,b-pen-late);
const dt=dl<-.5?Math.round(-dl)+'秒早着':dl<=.5?'定刻':Math.round(dl)+'秒遅れ';
return{n:S.n,g,sc,pen,late,dt,over,msg:over?'ホームの端を越えてオーバーランしました':a<.05?'ぴったり停止位置です':`停止位置から ${a.toFixed(2)} m ${err<0?'手前':'先'}で停止`}}
function finish(over){if(RT.free){s.v=0;s.mode='done';$('ov').className='';$('ov').innerHTML='<div class="box"><h1>フリードライブ終了</h1><p>'+(over?'吉浜の先まで進みました':'吉浜に停車しました')+'</p><button class="go" id="again">もう一度走る</button></div>';$('ov').style.display='flex';$('again').onclick=reset;$('again').focus();return}const r=judge(over);s.res.push(r);s.v=0;s.jam=null;
if(over||s.tn===STN.length-1){s.mode='done';
const tot=Math.round(s.res.reduce((x,y)=>x+y.sc,0)/(STN.length-1));
$('ov').className='';$('ov').innerHTML=`<div class="box"><div class="big">${r.g}</div><h1>${over?'オーバーラン':'終点に到着しました'}</h1>${s.res.map(x=>`<p><b>${x.n}</b>　${x.g}　${x.msg}／${x.dt}／ATS ${x.pen/10}回　→ ${x.sc}点</p>`).join('')}<p>合計 ${tot} 点(${STN.length-1}駅の平均${over?'・未到達は0点':''})</p><p style="margin-top:12px;font-weight:700">折り返しますか？</p><div class="ml"><button class="go" id="turnY">はい(折り返す)</button><button id="turnN">いいえ(メニューへ)</button></div></div>`;
$('ov').style.display='flex';$('turnY').onclick=()=>{const aY=DIR>0,t0=s.t,pos=Z0-s.z+80,trk=RT.trk;setRoute(OPP[RT.key],{dep:Math.ceil(t0+60),tb:aY,trk:aY?undefined:trk});reset({t0});s.z=pos};$('turnN').onclick=toTitle;$('turnY').focus()}
else{s.mode='dwell';s.ats=false;s.rg=false;s.dw=0;s.dep=Math.max(DEP[s.tn],s.t+8);s.dc=false;setTimeout(()=>{if(s.mode==='dwell'&&!s.paused)doorOpen()},900);
$('ov').className='dw';$('ov').innerHTML=`<div class="box"><h1>${r.n} に停車 — ${r.g}</h1><p>${r.msg}</p><p>${r.dt}／ATS ${r.pen/10}回　→ ${r.sc}点</p><p id="dwt" style="margin-top:8px;font-weight:700;color:var(--ok)"></p></div>`;
$('ov').style.display='flex'}}
function depart(){if(s.mode!=='dwell')return;s.tn++;s.mode='run';s.moved=false;s.pen0=s.pen;s.rg=false;s.dc=false;planJam();s.pl=limitAt(s.z);$('ov').style.display='none';$('ov').className=''}
function size(){renderer.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();cab.position.z=-Math.max(0,Math.min(1,(1.5/cam.aspect-1)*.5))}
addEventListener('resize',size);size();
let last=performance.now();
let swy=0,swv=0,swr=0,swrv=0,swq=0,swqv=0,acc=0,pv=0,pj=0,tun=0;
function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000);last=now;
if(s.paused){}
else if(s.mode==='run'||s.mode==='dwell'){
if(!s.clk&&s.mode!=='dwell'&&(s.n>0||s.v>.1))s.clk=true;   // 最初に力行した瞬間から時計が進む
if(s.clk)s.t+=dt;
if(s.mode==='dwell'){s.dw+=dt;const wt=s.dep-s.t;
if(!s.dc&&wt<=3.5){s.dc=true;doorClose()}   // 先にドアが閉まる
if(!s.rg&&wt<=1.5){s.rg=true;ring()}   // 閉まったあと、発車の1.5秒前に電鈴
if(wt<=0||(wt<=1&&s.n>0&&s.dc))depart();   // 1秒前から力行で発車可。0秒で自動発車
const e=$('dwt');if(e)e.textContent=s.rg?'ドアが閉まります':wt>0?'発車まで あと '+Math.ceil(wt)+' 秒':'まもなく発車します'}
const dw=s.mode==='dwell',kmh=s.v*3.6,lim=limitAt(s.z),over=kmh-lim;
if(!dw){if(lim<s.pl)s.gr=3;s.pl=lim;if(s.gr>0)s.gr-=dt;if(!s.ats&&over>5&&s.gr<=0){s.ats=true;s.pen+=10}   // 制限が下がった直後の3秒は猶予
if(s.ats&&kmh<lim-3)s.ats=false}
const tp=(dw||s.ats||s.aeb||s.n<=0)?0:accelOf(s.n,kmh);
const tb=dw?Math.max(.6,s.n<0?BR[-s.n]:0):(s.ats||s.aeb)?BR[9]:s.n<0?BR[-s.n]:0;
s.pow+=(tp-s.pow)*(1-Math.exp(-dt/.5));
s.brk+=(tb-s.brk)*(1-Math.exp(-dt/(tb<=s.brk?.35:(s.ats||s.aeb||s.n===-9)?.2:.3)));
if(!dw){
if(s.aws==='warn'){s.awsT-=dt;s.hb-=dt;if(s.hb<=0){awsTone();s.hb=1}if(s.awsT<=0){s.aws='ack';s.aeb=true;s.pen+=10}}   // 8秒以内に確認しないとAWS非常ブレーキ
if(s.aeb&&(s.v<.03||(!s.sp&&kmh<40))){s.aeb=false;s.sp=false}
let a=s.pow-s.brk-9.8*gradeAt(s.z)-(.012+.00012*s.v*s.v);
s.v+=a*dt;if(s.v<0)s.v=0;
const z0=s.z;s.z+=s.v*dt;if(s.v>3)s.moved=true;for(const m of MAG)if(z0<m.zm&&s.z>=m.zm)awsHit(m);
if(s.jam){const J=s.jam;if(J.ph===0&&s.z>=SIG[J.j-1].z)J.ph=1;if(J.ph===1){J.t+=dt;if(J.t>=J.T)J.ph=2}if(J.ph<2&&z0<SIG[J.j].z&&s.z>=SIG[J.j].z){s.aeb=true;s.sp=true;s.pen+=30}}   // 赤信号を越えたら非常ブレーキ
if(s.ats||over>1){s.bt-=dt;if(s.bt<=0){beep();s.bt=s.ats?.4:.6}}else s.bt=0;
if(RT.free)freeStep();else if(s.z>STN[s.tn].z+90)finish(true);
else if(s.moved&&s.v<.03){if(s.z>STN[s.tn].z-60){s.v=0;finish(false)}else s.moved=false}}
// 対向列車(駅停車・珀南の番線回避)
if(ONC.on){
if(ONC.dwell>0){ONC.dwell-=dt;ONC.v=0;if(ONC.dwell<=0){const term=ONC.stopQ!=null&&ONC.stopQ<(DIR>0?80:80);if(term||ONC.q<Math.max(s.z-140,-40)){ONC.on=false;ONC.cd=70+Math.random()*50}else{ONC.stopQ=nextNpcStop(ONC.q-8);ONC.tv=16+Math.random()*8}}}
else{let hold=false;if(DIR>0&&s.z<450&&ONC.q<520)hold=true;if(DIR<0&&s.z<(Z0-5680)&&ONC.q<(Z0-5600))hold=true;
const tgt=hold?Math.max(ONC.q,DIR>0?530:Z0-5590):(ONC.stopQ==null?ONC.q-200:ONC.stopQ);
const dist=ONC.q-tgt,need=Math.sqrt(Math.max(0,2*1.1*Math.max(.5,dist)));
ONC.tv=hold?0:16+Math.min(8,dist/40);if(dist<220)ONC.tv=Math.min(ONC.tv,need);
if(ONC.v<ONC.tv)ONC.v=Math.min(ONC.tv,ONC.v+1.1*dt);else ONC.v=Math.max(ONC.tv,ONC.v-1.2*dt);
ONC.q-=ONC.v*dt;
if(!hold&&ONC.stopQ!=null&&ONC.q<=ONC.stopQ+2&&ONC.v<1.2){ONC.q=ONC.stopQ;ONC.v=0;ONC.dwell=12+Math.random()*10}
if(ONC.q<Math.max(s.z-160,-50)){ONC.on=false;ONC.cd=70+Math.random()*50}}}
else{ONC.cd-=dt;if(ONC.cd<=0&&s.z<Z0-650&&s.z>420){ONC.on=true;ONC.q=s.z+520;ONC.v=ONC.tv=16+Math.random()*7;ONC.dwell=0;ONC.xk=(RT.trk===1)?2:1;ONC.stopQ=nextNpcStop(ONC.q)}}
const ow=DIR>0?ONC.q:Z0-ONC.q;ONC.g.visible=ONC.on;ONC.g.position.set(npcX(ow),0,ow);ONC.g.rotation.y=Math.atan(CS(ow))+(DIR>0?0:Math.PI)}
updSig();updHds();if(!s.paused)updCross(dt);
const d=STN[s.tn].z-s.z;
$('dist').textContent=Math.abs(d)<50?Math.abs(d).toFixed(1):Math.round(Math.abs(d));
$('dl').textContent=d>=0?'停止位置まで':'停止位置を過ぎた';
$('spd').textContent=Math.round(s.v*3.6);
$('lim').textContent=limitAt(s.z);
const gv=Math.round(gradeAt(s.z)*1000);$('gr').textContent=gv>0?'上り '+gv+'‰':gv<0?'下り '+(-gv)+'‰':'水平';
$('notch').textContent=s.ats?'ATS':nName(s.n);
[...bar.children].forEach((c,k)=>c.classList.toggle('on',k===s.n+9));
const w=$('warn'),ov=s.v*3.6-limitAt(s.z);
w.style.display=s.mode==='run'&&(s.ats||ov>1)?'block':'none';w.textContent=s.ats?'ATS 非常ブレーキ作動中':'制限速度超過';
if(A){A.m.gain.setTargetAtTime(s.paused||menuKind==='title'?0:masterVol(),A.currentTime,.05);if(!s.paused)audioUpdate(dt)}
const sw=s.v/25;
const k=SHK/50*80/60;   // 新50 = 旧80
if(!s.paused){const aN=dt>0?(s.v-pv)/dt:0;pv=s.v;acc+=(aN-acc)*Math.min(1,dt*3);
const kj=Math.floor(s.z/25);if(kj!==pj){pj=kj;if(s.v>1&&s.mode==='run'){const f=Math.min(1,s.v/20);swv-=.006*f*(.6+Math.random()*.8);swrv+=(Math.random()-.5)*.02*f;swqv+=(Math.random()-.5)*.02*f}}
swy+=swv*dt;swv+=(-9*swy-4*swv)*dt;swr+=swrv*dt;swrv+=(-6*swr-2.5*swrv)*dt;swq+=swqv*dt;swqv+=(-5*swq-2*swqv)*dt}
const amp=k*Math.min(1.4,sw);
const wz=DIR>0?s.z:Z0-s.z;
const rl=(Math.sin(s.z*.045)*.5+Math.sin(s.z*.11+1.7)*.35)*.008*amp+swr*k+Math.max(-.06,Math.min(.06,DIR*CK(wz)*s.v*s.v*.025));   // カント(曲線で内側に傾く)
const yw=(Math.sin(s.z*.07)*.5+Math.sin(s.z*.13+2)*.5)*.005*amp;
const lat=(Math.sin(s.z*.05)*.6+Math.sin(s.z*.12+.6)*.4)*.04*amp;
const wa=DIR>0?s.z+40:Z0-s.z-40;cam.position.set(lat+CX(wz)+PX(wz),2.7+swy*k+Math.sin(s.z*.2)*.002*amp,wz);
cam.lookAt(CX(wa)+PX(wa)+Math.sin(s.z*.05)*.2*Math.min(1.2,sw),2.5,wa);
cam.rotateZ(rl);cam.rotateX(acc*.012*k+swy*k*1.5);cam.rotateY(yw+swq*k);
cab.rotation.z=-rl*.4;cab.position.y=-swy*k*.4;
{tun+=((inTun(wz)?1:0)-tun)*Math.min(1,dt*3);hemi.intensity=1.05*(1-.72*tun);sun.intensity=.9*(1-.88*tun);disc.visible=tun<.5;
const r=.941*(1-tun)+.05*tun,g=.643*(1-tun)+.045*tun,b=.42*(1-tun)+.04*tun;scene.background.setRGB(r,g,b);scene.fog.color.setRGB(r,g,b)}   // トンネル内は暗く
drawMon();renderer.render(scene,cam)}
requestAnimationFrame(loop);
