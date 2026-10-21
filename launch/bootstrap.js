// Start public sign-in configuration while critical scripts download in parallel.
// No session or family data is read here; failures are handled by auth startup.
(()=>{const query=new URLSearchParams(location.search);if(window.OurHouseAuth||query.get('test')==='1'||query.get('legacy')==='1')return;window.OurHouseConfigRequest=fetch('/api/config',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).catch(()=>null);})();
