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
 let c,step='connect';
 try{c=await pool.connect();
 const run=async(label,sql)=>{step=label;return c.query(sql)};
 await run('begin','BEGIN');
 await run('migration_lock','SELECT pg_advisory_xact_lock(75759025)');
 await run('create_schema','CREATE SCHEMA IF NOT EXISTS aman_shop');
 await run('migration_table','CREATE TABLE IF NOT EXISTS aman_shop.schema_migrations(version INTEGER PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
 const found=await run('read_version','SELECT version FROM aman_shop.schema_migrations WHERE version=1');
 if(!found.rows.length){step='read_migration_file';const sql=await readFile(new URL('./migrations/001_shop.sql',import.meta.url),'utf8');await run('apply_schema',sql);await run('record_version','INSERT INTO aman_shop.schema_migrations(version) VALUES(1)')}
 await run('schema_permissions','REVOKE ALL ON SCHEMA aman_shop FROM PUBLIC');
 await run('migration_permissions','REVOKE ALL ON aman_shop.schema_migrations FROM PUBLIC');
 await run('commit','COMMIT');
 }catch(cause){if(c)try{await c.query('ROLLBACK')}catch{}const error=new Error('Database migration step failed',{cause});error.migrationStep=step;throw error}finally{if(c)c.release()}
}
