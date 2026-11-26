// Progressive enhancement only. Never hide content or postpone network/capture work.
const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
const targets='.card-head h2,.card-head .muted,.stat strong,.employee-metrics strong,.overview-store>strong,.assignment-card h3,.assignment-card>strong,.operation-row>div>strong,.calendar-day>strong,.dashboard-attendance h2,.dashboard-shift h2,.dashboard-notices h2';
let observer=null;
const observed=new Set();
const seen=new WeakSet();
const intro=document.querySelector('#brand-intro');
// Decorative only: dismiss immediately on any interaction; never delay boot.
function dismissIntro(){if(intro)intro.hidden=true;}
window.addEventListener('pointerdown',dismissIntro,{capture:true,once:true,passive:true});
window.addEventListener('keydown',dismissIntro,{capture:true,once:true});
window.addEventListener('focusin',dismissIntro,{capture:true,once:true});
intro?.addEventListener('animationend',event=>{if(event.target===intro)dismissIntro();});
export function stopMotion(){observer?.disconnect();observer=null;observed.clear();}
export function observeMotion(root){
 if(!root||preference.matches||typeof IntersectionObserver!=='function')return;
 for(const node of observed)if(!node.isConnected){observer?.unobserve(node);observed.delete(node);}
 if(!observer)observer=new IntersectionObserver(entries=>{
  for(const {target,isIntersecting} of entries){
   if(!isIntersecting&&target.isConnected)continue;
   observer?.unobserve(target);
   observed.delete(target);
   if(!target.isConnected||preference.matches||seen.has(target))continue;
   seen.add(target);target.classList.add('motion-revealed');
  }
 },{threshold:0.15});
 // Only small text elements, no video, buttons, or layout containers.
 const nodes=[...root.querySelectorAll(targets)].filter(node=>!node.closest('.employee-checkin,.camera-frame,dialog')).slice(0,80);
 for(const [index,node] of nodes.entries()){
  if(seen.has(node)||observed.has(node))continue;
  if(!node.dataset.motionSide)node.dataset.motionSide=index%2===0?'left':'right';
  observer.observe(node);
  observed.add(node);
 }
}
const changed=()=>{stopMotion();if(preference.matches)dismissIntro();else observeMotion(document.querySelector('#content'));};
if(preference.addEventListener)preference.addEventListener('change',changed);
else if(preference.addListener)preference.addListener(changed);
