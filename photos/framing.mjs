// Framing is relative to the image overflow, so it survives viewport changes.
export const COVER_RATIO=8/3;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:a));
export function framing(value={}){return {zoom:clamp(Number(value?.zoom??1),1,4),x:clamp(Number(value?.x??.5),0,1),y:clamp(Number(value?.y??.5),0,1)};}
export function geometry(width,height,frameWidth,value){
 if(!(width>0&&height>0&&frameWidth>0))throw Error('Invalid photo dimensions');
 const f=framing(value),frameHeight=frameWidth/COVER_RATIO,scale=Math.max(frameWidth/width,frameHeight/height)*f.zoom;
 const w=width*scale,h=height*scale,left=-Math.max(0,w-frameWidth)*f.x,top=-Math.max(0,h-frameHeight)*f.y;
 return {width:w,height:h,left,top,scale,frameWidth,frameHeight,sx:-left/scale||0,sy:-top/scale||0,sw:frameWidth/scale,sh:frameHeight/scale};
}
export function move(width,height,frameWidth,value,dx,dy){
 const f=framing(value),g=geometry(width,height,frameWidth,f);
 return framing({...f,x:g.width>frameWidth?(g.left+dx)/(frameWidth-g.width):.5,y:g.height>g.frameHeight?(g.top+dy)/(g.frameHeight-g.height):.5});
}
export function zoomAt(width,height,frameWidth,value,zoom,anchorX=frameWidth/2,anchorY=frameWidth/COVER_RATIO/2){
 const before=geometry(width,height,frameWidth,value),next=framing({...value,zoom}),after=geometry(width,height,frameWidth,next);
 const left=anchorX-(anchorX-before.left)*after.scale/before.scale,top=anchorY-(anchorY-before.top)*after.scale/before.scale;
 return framing({...next,x:after.width>frameWidth?left/(frameWidth-after.width):.5,y:after.height>after.frameHeight?top/(after.frameHeight-after.height):.5});
}
