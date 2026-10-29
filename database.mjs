import pg from 'pg';
import {readFile} from 'node:fs/promises';
export function poolConfig(env=process.env){
 if(!env.DATABASE_URL)throw Error('Set DATABASE_URL to the Supabase Session pooler connection string.');
 const url=new URL(env.DATABASE_URL);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL must be a PostgreSQL connection string.');
 for(const p of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(p);
 const disable=env.DATABASE_SSL==='disable';
 if(disable&&env.NODE_ENV==='production')throw Error('TLS cannot be disabled in production.');
 return {connectionString:url.href,max:4,idleTimeoutMillis:30000,connectionTimeoutMillis:15000,statement_timeout:15000,
 ssl:disable?false:{rejectUnauthorized:true,...(env.DATABASE_CA_CERT?{ca:env.DATABASE_CA_CERT.replace(/\\n/g,'\n')}:{} )}};
}
export function createPool(env=process.env){const pool=new pg.Pool(poolConfig(env));pool.on('error',()=>console.error('Database connection error'));return pool}
export async function migrate(pool){
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(75759025)');await c.query('CREATE SCHEMA IF NOT EXISTS aman_shop');
 await c.query('CREATE TABLE IF NOT EXISTS aman_shop.schema_migrations(version INTEGER PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
 const found=await c.query('SELECT version FROM aman_shop.schema_migrations WHERE version=1');
 if(!found.rows.length){await c.query(await readFile(new URL('./migrations/001_shop.sql',import.meta.url),'utf8'));await c.query('INSERT INTO aman_shop.schema_migrations(version) VALUES(1)')}
 await c.query('REVOKE ALL ON SCHEMA aman_shop FROM PUBLIC');await c.query('REVOKE ALL ON aman_shop.schema_migrations FROM PUBLIC');await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
