export type ImageBounds={x:number;y:number;width:number;height:number}
/** Conservative border-background detection, not semantic object recognition. */
export function productBounds(width:number,height:number,pixels:Uint8ClampedArray):ImageBounds{
 const full={x:0,y:0,width,height}
 if(width<4||height<4||pixels.length!==width*height*4)return full
 const corners=[0,width-1,(height-1)*width,width*height-1]
 const transparent=corners.every(i=>pixels[i*4+3]<16)
 const background=[0,1,2].map(c=>corners.reduce((sum,i)=>sum+pixels[i*4+c],0)/4)
 const matches=(i:number)=>pixels[i*4+3]<16||(!transparent&&pixels[i*4+3]>240&&background.every((v,c)=>Math.abs(pixels[i*4+c]-v)<12))
 if(!transparent&&corners.some(i=>!matches(i)))return full
 // Only remove matching background connected to the outside; preserve internal details.
 const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let end=0,head=0
 const add=(i:number)=>{if(!seen[i]&&matches(i)){seen[i]=1;queue[end++]=i}}
 for(let x=0;x<width;x++){add(x);add((height-1)*width+x)}
 for(let y=0;y<height;y++){add(y*width);add(y*width+width-1)}
 while(head<end){const i=queue[head++],x=i%width,y=Math.floor(i/width);if(x)add(i-1);if(x<width-1)add(i+1);if(y)add(i-width);if(y<height-1)add(i+width)}
 let left=width,top=height,right=-1,bottom=-1,count=0
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!seen[i]&&pixels[i*4+3]>=16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++}}
 // Blank, tiny, edge-touching or almost full-frame subjects are uncertain: preserve the original.
 if(count<width*height*.005||left<2||top<2||right>width-3||bottom>height-3||end<width*height*.1)return full
 const pad=Math.max(2,Math.ceil(Math.max(right-left,bottom-top)*.025))
 left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(width-1,right+pad);bottom=Math.min(height-1,bottom+pad)
 return {x:left,y:top,width:right-left+1,height:bottom-top+1}
}
/** Expand around the retained subject and shadow using only pixels from the original photo. */
export function squareProductCrop(bounds:ImageBounds,width:number,height:number):ImageBounds{
 const full={x:0,y:0,width,height}
 if(bounds.width===width&&bounds.height===height)return full
 const required=Math.max(bounds.width,bounds.height)
 if(required>Math.min(width,height))return full
 const size=Math.min(Math.min(width,height),Math.ceil(required*1.08))
 return {x:Math.max(0,Math.min(width-size,Math.floor(bounds.x+bounds.width/2-size/2))),y:Math.max(0,Math.min(height-size,Math.floor(bounds.y+bounds.height/2-size/2))),width:size,height:size}
}
