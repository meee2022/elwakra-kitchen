/* Server-validated accounts. No password or synchronization key is stored here. */
'use strict';
const Auth = (() => {
  const BASE = 'https://descriptive-poodle-579.convex.cloud';
  const KEY = 'stdk_session_v1';
  let current = null;
  const read = () => {try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}};
  async function request(path, args, kind='query') {
    const response=await fetch(`${BASE}/api/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('NETWORK_ERROR');
    const out=await response.json();
    if(out.status!=='success')throw new Error(out.errorMessage||'REQUEST_FAILED');
    return out.value;
  }
  function gate(message='') {
    document.documentElement.classList.add('auth-pending');
    if(document.querySelector('#authGate'))return;
    const root=document.createElement('div');root.id='authGate';
    root.innerHTML=`<div class="auth-card"><aside class="auth-side"><div class="auth-mark">STDK</div><div class="auth-side-name">مطابخ الجنوب<br> للمأكولات الشعبية</div><div class="auth-side-en" dir="ltr">Southern Traditional Dishes Kitchens</div><div class="auth-side-tag">نقاط البيع والفواتير الإلكترونية · POS &amp; e-invoicing</div></aside><form class="auth-box"><h1>تسجيل الدخول<span dir="ltr">Sign in to your account</span></h1><label for="authUsername">اسم المستخدم<span dir="ltr">Username</span></label><input id="authUsername" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" dir="ltr" required maxlength="40"><label for="authPassword">كلمة المرور<span dir="ltr">Password</span></label><div class="auth-password"><input id="authPassword" name="password" type="password" autocomplete="current-password" dir="ltr" required maxlength="256"><button type="button" id="authShow" aria-controls="authPassword" aria-pressed="false">إظهار / Show</button></div><div class="auth-error" id="authError" role="status" aria-live="polite"></div><button type="submit" class="auth-submit">دخول · Sign in</button><p class="auth-note">يلزم الإنترنت عند الدخول · الجلسة 8 ساعات · لو نسيت كلمة المرور تواصل مع مسؤول النظام.<span dir="ltr">Internet is required to sign in · sessions last 8 hours · contact the administrator if you forget your password.</span></p></form></div>`;
    document.body.append(root);
    root.querySelector('#authError').textContent=message;
    root.querySelector('#authShow').onclick=()=>{
      const input=root.querySelector('#authPassword'),show=input.type==='password';
      input.type=show?'text':'password';root.querySelector('#authShow').textContent=show?'إخفاء / Hide':'إظهار / Show';root.querySelector('#authShow').setAttribute('aria-pressed',String(show));
    };
    root.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const button=root.querySelector('.auth-submit'),error=root.querySelector('#authError');
      button.disabled=true;button.textContent='جاري التحقق… / Checking…';error.textContent='';
      try{
        const result=await request('auth:login',{username:root.querySelector('#authUsername').value,password:root.querySelector('#authPassword').value},'action');
        if(result.error)throw new Error(result.error);
        sessionStorage.setItem(KEY,JSON.stringify(result));root.querySelector('#authPassword').value='';location.reload();
      }catch(e){error.textContent=e.message.includes('TOO_MANY_ATTEMPTS')
        ?'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى. — Too many attempts. Wait 15 minutes and try again.'
        :e.message.includes('INVALID_CREDENTIALS')
        ?'اسم المستخدم أو كلمة المرور غير صحيحة. — Wrong username or password.'
        :'تعذّر تسجيل الدخول. تحقق من الاتصال وحاول مرة أخرى. — Could not sign in. Check the connection and try again.';}
      finally{button.disabled=false;button.textContent='دخول · Sign in';}
    };
  }
  function lock(message) {
    const username=current?.username;current=null;sessionStorage.removeItem(KEY);window.dispatchEvent(new CustomEvent('auth-locked',{detail:{username}}));gate(message);
  }
  async function requireAccount(manager=false) {
    // Old dashboard keys must never restore access after account authentication is enabled.
    localStorage.removeItem('stdk_dashboard');
    const saved=read();
    if(saved?.token){
      try{
        let profile;
        try{profile=await request('authSessions:me',{token:saved.token});}
        catch(e){
          // Server unreachable (as opposed to rejecting the session): a reload during an outage must
          // not lock out a signed-in cashier. Resume on the stored, unexpired session; the server
          // still authorises every request once the connection returns.
          if(e.message.includes('AUTH_REQUIRED')||!saved.role||!(saved.expiresAt>Date.now()))throw e;
          profile={username:saved.username,role:saved.role,expiresAt:saved.expiresAt};
        }
        current={token:saved.token,...profile};
        if(manager&&current.role!=='manager'){location.replace('./');return new Promise(()=>{});}
        document.documentElement.dataset.role=current.role;
        document.documentElement.classList.remove('auth-pending');
        const header=document.querySelector('header');
        if(header){const label=document.createElement('span');label.className='auth-user';label.textContent=`${current.username} · ${current.role==='manager'?'مدير / Manager':'كاشير / Cashier'}`;header.append(label);const logout=document.createElement('button');logout.className='btn';logout.textContent='خروج / Sign out';logout.onclick=()=>Auth.logout();header.append(logout);}
        setInterval(async()=>{
          if(!current)return;
          if(Date.now()>=current.expiresAt)return lock('انتهت الجلسة. سجّل الدخول مجددًا. — Session expired. Please sign in again.');
          if(navigator.onLine){try{await request('authSessions:me',{token:current.token});}catch(e){if(e.message.includes('AUTH_REQUIRED'))lock('انتهت الجلسة. سجّل الدخول مجددًا. — Session expired. Please sign in again.');}}
        },30000);
        return current;
      }catch(e){sessionStorage.removeItem(KEY);gate('سجّل الدخول للمتابعة. يلزم اتصال بالإنترنت. — Sign in to continue. An internet connection is required.');}
    }else gate();
    return new Promise(()=>{});
  }
  addEventListener('storage',e=>{if(e.key==='stdk_logout')lock('تم تسجيل الخروج. — Signed out.');});
  return {require:requireAccount,base:BASE,profile:()=>current,isManager:()=>current?.role==='manager',active:()=>!!current&&current.expiresAt>Date.now(),
    async call(path,args={},kind='query'){
      if(!current||Date.now()>=current.expiresAt){lock('انتهت الجلسة. سجّل الدخول مجددًا. — Session expired. Please sign in again.');throw new Error('AUTH_REQUIRED');}
      try{return await request(path,{...args,token:current.token},kind);}catch(e){if(e.message.includes('AUTH_REQUIRED'))lock('انتهت الجلسة. سجّل الدخول مجددًا. — Session expired. Please sign in again.');throw e;}
    },
    async logout(){
      if(!confirm('تسجيل الخروج؟ احفظ الفاتورة الحالية أولًا إن لم تحفظها.\n\nSign out? Save the current invoice first if you have not already.'))return;
      const token=current?.token;lock('تم تسجيل الخروج. — Signed out.');localStorage.setItem('stdk_logout',String(Date.now()));
      if(token){try{await request('authSessions:logout',{token},'mutation');}catch{}}
    }
  };
})();
