import http from 'node:http';
import { readFile } from 'node:fs/promises';
import {isIP} from 'node:net';
import {SupabaseStorage} from './storage.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Store, ApiError, fail, digest, text } from './store.mjs';

const derive=promisify(scrypt);const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
async function body(req,max=100000){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Требуется JSON');let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)fail(413,'Слишком большой запрос');chunks.push(c)}let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail(400,'Неверный JSON')}if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Требуется JSON-объект');return data}
export async function createApp({password=process.env.ADMIN_PASSWORD,origin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'http://localhost:3000',production=process.env.NODE_ENV==='production',store:providedStore,storage:providedStorage}={}){
 if(!password||password.length<16||password==='replace-with-a-unique-long-password')throw Error('Set ADMIN_PASSWORD to a unique password of at least 16 characters in .env');
 const publicUrl=new URL(origin);if(publicUrl.origin!==origin||!['http:','https:'].includes(publicUrl.protocol)||production&&publicUrl.protocol!=='https:')throw Error('PUBLIC_ORIGIN must be an exact origin; HTTPS is required in production');
 const store=providedStore||new Store();const storage=providedStorage||new SupabaseStorage();await store.health();await storage.check();
 const salt=randomBytes(32);const passwordHash=await derive(password,salt,64);const credentialTag=(await derive(password,'aman-session-generation-v1',32)).toString('hex');
 async function limited(key,max,windowMs){await store.rateLimit(key,max,windowMs)}
 async function session(req,required=true){const cookie=String(req.headers.cookie||'').match(/(?:^|;\s*)aman_session=([a-f0-9]{64})(?:;|$)/);const result=cookie?await store.session(digest(cookie[1]),credentialTag):null;if(!result&&required)fail(401,'Требуется вход владельца');return result}
 const secure=production?'; Secure':'';
 const cookie=(value,maxAge)=>`aman_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
 async function handler(req,res){
  const send=(status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value))};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com https://encrypted-tbn0.gstatic.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try{
   const url=new URL(req.url,origin),p=url.pathname,method=req.method;let ip=req.socket?.remoteAddress||'local';const hops=Number(process.env.TRUST_PROXY_HOPS||0);if(hops>0){const chain=String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim());const candidate=chain[chain.length-hops];if(candidate&&isIP(candidate))ip=candidate;}
   if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))fail(405,'Метод не поддерживается');
   if(!['GET'].includes(method)){if(req.headers.origin!==origin)fail(403,'Недопустимый источник запроса');}
   if(p==='/api/health'&&method==='GET'){await store.health();return send(200,{ok:true})}
   if(p==='/api/config'&&method==='GET')return send(200,{currency:'KGS',city:'Бишкек',whatsapp:'996503331717',telegram:'amantur135',onlinePayment:false,categories:(await import('./store.mjs')).categories});
   if(p==='/api/auth/login'&&method==='POST'){
    await limited('login:'+ip,10,15*60000);const input=await body(req);const attempt=text(input.password,1,1024,'пароль');const hash=await derive(attempt,salt,64);if(!timingSafeEqual(hash,passwordHash))fail(401,'Неверный пароль');
    const old=await session(req,false);if(old)await store.deleteSession(old.hash);const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');await store.createSession(digest(token),csrf,credentialTag);return send(200,{authenticated:true,csrf},{'Set-Cookie':cookie(token,8*3600)});
   }
   if(p==='/api/auth/session'&&method==='GET'){const s=await session(req,false);return send(200,{authenticated:!!s,csrf:s?.csrf||null})}
   if(p==='/api/auth/logout'&&method==='POST'){const s=await session(req);if(req.headers['x-csrf-token']!==s.csrf)fail(403,'Обновите страницу');await store.deleteSession(s.hash);return send(200,{ok:true},{'Set-Cookie':cookie('',0)})}
   if(p.startsWith('/api/admin/')){const s=await session(req);if(method!=='GET'&&req.headers['x-csrf-token']!==s.csrf)fail(403,'Обновите страницу');
    if(p==='/api/admin/products'&&method==='GET'){await store.expire();return send(200,await store.list({admin:true}))}
    if(p==='/api/admin/products'&&method==='POST')return send(201,await store.saveProduct(await body(req)));
    const product=p.match(/^\/api\/admin\/products\/(\d+)$/);if(product&&method==='PUT')return send(200,await store.saveProduct(await body(req),Number(product[1])));if(product&&method==='DELETE'){await store.removeProduct(Number(product[1]));return send(200,{ok:true})}
    if(p==='/api/admin/uploads'&&method==='POST'){await limited('upload:'+ip,60,3600000);const data=await body(req,3000000);const match=typeof data.image==='string'&&data.image.match(/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/);if(!match)fail(400,'Разрешены JPG, PNG и WebP');const bytes=Buffer.from(match[2],'base64');if(bytes.length>2000000||bytes.length<12)fail(400,'Фото должно быть до 2 МБ');const type=match[1];const valid=type==='jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):type==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid)fail(400,'Файл не соответствует формату изображения');const name=randomBytes(16).toString('hex')+'.'+(type==='jpeg'?'jpg':type);const url=await storage.upload(name,bytes,'image/'+type);return send(201,{url})}
    if(p==='/api/admin/orders'&&method==='GET')return send(200,await store.orders());const order=p.match(/^\/api\/admin\/orders\/([a-f0-9]{24})$/);if(order&&method==='PATCH'){const input=await body(req);return send(200,await store.setStatus(order[1],input.status))}
    fail(404,'Адрес API не найден');
   }
   if(p==='/api/products'&&method==='GET'){await store.expire();return send(200,await store.list({category:(url.searchParams.get('category')||'').slice(0,60),q:(url.searchParams.get('q')||'').slice(0,100),size:url.searchParams.get('size')||'',sort:url.searchParams.get('sort')||''}))}
   const prod=p.match(/^\/api\/products\/(\d+)$/);if(prod&&method==='GET'){await store.expire();return send(200,await store.product(Number(prod[1])))}
   if(p==='/api/orders'&&method==='POST'){await limited('orders:'+ip,20,3600000);const input=await body(req);const o=await store.createOrder(input,String(req.headers['idempotency-key']||''));return send(201,{...o,onlinePayment:false})}
   const order=p.match(/^\/api\/orders\/([a-f0-9]{24})$/);if(order&&method==='GET'){await limited('status:'+ip,100,60000);return send(200,await store.getOrder(order[1],String(req.headers['x-order-token']||'')))}
   if(p==='/api/payments/checkout'&&method==='POST')fail(503,'Онлайн-оплата пока не подключена. Согласуйте оплату с менеджером.');
   if(p.startsWith('/api/'))fail(404,'Адрес API не найден');if(method!=='GET')fail(405,'Метод не поддерживается');
   let file;if(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(p)){const bytes=await storage.download(path.basename(p));res.writeHead(200,{'Content-Type':mime[path.extname(p)],'Cache-Control':'public, max-age=3600'});return res.end(bytes)}else{const name=p==='/'?'index.html':p.slice(1);if(!/^[a-zA-Z0-9_-]+\.(html|css|js)$/.test(name))fail(404,'Страница не найдена');file=path.join(root,'public',name)}
   let content;try{content=await readFile(file)}catch{fail(404,'Страница не найдена')}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
  }catch(e){if(e instanceof ApiError)return send(e.status,{error:e.message});console.error('Request failed:',e.name);send(500,{error:'Ошибка сервера. Попробуйте позже.'})}
 }
 return {handler,store,close:()=>store.close()};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp();const server=http.createServer(app.handler);server.requestTimeout=15000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log('AMAN BREND: '+(process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'http://localhost:3000')));const expiry=setInterval(()=>app.store.expire().catch(()=>console.error('Reservation cleanup failed')),60000);expiry.unref();const stop=()=>{clearInterval(expiry);server.close(async()=>{await app.close();process.exit(0)})};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
