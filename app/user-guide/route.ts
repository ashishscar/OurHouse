import guide from '../../lib/user-guide';

// Public instructions can be embedded only by OurHouse. No account data is read.
export function GET(request:Request) {
 return new Response(guide, {headers: {
  'Content-Type': 'text/html; charset=utf-8',
  ...(new URL(request.url).searchParams.get('download')==='1'?{'Content-Disposition':'attachment; filename="OurHouse-User-SOP-Manual.html"'}:{}),
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
 }});
}
export const HEAD=GET;
