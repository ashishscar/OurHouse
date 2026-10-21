import shell from '../lib/shell';
import {security} from '../lib/http.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){const test=new URL(request.url).searchParams.get('test')==='1';return new Response(shell.replace('href="/manifest.webmanifest"','href="/app.webmanifest'+(test?'?test=1':'')+'"'),{headers:{...security,'Content-Type':'text/html; charset=utf-8'}});}
export const HEAD=GET;
