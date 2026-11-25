// Progressive enhancement only. Never hide content or postpone network/capture work.
const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
const targets='.card-head h2,.stat strong,.employee-metrics strong,.overview-store>strong,.assignment-card h3,.calendar-day>strong';
let observer=null;
const seen=new WeakSet();
const intro=document.querySelector('#brand-intro');
// Decorative only: dismiss immediately on any interaction; never delay boot.
function dismissIntro(){if(intro)intro.hidden=true;}
window.addEventListener('pointerdown',dismissIntro,{capture:true,once:true,passive:true});
window.addEventListener('keydown',dismissIntro,{capture:true,once:true});
window.addEventListener('focusin',dismissIntro,{capture:true,once:true});
intro?.addEventListener('animationend',event=>{if(event.target===intro)dismissIntro();});
export function stopMotion(){observer?.disconnect();observer=null;}
export function observeMotion(root){
 if(!root||preference.matches||typeof IntersectionObserver!=='function')return;
 if(!observer)observer=new IntersectionObserver(entries=>{
  for(const {target,isIntersecting} of entries){
   if(!isIntersecting)continue;
   observer?.unobserve(target);
   if(!target.isConnected||preference.matches||seen.has(target))continue;
   seen.add(target);target.classList.add('motion-revealed');
  }
 },{threshold:0.15});
 // Only small text elements, no video, buttons, or layout containers.
 const nodes=[...root.querySelectorAll(targets)].filter(node=>!node.closest('.employee-checkin,.camera-frame,dialog')).slice(0,80);
 for(const [index,node] of nodes.entries()){
  if(seen.has(node))continue;
  if(!node.dataset.motionSide)node.dataset.motionSide=index%2===0?'left':'right';
  observer.observe(node);
 }
}
const changed=()=>{stopMotion();if(preference.matches)dismissIntro();else observeMotion(document.querySelector('#content'));};
if(preference.addEventListener)preference.addEventListener('change',changed);
else if(preference.addListener)preference.addListener(changed);
