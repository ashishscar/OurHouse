import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Public binding IDs and flags only. Secrets remain on the existing Workers.
export function prepareDeployment(){
 const app=JSON.parse(readFileSync(path.join(root,'deployment/production.json'),'utf8'));
 const care=JSON.parse(readFileSync(path.join(root,'maintenance/wrangler.json'),'utf8'));
 app.main=path.resolve(root,app.main);app.assets.directory=path.resolve(root,app.assets.directory);
 care.main=path.resolve(root,'maintenance',care.main);care.account_id=app.account_id;
 mkdirSync(path.join(root,'work'),{recursive:true});
 for(const [name,config] of [['standalone',app],['care',care]])writeFileSync(path.join(root,'work/wrangler-'+name+'.json'),JSON.stringify(config,null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareDeployment();
