import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Store } from './store.mjs';
const dir=path.resolve(process.env.DATA_DIR||'data');await mkdir(dir,{recursive:true});const store=new Store(path.join(dir,'shop.sqlite'));
try{if(store.list({admin:true}).length)throw Error('Database already has products; seed skipped to preserve changes.');const data=JSON.parse(await readFile(new URL('./seed-products.json',import.meta.url),'utf8'));for(const p of data)store.saveProduct(p);console.log('12 demonstration products added with ZERO stock. Set actual stock in /admin.html before accepting orders.')}finally{store.close()}
