// Whitelisted diagnostics only: never log raw errors, URLs, usernames or passwords.
const messages={
 DB_AUTH:'Database authentication failed. Re-copy the Session pooler URL and use the database password, not the Supabase API key. URL-encode special characters in the password.',
 DB_POOLER_USER:'Supabase pooler did not recognize the tenant/user. Copy Connect > Session pooler (port 5432); keep the exact postgres.PROJECT_REF username.',
 DB_TLS:'Database TLS certificate verification failed. Add the Supabase CA certificate as DATABASE_CA_CERT in Render. Do not disable certificate verification.',
 DB_DNS:'Database hostname could not be resolved. Re-copy the hostname from Supabase Connect > Session pooler.',
 DB_NETWORK:'Database connection could not be established. Use the Session pooler on port 5432; check the project is running and database network restrictions allow Render.',
 DB_TIMEOUT:'Database connection or migration timed out. Check the Supabase project is active, the pooler URL and network restrictions.',
 DB_PERMISSIONS:'Database role lacks schema/migration permissions. Use the schema-owner database role from Supabase Session pooler; an API key is not a database login.',
 DB_NAME:'Database name does not exist. Use the exact database name from the copied connection string (normally postgres).',
 DB_CONFIG:'Database configuration is missing or invalid. Set DATABASE_URL in Render Environment to a PostgreSQL Session pooler URL; use verified TLS in production.',
 DB_UNKNOWN:'Migration failed with an unclassified database error. No credentials were logged. Check the Supabase database logs for the same time.'
};
export function databaseDiagnostic(error){
 const all=[],seen=new Set();function collect(e,depth=0){if(!e||depth>3||seen.has(e))return;seen.add(e);all.push(e);if(e.cause)collect(e.cause,depth+1);if(Array.isArray(e.errors))for(const child of e.errors.slice(0,5))collect(child,depth+1)}collect(error);
 const codes=all.map(e=>e.code);const message=all.map(e=>typeof e.message==='string'?e.message:'').join(' ');
 let kind='DB_UNKNOWN';
 if(/tenant or user not found/i.test(message))kind='DB_POOLER_USER';
 else if(codes.some(c=>['28P01','28000'].includes(c)))kind='DB_AUTH';
 else if(codes.some(c=>['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'].includes(c)))kind='DB_TLS';
 else if(codes.some(c=>['ENOTFOUND','EAI_AGAIN'].includes(c)))kind='DB_DNS';
 else if(codes.some(c=>['ETIMEDOUT','57014','55P03'].includes(c))||/connection timeout|connection timed out|timeout exceeded/i.test(message))kind='DB_TIMEOUT';
 else if(codes.some(c=>['ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH'].includes(c)))kind='DB_NETWORK';
 else if(codes.includes('42501'))kind='DB_PERMISSIONS';
 else if(codes.includes('3D000'))kind='DB_NAME';
 else if(codes.includes('ERR_INVALID_URL')||/DATABASE_URL|TLS cannot be disabled/i.test(message))kind='DB_CONFIG';
 return {kind,hint:messages[kind]};
}
export function databaseContext(env=process.env){
 const result={urlConfigured:!!env.DATABASE_URL};if(!env.DATABASE_URL)return result;
 try{const u=new URL(env.DATABASE_URL);result.connection=u.hostname.includes('.pooler.supabase.')?'pooler':u.hostname.startsWith('db.')?'direct':'other';result.port=u.port||'5432';if(!/^\d{1,5}$/.test(result.port))result.port='invalid';result.placeholderDetected=/YOUR[-_ ]?PASSWORD|PROJECT[_-]?REF|URL_ENCODED_PASSWORD|POOLER_HOST/i.test(decodeURIComponent(u.href));result.caConfigured=!!env.DATABASE_CA_CERT;}catch{result.urlValid=false}
 return result;
}
