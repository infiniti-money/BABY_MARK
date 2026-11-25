// Progressive enhancement only. Never hide content or postpone network/capture work.
const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
const targets='.card-head h2,.stat strong,.employee-metrics strong,.overview-store>strong,.assignment-card h3,.calendar-day>strong';
let observer=null;
const seen=new WeakSet();
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
 for(const node of [...root.querySelectorAll(targets)].slice(0,80)){
  if(!seen.has(node)&&!node.closest('.employee-checkin,.camera-frame,dialog'))observer.observe(node);
 }
}
const changed=()=>{stopMotion();if(!preference.matches)observeMotion(document.querySelector('#content'));};
if(preference.addEventListener)preference.addEventListener('change',changed);
else if(preference.addListener)preference.addListener(changed);
