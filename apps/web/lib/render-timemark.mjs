import sharp from 'sharp';
import {makeTimemark,WIDTH,HEIGHT,PHOTO_HEIGHT,MAX_BYTES} from '../../../cloudflare/lib/timemark-layout.mjs';
export async function renderTimemark(raw,metadata){
 const portrait=await sharp(raw,{limitInputPixels:20000000}).rotate().resize(WIDTH,PHOTO_HEIGHT,{fit:'contain',background:'#28212b'}).jpeg({quality:85}).toBuffer();
 const canvas=await sharp({create:{width:WIDTH,height:HEIGHT,channels:3,background:'#34212b'}}).composite([{input:portrait,top:0,left:0},{input:Buffer.from(makeTimemark(metadata)),top:0,left:0}]).png().toBuffer();
 // Re-encode from original composed pixels on each attempt, not from previous JPEG.
 for(const width of [800,720,640,600])for(const quality of [82,72,62,52,42]){
  const image=await sharp(canvas).resize({width,withoutEnlargement:true}).jpeg({quality,mozjpeg:true}).toBuffer();
  if(image.length<=MAX_BYTES)return image;
 }
 throw Error('TIMEMARK_IMAGE_TOO_LARGE');
}
