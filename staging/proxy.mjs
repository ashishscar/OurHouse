// Local QA access only; Wrangler connects this binding to the private worker.
export default {fetch:(request,env)=>env.STAGING.fetch(request)};
