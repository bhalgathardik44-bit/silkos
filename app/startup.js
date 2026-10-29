(() => {
 const screen=document.getElementById('startup'),status=document.getElementById('startup-status'),retry=document.getElementById('startup-retry');
 let coreReady=false,complete=false,failed=false,removalTimer=0;
 const blockKeys=event=>{
  if(complete)return;
  event.stopImmediatePropagation();
  if(!screen.contains(event.target))event.preventDefault();
 };
 const remove=()=>{clearTimeout(removalTimer);screen.removeEventListener('transitionend',onTransition);screen.remove()};
 const onTransition=event=>{if(event.target===screen&&event.propertyName==='opacity')remove()};
 const fail=()=>{
  if(complete||failed)return;
  failed=true;screen.dataset.state='error';screen.setAttribute('aria-busy','false');status.textContent='SilkOS could not prepare your desktop. Please try again.';retry.hidden=false;retry.focus();
  window.removeEventListener('error',onError,true);document.removeEventListener('DOMContentLoaded',finish);
 };
 const onError=event=>{
  const target=event.target;
  if(target?.tagName==='SCRIPT'||(target?.tagName==='LINK'&&target.rel==='stylesheet')||(!coreReady&&target===window))fail();
 };
 const finish=()=>{
  if(!coreReady||document.readyState==='loading'||complete||failed)return;
  if(!document.querySelector('link[href="desktop.css"]').sheet){fail();return}
  complete=true;delete window.silkStartup;performance.mark('silkos-desktop-ready');screen.dataset.state='ready';screen.setAttribute('aria-busy','false');
  window.removeEventListener('keydown',blockKeys,true);window.removeEventListener('error',onError,true);document.removeEventListener('DOMContentLoaded',finish);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('lite')||document.body.classList.contains('reduce-motion'))remove();
  else {
   screen.addEventListener('transitionend',onTransition);
   screen.classList.add('startup-leaving');
   // Removal cannot depend on a transition event, which hidden windows may never dispatch.
   removalTimer=setTimeout(remove,200);
  }
 };
 retry.onclick=()=>location.reload();
 window.addEventListener('keydown',blockKeys,true);window.addEventListener('error',onError,true);document.addEventListener('DOMContentLoaded',finish);
 window.silkStartup={ready(){coreReady=true;finish()}};
})();
