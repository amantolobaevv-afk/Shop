// Whitelisted diagnostics only: never log raw errors, URLs, usernames or passwords.
const messages={
 DB_AUTH:'Database authentication failed. Re-copy the Session pooler URL and use the database password, not the Supabase API key. URL-encode special characters in the password.',
 DB_POOLER_USER:'Supabase pooler did not recognize the tenant/user. Copy Connect > Session pooler (port 5432); keep the exact postgres.PROJECT_REF username.',
 DB_TLS:'Database TLS certificate verification failed. Add the Supabase CA certificate as DATABASE_CA_CERT in Render. Do not disable certificate verification.',
 DB_CERT_FORMAT:'DATABASE_CA_CERT is not a valid PEM certificate. Paste the entire downloaded Supabase CA certificate, including BEGIN/END lines, with no surrounding quotes.',
 DB_AUTH_EXCHANGE:'Pooler authentication exchange failed. Verify the exact Session pooler username and URL-encoded database password. If the password was just rotated, allow the pooler to refresh before retrying.',
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
 else if(codes.some(c=>['ERR_OSSL_PEM_NO_START_LINE','ERR_OSSL_PEM_BAD_BASE64_DECODE','ERR_OSSL_ASN1_WRONG_TAG','ERR_OSSL_ASN1_TOO_LONG'].includes(c)))kind='DB_CERT_FORMAT';
 else if(/server signature is missing|SASL.*SCRAM|SCRAM.*authentication/i.test(message))kind='DB_AUTH_EXCHANGE';
 else if(codes.some(c=>['ENOTFOUND','EAI_AGAIN'].includes(c)))kind='DB_DNS';
 else if(codes.some(c=>['ETIMEDOUT','57014','55P03'].includes(c))||/connection timeout|connection timed out|timeout exceeded/i.test(message))kind='DB_TIMEOUT';
 else if(codes.some(c=>['ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH'].includes(c)))kind='DB_NETWORK';
 else if(codes.includes('42501'))kind='DB_PERMISSIONS';
 else if(codes.includes('3D000'))kind='DB_NAME';
 else if(codes.includes('ERR_INVALID_URL')||/DATABASE_URL|TLS cannot be disabled/i.test(message))kind='DB_CONFIG';
 const nodeCodes=new Set(['ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','ERR_INVALID_URL','ERR_OSSL_PEM_NO_START_LINE','ERR_OSSL_PEM_BAD_BASE64_DECODE','ERR_OSSL_ASN1_WRONG_TAG','ERR_OSSL_ASN1_TOO_LONG']);
 const code=codes.find(c=>typeof c==='string'&&(nodeCodes.has(c)||/^(?:[0-9]{2}[A-Z0-9]{3}|XX[0-9]{3}|P[0-9]{4})$/.test(c)))||'UNAVAILABLE';
 const steps=new Set(['connect','begin','migration_lock','create_schema','migration_table','read_version','read_migration_file','apply_schema','record_version','schema_permissions','migration_permissions','commit']);
 const step=all.map(e=>e.migrationStep).find(s=>steps.has(s))||(kind==='DB_CONFIG'?'configuration':'unknown');
 return {kind,hint:messages[kind],code,step};
}
export function databaseContext(env=process.env){
 const result={urlConfigured:!!env.DATABASE_URL};if(!env.DATABASE_URL)return result;
 try{const u=new URL(env.DATABASE_URL);result.connection=u.hostname.includes('.pooler.supabase.')?'pooler':u.hostname.startsWith('db.')?'direct':'other';result.port=u.port||'5432';if(!/^\d{1,5}$/.test(result.port))result.port='invalid';result.placeholderDetected=/YOUR[-_ ]?PASSWORD|PROJECT[_-]?REF|URL_ENCODED_PASSWORD|POOLER_HOST/i.test(decodeURIComponent(u.href));result.caConfigured=!!env.DATABASE_CA_CERT;}catch{result.urlValid=false}
 return result;
}

// Only used for a failed connect(), before any customer SQL can run.
// Fail closed if the configured URL cannot be parsed. Redact configured secrets
// (including decoded/encoded credentials) before truncating or emitting text.
export function safeConnectionReason(error,env=process.env){
 let url;try{url=new URL(env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol))return 'Connection details withheld: invalid database URL.'}catch{return 'Connection details withheld: invalid database URL.'}
 const secrets=new Set();const add=value=>{if(typeof value!=='string'||!value)return;secrets.add(value);try{secrets.add(decodeURIComponent(value))}catch{}try{secrets.add(encodeURIComponent(value))}catch{}};
 for(const [key,value] of Object.entries(env))if(/PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL|DATABASE_CA_CERT|SUPABASE_URL/i.test(key))add(value);
 for(const value of [url.username,url.password,url.hostname,url.pathname])add(value);
 const list=[],seen=new Set();function visit(e,depth=0){if(!e||depth>4||seen.has(e))return;seen.add(e);if(typeof e.message==='string')list.push(e);if(e.cause)visit(e.cause,depth+1);if(Array.isArray(e.errors))for(const c of e.errors.slice(0,4))visit(c,depth+1)}visit(error);
 const source=list.find(e=>e.code==='XX000')||list.at(-1);if(!source)return 'No connection error message was provided.';
 let reason=source.message;
 for(const value of [...secrets].sort((a,b)=>b.length-a.length))reason=reason.split(value).join('[REDACTED]');
 reason=reason.replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi,'[URL REDACTED]')
 .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g,'[CERTIFICATE REDACTED]')
 .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[TOKEN REDACTED]')
 .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,'[KEY REDACTED]')
 .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'[QUOTED VALUE REDACTED]')
 .replace(/[\x00-\x1f\x7f]/g,' ').trim();
 return reason.slice(0,600)||'No connection error message was provided.';
}
