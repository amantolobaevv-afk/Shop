import {readFile} from 'node:fs/promises';
import {createPool,migrate} from './database.mjs';
import {Store} from './store.mjs';
const pool=createPool();const store=new Store(pool);
try{await migrate(pool);if((await store.list({admin:true})).length)throw Error('Database already contains products; seed skipped.');const data=JSON.parse(await readFile(new URL('./seed-products.json',import.meta.url),'utf8'));for(const p of data)await store.saveProduct(p);console.log('12 demonstration products added with ZERO stock. Set actual stock in /admin.html.')}catch{console.error('Seed failed or skipped. Check connection and existing catalog; existing data is never overwritten.');process.exitCode=1}finally{await store.close()}
