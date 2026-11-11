'use strict';
(() => {
  const bridge=window.yawmiDesktop;let selected=bridge?.initialTheme||'dark';
  const toggle=document.createElement('button');toggle.id='theme-toggle';toggle.className='icon-button';toggle.type='button';
  function apply(){document.documentElement.dataset.theme=selected;toggle.textContent=selected==='dark'?'☀':'☾';toggle.title=toggle.ariaLabel=selected==='dark'?'التحويل للوضع الفاتح':'التحويل للوضع الداكن';toggle.setAttribute('aria-pressed',String(selected==='dark'));}
  apply();document.querySelector('.header-left')?.append(toggle);
  toggle.onclick=async()=>{const next=selected==='dark'?'light':'dark';try{const result=await bridge.setTheme(next);if(!result.ok)throw Error();selected=next;apply();}catch{window.dispatchEvent(new CustomEvent('yawmi:message',{detail:'تعذّر حفظ اختيار المظهر.'}));}};
})();
