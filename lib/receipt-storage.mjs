import {createClient} from '@supabase/supabase-js';
import {AppError} from './domain.mjs';
import {privateFetch} from './private-fetch.mjs';

const unavailable = () => new AppError('Encrypted receipt storage is temporarily unavailable', 503, 'STORAGE_UNAVAILABLE');
const validKey = key => typeof key === 'string' && /^sealed\/[a-f0-9]{32,64}\/[a-f0-9]{32,64}\/[a-f0-9]{32,64}$/.test(key);

// The same server-authorized encrypted receipt protocol can use a private
// Supabase bucket when an account has no R2 subscription. No public URLs or
// browser storage credentials are created.
export function receiptBucket(env, network = fetch) {
 let url;
 try {url = new URL(env.OURHOUSE_SUPABASE_URL);} catch {throw unavailable();}
 const secret = env.OURHOUSE_SUPABASE_SECRET_KEY, name = env.OURHOUSE_RECEIPT_BUCKET;
 if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.pathname !== '/' || url.username || url.password || url.port || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret || '') || !/^[a-z0-9-]{3,63}$/.test(name || '')) throw unavailable();
 const client = createClient(url.origin, secret, {
  auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  global: {fetch: (target, options) => privateFetch(network, target, {...options, signal: AbortSignal.timeout(15000)})},
 });
 const bucket = client.storage.from(name);
 function check(key) {if (!validKey(key)) throw new AppError('Invalid encrypted receipt path', 400, 'RECEIPT_PATH');}
 return {
  async get(key) {
   check(key);
   const {data, error} = await bucket.download(key);
   if (error) {if (Number(error.statusCode || error.status) === 404) return null; throw unavailable();}
   if (!data) throw unavailable();
   return data;
  },
  async put(key, text) {
   check(key);
   if (typeof text !== 'string' || new TextEncoder().encode(text).length > 1500000) throw new AppError('Encrypted receipt is too large', 413, 'CAPACITY');
   const {error} = await bucket.upload(key, text, {contentType: 'application/octet-stream', cacheControl: '0', upsert: true});
   if (error) throw unavailable();
  },
  async delete(keys) {
   const paths = Array.isArray(keys) ? keys : [keys];
   if (!paths.length) return;
   if (paths.length > 100) throw unavailable();
   paths.forEach(check);
   const {error} = await bucket.remove(paths);
   if (error) throw unavailable();
  },
 };
}

export function storageEnvironment(env) {
 if (env.BUCKET || env.OURHOUSE_RECEIPT_STORAGE !== 'supabase') return env;
 return {...env, BUCKET: receiptBucket(env)};
}
