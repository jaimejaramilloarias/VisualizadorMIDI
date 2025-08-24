// viz/soloEspressivo.js
export function createSoloEspressivoRenderer({
  pitchToY = (p, H) => Math.round(H * 0.5 - (p - 69) * 5),
  connectMaxGapMs = 700,
  vib = { f0: 2.5, f1: 3.2, amp0: 12, amp1: 22 },
  rightMargin = 28,
} = {}) {
  const notes = [];
  const mix = (a,b,t)=>a+(b-a)*t;
  const eio = t=> t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const grad = (ctx,W)=>{ const g=ctx.createLinearGradient(0,0,W,0); g.addColorStop(0,'#f7f0dd'); g.addColorStop(.35,'#e6d5a9'); g.addColorStop(.7,'#c6b07e'); g.addColorStop(1,'#b29b6d'); return g; };
  const spiral = (cx,cy,t)=>{ const th=t*4*Math.PI, r=mix(4,24,eio(t)); return {x:cx+r*Math.cos(th), y:cy+r*Math.sin(th)}; };
  const tailRTL = (x0,y,len,s)=>({x:x0-len*s,y});
  const stroke = (ctx,a,b,s,style,wScale=1)=>{ const maxW=26,minW=2,tPow=1.8; const w=(minW+(maxW-minW)*Math.pow(1-s,tPow))*wScale; ctx.strokeStyle=style; ctx.lineWidth=w; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); };
  const dot = (ctx,x,y)=>{ ctx.beginPath(); ctx.fillStyle='#f1e6cb'; ctx.arc(x,y-18,4.2,0,Math.PI*2); ctx.fill(); };
  const rnd = i=> (Math.sin(i*1234)*43758.5453)%1;

  function drawShort(ctx,W,y){ const xR=W-rightMargin, g=grad(ctx,W); let pv=spiral(xR,y,0); for(let i=1;i<=200;i++){const s=i/200, p=spiral(xR,y,s); stroke(ctx,pv,p,s,g); pv=p;} dot(ctx,xR,y); }
  function drawLongStatic(ctx,W,y,durMs){ const xR=W-rightMargin, g=grad(ctx,W); const len=Math.max(60,Math.min(W*0.8,durMs*0.18)); let ps=spiral(xR,y,0); for(let i=1;i<=200;i++){const s=i/200, p=spiral(xR,y,s); stroke(ctx,ps,p,s,g); ps=p;} let pt=tailRTL(xR+18,y,len,0); for(let i=1;i<=360;i++){const s=i/360, p=tailRTL(xR+18,y,len,s); stroke(ctx,pt,p,s,g); pt=p;} return len; }
  function drawVibrato(ctx,W,y,len,onElapsed,onProg){ const f=vib.f0+(vib.f1-vib.f0)*eio(onProg), a=vib.amp0+(vib.amp1-vib.amp0)*eio(onProg), ph=2*Math.PI*f*onElapsed, xR=W-rightMargin; let pv={x:xR+18,y:y+a*Math.sin(ph)}; for(let i=1;i<=360;i++){const s=i/360, x=xR+18-len*s, sp=s*Math.PI, yy=y+a*Math.sin(ph+sp); stroke(ctx,pv,{x,y:yy},s,'#f1e6cb',0.9); pv={x,y:yy};} }
  function drawConnector(ctx,W,yA,yB,gapMs){ if(gapMs>connectMaxGapMs) return; const x0=W-rightMargin, opp=(yB>yA?-1:1), ratio=1-(gapMs/connectMaxGapMs); const w0=1+1.2*ratio, alpha=0.5+0.5*ratio; const c1={x:x0-45,y:yA+opp*18}, c2={x:x0-160,y:mix(yA,yB,0.6)-opp*10}; ctx.save(); ctx.strokeStyle='#d6ccb3'; ctx.globalAlpha=alpha; let pv={x:x0,y:yA}; const N=90; for(let i=1;i<=N;i++){ const t=i/N; const x=Math.pow(1-t,3)*x0 + 3*Math.pow(1-t,2)*t*c1.x + 3*(1-t)*t*t*c2.x + Math.pow(t,3)*x0; const y=Math.pow(1-t,3)*yA + 3*Math.pow(1-t,2)*t*c1.y + 3*(1-t)*t*t*c2.y + Math.pow(t,3)*yB; const wS=mix(w0,0.7,t); const jx=(rnd(i)-0.5)*0.8, jy=(rnd(i+1)-0.5)*0.8; stroke(ctx,pv,{x:x+jx,y:y+jy},t,'#d6ccb3',wS); pv={x:x+jx,y:y+jy}; } ctx.restore(); }

  return {
    noteOn({ id, pitch, startMs, durMs }){ notes.push({ id, pitch, startMs, durMs, endMs:null, isShort: durMs < 150 }); },
    noteOff({ id, endMs }){ const n=notes.find(x=>x.id===id); if(n) n.endMs=endMs; },
    render(ctx, nowMs){ const W=ctx.canvas.width, H=ctx.canvas.height; const list=[...notes].sort((a,b)=>a.startMs-b.startMs); let prev=null; for(const n of list){ n.y ??= pitchToY(n.pitch,H); if(n.isShort){ drawShort(ctx,W,n.y); } else { n.lenPx ??= drawLongStatic(ctx,W,n.y,n.durMs); const on0=n.startMs, on1=n.endMs ?? (n.startMs+n.durMs); if(nowMs>=on0 && nowMs<=on1){ const el=(nowMs-on0)/1000, pr=Math.max(0,Math.min(1,(nowMs-on0)/n.durMs)); drawVibrato(ctx,W,n.y,n.lenPx,el,pr); } } if(prev){ const g = Math.max(0,(n.startMs - (prev.endMs ?? (prev.startMs+prev.durMs)))); drawConnector(ctx,W,prev.y,n.y,g); } prev=n; } },
  };
}
