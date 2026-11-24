import sharp from 'sharp';
import {makeTimemark,WIDTH,HEIGHT,MAX_BYTES} from '../../../cloudflare/lib/timemark-layout.mjs';
export async function renderTimemark(raw,metadata){
 // Full portrait photo under a transparent SVG. Contain retains the original field of view;
 // letterboxing is only used when camera aspect ratio differs.
 const portrait=await sharp(raw,{limitInputPixels:20000000}).rotate().resize(WIDTH,HEIGHT,{fit:'contain',background:'#28212b'}).removeAlpha().png().toBuffer();
 const canvas=await sharp(portrait).composite([{input:Buffer.from(makeTimemark(metadata)),top:0,left:0}]).png().toBuffer();
 for(const width of [800,720,640,600])for(const quality of [82,72,62,52,42]){
  const image=await sharp(canvas).resize({width,withoutEnlargement:true}).jpeg({quality,mozjpeg:true}).toBuffer();
  if(image.length<=MAX_BYTES)return image;
 }
 throw Error('TIMEMARK_IMAGE_TOO_LARGE');
}
