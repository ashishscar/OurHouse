import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleAPI} from '../../../lib/http.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleAPI(request,env,await getChatGPTUser());}
export const POST=GET;
