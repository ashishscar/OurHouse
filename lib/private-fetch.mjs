// Workers supports manual/follow redirects, but not redirect:'error'. Keep
// private-service credentials on the original request and reject every redirect.
export async function privateFetch(network, target, options = {}) {
 const response = await network(target, {...options, redirect: 'manual'});
 if (response.status >= 300 && response.status < 400) {
  try {await response.body?.cancel();} catch {}
  throw new TypeError('Unexpected redirect from private service');
 }
 return response;
}
