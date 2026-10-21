export function intent(dx,dy,threshold=12){if(Math.max(Math.abs(dx),Math.abs(dy))<threshold)return 'pending';return Math.abs(dx)>Math.abs(dy)*1.3?'horizontal':'vertical';}
export function commitSwipe(distance,velocity,span=400,kind='screen'){const threshold=kind==='sheet'?Math.min(140,span*.22):kind==='drawer'?span*.25:Math.max(64,Math.min(120,span*.2));return Math.abs(distance)>=threshold||Math.abs(distance)>=32&&Math.sign(distance)===Math.sign(velocity)&&Math.abs(velocity)>.55;}
export function rubber(distance,limit=40){return Math.sign(distance)*limit*(1-Math.exp(-Math.abs(distance)/(limit*4)));}
if(typeof window!=='undefined')window.OurHouseMotion={intent,commitSwipe,rubber};
