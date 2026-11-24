// Structural validation only: deliberately does not claim pixel decode or liveness.
// Runs without native modules, Canvas, WASM, or an Images product binding.
export function jpegDimensions(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b.length<100||b.length>200000||b[0]!==255||b[1]!==216)throw Error('INVALID_JPEG');
 let i=2,width=0,height=0,scan=false,ended=false;
 while(i<b.length){
  if(b[i++]!==255)throw Error('INVALID_JPEG');
  while(b[i]===255)i++;
  const marker=b[i++];
  if(marker===217){ended=true;break;}
  if(marker===0||marker===216||marker>=208&&marker<=215)throw Error('INVALID_JPEG');
  if(i+2>b.length)throw Error('INVALID_JPEG');
  const len=b[i]*256+b[i+1];if(len<2||i+len>b.length)throw Error('INVALID_JPEG');
  if([192,193,194].includes(marker)){
   if(width||len<8||b[i+2]!==8)throw Error('INVALID_JPEG');
   height=b[i+3]*256+b[i+4];width=b[i+5]*256+b[i+6];
   if(width<240||height<320||width>1600||height>2400||width*height>2000000)throw Error('INVALID_JPEG_DIMENSIONS');
  }else if(marker>=195&&marker<=207&&![196,200,204].includes(marker))throw Error('UNSUPPORTED_JPEG');
  i+=len;
  if(marker===218){
   if(!width)throw Error('INVALID_JPEG');scan=true;
   while(i<b.length){if(b[i]!==255){i++;continue;}const next=b[i+1];if(next===0||next>=208&&next<=215){i+=2;continue;}break;}
  }
 }
 if(!scan||!ended||i!==b.length)throw Error('INVALID_JPEG');
 return {width,height};
}
