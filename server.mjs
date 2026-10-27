import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Store, ApiError, fail, digest, text } from './store.mjs';

const derive=promisify(scrypt);const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
async function body(req,max=100000){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Требуется JSON');let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)fail(413,'Слишком большой запрос');chunks.push(c)}let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail(400,'Неверный JSON')}if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Требуется JSON-объект');return data}
export async function createApp({dataDir=path.resolve(process.env.DATA_DIR||'data'),password=process.env.ADMIN_PASSWORD,origin=process.env.PUBLIC_ORIGIN||'http://localhost:3000',production=process.env.NODE_ENV==='production',store:providedStore}={}){
 if(!password||password.length<16||password==='replace-with-a-unique-long-password')throw Error('Set ADMIN_PASSWORD to a unique password of at least 16 characters in .env');
 const publicUrl=new URL(origin);if(publicUrl.origin!==origin||!['http:','https:'].includes(publicUrl.protocol)||production&&publicUrl.protocol!=='https:')throw Error('PUBLIC_ORIGIN must be an exact origin; HTTPS is required in production');
 await mkdir(path.join(dataDir,'uploads'),{recursive:true});const store=providedStore||new Store(path.join(dataDir,'shop.sqlite'));store.db.prepare('DELETE FROM sessions').run();const salt=randomBytes(32);const passwordHash=await derive(password,salt,64);const limits=new Map();
 function limited(key,max,windowMs){const now=Date.now();if(limits.size>10000){for(const [k,v] of limits)if(v.until<now)limits.delete(k);if(limits.size>10000)fail(429,'Попробуйте позже')}let entry=limits.get(key);if(!entry||entry.until<now){entry={count:0,until:now+windowMs};limits.set(key,entry)}if(++entry.count>max)fail(429,'Слишком много запросов. Попробуйте позже.')}
 function session(req,required=true){const cookie=String(req.headers.cookie||'').match(/(?:^|;\s*)aman_session=([a-f0-9]{64})(?:;|$)/);const s=cookie?store.db.prepare('SELECT * FROM sessions WHERE hash=? AND expires_at>?').get(digest(cookie[1]),Date.now()):null;if(!s&&required)fail(401,'Требуется вход владельца');return s}
 const secure=production?'; Secure':'';
 const cookie=(value,maxAge)=>`aman_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
 async function handler(req,res){
  const send=(status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value))};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com https://encrypted-tbn0.gstatic.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try{
   const url=new URL(req.url,origin),p=url.pathname,method=req.method;const ip=req.socket?.remoteAddress||'local';
   if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))fail(405,'Метод не поддерживается');
   if(!['GET'].includes(method)){if(req.headers.origin!==origin)fail(403,'Недопустимый источник запроса');}
   if(p==='/api/health'&&method==='GET')return send(200,{ok:true});
   if(p==='/api/config'&&method==='GET')return send(200,{currency:'KGS',city:'Бишкек',whatsapp:'996503331717',telegram:'amantur135',onlinePayment:false,categories:(await import('./store.mjs')).categories});
   if(p==='/api/auth/login'&&method==='POST'){
    limited('login:'+ip,10,15*60000);const input=await body(req);const attempt=text(input.password,1,1024,'пароль');const hash=await derive(attempt,salt,64);if(!timingSafeEqual(hash,passwordHash))fail(401,'Неверный пароль');
    const old=session(req,false);if(old)store.db.prepare('DELETE FROM sessions WHERE hash=?').run(old.hash);store.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),csrf,Date.now()+8*3600000);return send(200,{authenticated:true,csrf},{'Set-Cookie':cookie(token,8*3600)});
   }
   if(p==='/api/auth/session'&&method==='GET'){const s=session(req,false);return send(200,{authenticated:!!s,csrf:s?.csrf||null})}
   if(p==='/api/auth/logout'&&method==='POST'){const s=session(req);if(req.headers['x-csrf-token']!==s.csrf)fail(403,'Обновите страницу');store.db.prepare('DELETE FROM sessions WHERE hash=?').run(s.hash);return send(200,{ok:true},{'Set-Cookie':cookie('',0)})}
   if(p.startsWith('/api/admin/')){const s=session(req);if(method!=='GET'&&req.headers['x-csrf-token']!==s.csrf)fail(403,'Обновите страницу');
    if(p==='/api/admin/products'&&method==='GET'){store.expire();return send(200,store.list({admin:true}))}
    if(p==='/api/admin/products'&&method==='POST')return send(201,store.saveProduct(await body(req)));
    const product=p.match(/^\/api\/admin\/products\/(\d+)$/);if(product&&method==='PUT')return send(200,store.saveProduct(await body(req),Number(product[1])));if(product&&method==='DELETE'){store.removeProduct(Number(product[1]));return send(200,{ok:true})}
    if(p==='/api/admin/uploads'&&method==='POST'){limited('upload:'+ip,60,3600000);const data=await body(req,3000000);const match=typeof data.image==='string'&&data.image.match(/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/);if(!match)fail(400,'Разрешены JPG, PNG и WebP');const bytes=Buffer.from(match[2],'base64');if(bytes.length>2000000||bytes.length<12)fail(400,'Фото должно быть до 2 МБ');const type=match[1];const valid=type==='jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):type==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid)fail(400,'Файл не соответствует формату изображения');const name=randomBytes(16).toString('hex')+'.'+(type==='jpeg'?'jpg':type);await writeFile(path.join(dataDir,'uploads',name),bytes,{flag:'wx',mode:0o600});return send(201,{url:'/uploads/'+name})}
    if(p==='/api/admin/orders'&&method==='GET')return send(200,store.orders());const order=p.match(/^\/api\/admin\/orders\/([a-f0-9]{24})$/);if(order&&method==='PATCH'){const input=await body(req);return send(200,store.setStatus(order[1],input.status))}
    fail(404,'Адрес API не найден');
   }
   if(p==='/api/products'&&method==='GET'){store.expire();return send(200,store.list({category:(url.searchParams.get('category')||'').slice(0,60),q:(url.searchParams.get('q')||'').slice(0,100),size:url.searchParams.get('size')||'',sort:url.searchParams.get('sort')||''}))}
   const prod=p.match(/^\/api\/products\/(\d+)$/);if(prod&&method==='GET'){store.expire();return send(200,store.product(Number(prod[1])))}
   if(p==='/api/orders'&&method==='POST'){limited('orders:'+ip,20,3600000);const input=await body(req);const o=store.createOrder(input,String(req.headers['idempotency-key']||''));return send(201,{...o,onlinePayment:false})}
   const order=p.match(/^\/api\/orders\/([a-f0-9]{24})$/);if(order&&method==='GET'){limited('status:'+ip,100,60000);return send(200,store.getOrder(order[1],String(req.headers['x-order-token']||'')))}
   if(p==='/api/payments/checkout'&&method==='POST')fail(503,'Онлайн-оплата пока не подключена. Согласуйте оплату с менеджером.');
   if(p.startsWith('/api/'))fail(404,'Адрес API не найден');if(method!=='GET')fail(405,'Метод не поддерживается');
   let file;if(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(p))file=path.join(dataDir,'uploads',path.basename(p));else{const name=p==='/'?'index.html':p.slice(1);if(!/^[a-zA-Z0-9_-]+\.(html|css|js)$/.test(name))fail(404,'Страница не найдена');file=path.join(root,'public',name)}
   let content;try{content=await readFile(file)}catch{fail(404,'Страница не найдена')}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
  }catch(e){if(e instanceof ApiError)return send(e.status,{error:e.message});console.error('Request failed:',e.name);send(500,{error:'Ошибка сервера. Попробуйте позже.'})}
 }
 return {handler,store,close:()=>store.close()};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp();const server=http.createServer(app.handler);server.requestTimeout=15000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('AMAN BREND: '+(process.env.PUBLIC_ORIGIN||'http://localhost:3000')));const expiry=setInterval(()=>app.store.expire(),60000);expiry.unref();const stop=()=>{clearInterval(expiry);server.close(()=>{app.close();process.exit(0)})};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
