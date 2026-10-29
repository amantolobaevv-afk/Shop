import {createClient} from '@supabase/supabase-js';
import {fail} from './domain.mjs';
export class SupabaseStorage {
 constructor({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bucket=process.env.SUPABASE_STORAGE_BUCKET||'product-images',client}={}){
  if(!client){if(!url||!key||key.startsWith('sb_publishable_'))throw Error('Set SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY.');const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.origin!==url.replace(/\/$/,''))throw Error('SUPABASE_URL must be an HTTPS origin.');
   this.client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,options={})=>fetch(input,{...options,signal:options.signal||AbortSignal.timeout(20000)})}})
  }else this.client=client;
  if(!/^[a-z0-9-]{1,63}$/.test(bucket))throw Error('Invalid storage bucket name.');this.bucket=bucket;
 }
 async check(){const {data,error}=await this.client.storage.getBucket(this.bucket);if(error)throw Error('Storage bucket unavailable. Run npm run storage:setup or check server secrets.');if(data.public)throw Error('Storage bucket must be private.');}
 async upload(name,bytes,type){const {error}=await this.client.storage.from(this.bucket).upload(name,bytes,{contentType:type,upsert:false,cacheControl:'3600'});if(error)fail(503,'Не удалось сохранить фото. Попробуйте позже.');return '/uploads/'+name}
 async download(name){const {data,error}=await this.client.storage.from(this.bucket).download(name);if(error){if(String(error.statusCode)==='404')fail(404,'Фото не найдено');fail(503,'Хранилище фото временно недоступно')}const bytes=Buffer.from(await data.arrayBuffer());if(bytes.length>2000000)fail(413,'Фото слишком большое');return bytes}
}
