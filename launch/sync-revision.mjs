import {digest} from '../lib/cloud-store.mjs';
// Include identity, membership, key epoch and vault revision, not just household
// data revision. A role removal or account change must never look unchanged.
export function syncRevision({user,house,vault}){
 return digest(JSON.stringify(['ourhouse-sync-v1',user.id,user.name,user.email,house?.id||null,house?.owner||null,house?.role||null,house?.epoch||null,house?.revision||0,vault?.revision||0]));
}
