import {createPool,migrate} from '../database.mjs';
import {databaseDiagnostic,databaseContext} from './database-diagnostic.mjs';
let pool;
try{pool=createPool();await migrate(pool);console.log('PostgreSQL schema ready.')}catch(error){const diagnostic=databaseDiagnostic(error);console.error(`Migration failed [${diagnostic.kind}]. ${diagnostic.hint}`);console.error('Database configuration check: '+JSON.stringify(databaseContext()));process.exitCode=1}finally{if(pool)try{await pool.end()}catch{console.error('Database connection cleanup failed.')}}
