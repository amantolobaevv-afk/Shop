import {createPool,migrate} from '../database.mjs';
const pool=createPool();try{await migrate(pool);console.log('PostgreSQL schema ready.')}catch{console.error('Migration failed. Check DATABASE_URL, TLS certificate and schema permissions.');process.exitCode=1}finally{await pool.end()}
