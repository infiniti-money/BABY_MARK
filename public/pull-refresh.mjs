// One delegated mobile gesture. A pull never reloads the document or retries a write.
export function hasEditedControls(root){
 if(!root)return false;
 for(const el of root.querySelectorAll('input,select,textarea')){
  if(el.disabled||el.readOnly)continue;
  if(el.tagName==='SELECT'){
   const opts=[...el.options],defaults=opts.filter(o=>o.defaultSelected);
   if(opts.some((o,i)=>o.selected!==(defaults.length?o.defaultSelected:!el.multiple&&i===0)))return true;
  }else if(el.type==='checkbox'||el.type==='radio'){
   if(el.checked!==el.defaultChecked)return true;
  }else if(el.type==='file'){if(el.files?.length)return true;}
  else if(el.value!==el.defaultValue)return true;
 }
 return false;
}
export function installPullRefresh({canRefresh,refresh}){
 const panel=document.querySelector('#pull-refresh'),status=document.querySelector('#pull-refresh-status');
 if(!panel||!status)return;
 const compact=window.matchMedia('(max-width:900px) and (pointer:coarse)');
 let start=null,busy=false;
 const top=()=>Math.max(0,window.scrollY,document.scrollingElement?.scrollTop||0)<=1;
 const eligible=()=>compact.matches&&top()&&canRefresh();
 const caption=panel.querySelector('[data-pull-caption]');
 const show=(distance,ready)=>{panel.hidden=false;panel.dataset.state=ready?'ready':'pull';panel.style.setProperty('--pull-distance',Math.min(84,distance)+'px');caption.textContent=ready?'Thả tay để làm mới':'Kéo xuống để làm mới';};
 const hide=()=>{panel.hidden=true;delete panel.dataset.state;panel.style.removeProperty('--pull-distance');};
 const cancel=()=>{start=null;if(!busy)hide();};
 const excluded=target=>{
  if(!(target instanceof Element)||!target.closest('#app .workspace')||target.closest('button,a,input,select,textarea,label,summary,[contenteditable],dialog,.table-wrap,.chat-stream,.camera-frame,.checklist,.tabs,.subnav,.admin-pager'))return true;
  for(let node=target;node&&node!==document.body;node=node.parentElement){
   if(/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+1)return true;
  }
  return false;
 };
 document.addEventListener('touchstart',e=>{
  if(busy||e.touches.length!==1||!eligible()||excluded(e.target)){cancel();return;}
  const t=e.touches[0];start={x:t.clientX,y:t.clientY,distance:0,armed:false};
 },{passive:true});
 document.addEventListener('touchmove',e=>{
  if(!start)return;
  if(e.touches.length!==1||!eligible()){cancel();return;}
  const t=e.touches[0],dy=t.clientY-start.y,dx=Math.abs(t.clientX-start.x);
  if(dy< -5||dx>Math.max(15,dy*.8)){cancel();return;}
  if(dy<12)return;
  if(e.cancelable)e.preventDefault();
  start.distance=dy;start.armed=dy>=82;show(dy*.65,start.armed);
 },{passive:false});
 document.addEventListener('touchend',async e=>{
  if(!start)return;
  const armed=start.armed;start=null;
  if(!armed||e.touches.length||busy||!eligible()){hide();return;}
  busy=true;panel.hidden=false;panel.dataset.state='refreshing';caption.textContent='Đang làm mới…';status.textContent='Đang làm mới dữ liệu BABY MARK.';
  try{await refresh();status.textContent='Đã làm mới dữ liệu.';}catch{status.textContent='Không thể làm mới. Kiểm tra kết nối và thử lại.';}
  finally{busy=false;hide();}
 },{passive:true});
 document.addEventListener('touchcancel',cancel,{passive:true});
 window.addEventListener('pagehide',cancel);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
}
