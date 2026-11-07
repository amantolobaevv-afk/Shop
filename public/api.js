export const $=s=>document.querySelector(s);
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=v=>Number(v).toLocaleString('ru-RU')+' сом';
export async function api(url,{method='GET',body,csrf,key,token}={}){const headers={};if(body)headers['Content-Type']='application/json';if(csrf)headers['X-CSRF-Token']=csrf;if(key)headers['Idempotency-Key']=key;if(token)headers['X-Order-Token']=token;const response=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const data=await response.json();if(!response.ok)throw Error(data.error||'Сервер недоступен');return data}
