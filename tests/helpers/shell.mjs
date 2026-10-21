import {readFileSync} from 'node:fs';
// Domain/UI regression harnesses execute the same built core, with optional
// functions installed before its asynchronous account restoration completes.
// Separate resource-loader tests exercise actual lazy downloads and failures.
export function regressionShell(){
 let html=JSON.parse(readFileSync(new URL('../../lib/shell.ts',import.meta.url),'utf8').split('export default ')[1].trim().slice(0,-1));
 const features=JSON.parse(html.match(/id="ourhouse-feature-map">([^<]+)<\/script>/)?.[1]||'{}');
 html=html.replace(/<script[^>]*src="(\/assets\/app-core-[^"]+)"[^>]*><\/script>/,(_,file)=>'<script>'+readFileSync(new URL('../../public'+file,import.meta.url),'utf8')+'\n'+Object.values(features).map(file=>readFileSync(new URL('../../public'+file,import.meta.url),'utf8')).join('\n')+'</script>');
 // The public auth bootstrap has its own consumer tests; domain harnesses inject identity.
 html=html.replace(/<script id="ourhouse-bootstrap">[\s\S]*?<\/script>/,'');
 return html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g,'');
}
