// Reject work started under another sign-in, including a sign-out/sign-in cycle.
export function sessionGuard(auth){
 const subject=auth?.subject??null,generation=auth?.generation??0,enabled=!!auth?.enabled;
 return ()=>{if(enabled!==!!auth?.enabled||subject!==(auth?.subject??null)||generation!==(auth?.generation??0)){
  const error=Error('Your account changed. Reopen OurHouse before continuing.');error.status=409;error.code='AUTH_CHANGED';throw error;
 }};
}
// OurHouse needs its own session, never access to Google APIs on a user's behalf.
export function authStorage(storage){return {
 getItem:key=>storage.getItem(key),removeItem:key=>storage.removeItem(key),
 setItem(key,value){try{const data=JSON.parse(value);if(data&&typeof data==='object'){delete data.provider_token;delete data.provider_refresh_token;value=JSON.stringify(data);}}catch{}storage.setItem(key,value);}
};}
export async function googleAuthorization(client,origin,providerURL){
 const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:origin+'/',skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
 if(error)throw Error('Google sign-in could not start. Please try again.');
 const url=new URL(data?.url||''),provider=new URL(providerURL);
 if(url.origin!==provider.origin||url.pathname!=='/auth/v1/authorize'||url.searchParams.get('provider')!=='google'||url.searchParams.get('redirect_to')!==origin+'/'||url.searchParams.get('code_challenge_method')!=='s256'||!url.searchParams.get('code_challenge'))throw Error('Google sign-in could not start securely.');
 return url.href;
}
