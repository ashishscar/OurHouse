import {OurHouseMaintenance,runMaintenance} from './agent.mjs';
export {OurHouseMaintenance};

// No workers.dev hostname or public routes. Only OurHouse's service binding
// can reach this entry point. This Worker has no family DB, receipt store,
// account keys, identity-provider secrets or deployment credentials.
export default {
 fetch(request,env){return env.MAINTENANCE.get(env.MAINTENANCE.idFromName('ourhouse-maintenance-v1')).fetch(request);},
 scheduled(_event,env,ctx){ctx.waitUntil(runMaintenance(env));},
};
