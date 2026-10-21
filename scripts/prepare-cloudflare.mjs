import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i < 0 ? '' : args[i + 1] || ''; }
const account = option('--account-id'), database = option('--database-id'), bucket = option('--bucket');
const storage = option('--receipt-storage') || 'r2';
if (!/^[a-f0-9]{32}$/.test(account) || !/^[a-f0-9-]{36}$/.test(database) || database === '00000000-0000-4000-8000-000000000000' || !['r2','supabase'].includes(storage) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
 throw Error('Supply the actual Cloudflare --account-id, --database-id, --receipt-storage and private --bucket. No placeholder deployment is allowed.');
}
// These files contain deployment metadata only. Never accept credentials here.
const built = JSON.parse(readFileSync(resolve(root, 'dist/server/wrangler.json'), 'utf8'));
const config = {
 name: 'ourhouse', account_id: account, main: resolve(root, 'standalone/entry.mjs'),
 compatibility_date: built.compatibility_date, compatibility_flags: ['nodejs_compat'],
 workers_dev: true, preview_urls: false, minify: true,
 assets: {directory: resolve(root, 'dist/client'), binding: 'ASSETS'},
 d1_databases: [{binding: 'DB', database_name: 'ourhouse', database_id: database}],
 ...(storage === 'r2' ? {r2_buckets: [{binding: 'BUCKET', bucket_name: bucket}]} : {}),
 triggers: {crons: ['*/5 * * * *']},
 observability: {enabled: false},
 vars: {OURHOUSE_STANDALONE: 'enabled', OURHOUSE_ACCOUNT_SIGNIN: 'managed', OURHOUSE_PUBLIC_SIGNUP: 'disabled', OURHOUSE_GOOGLE_SIGNIN: 'disabled', OURHOUSE_EMAIL_SIGNIN: 'disabled', ...(storage === 'supabase' ? {OURHOUSE_RECEIPT_STORAGE: 'supabase', OURHOUSE_RECEIPT_BUCKET: bucket} : {})},
};
mkdirSync(resolve(root, 'work'), {recursive: true});
const path = resolve(root, 'work/wrangler-standalone.json');
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log('Prepared standalone Worker configuration at ' + path);
