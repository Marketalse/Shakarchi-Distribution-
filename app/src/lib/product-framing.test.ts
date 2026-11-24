import {describe,it,expect} from 'vitest'
import {productBounds,squareProductCrop} from './product-framing'
function fixture(alpha=255){const data=new Uint8ClampedArray(100*100*4);for(let i=0;i<10000;i++)data.set([255,255,255,alpha],i*4);return data}
function product(data:Uint8ClampedArray){for(let y=20;y<80;y++)for(let x=40;x<60;x++)data.set([40,50,60,255],(y*100+x)*4)}
describe('conservative product framing',()=>{
 it('trims plain margins and retains the complete tall product with safety padding',()=>{const data=fixture();product(data);const b=productBounds(100,100,data);expect(b.x).toBeLessThan(40);expect(b.y).toBeLessThan(20);expect(b.x+b.width).toBeGreaterThanOrEqual(60);expect(b.y+b.height).toBeGreaterThanOrEqual(80);expect(b.width).toBeLessThan(35);const crop=squareProductCrop(b,100,100);expect(crop.width).toBe(crop.height);expect(crop.x).toBeLessThanOrEqual(b.x);expect(crop.y).toBeLessThanOrEqual(b.y);expect(crop.x+crop.width).toBeGreaterThanOrEqual(b.x+b.width);expect(crop.y+crop.height).toBeGreaterThanOrEqual(b.y+b.height)})
 it('supports transparent cutouts',()=>{const data=fixture(0);product(data);expect(productBounds(100,100,data).width).toBeLessThan(35)})
 it('preserves full photos on inconsistent corners, blank background and edge-touching subjects',()=>{const full={x:0,y:0,width:100,height:100};const blank=fixture();expect(productBounds(100,100,blank)).toEqual(full);product(blank);blank.set([0,0,0,255],0);expect(productBounds(100,100,blank)).toEqual(full);const edge=fixture();for(let y=0;y<80;y++)for(let x=40;x<60;x++)edge.set([40,50,60,255],(y*100+x)*4);expect(productBounds(100,100,edge)).toEqual(full)})
 it('retains interior white label details',()=>{const data=fixture();product(data);for(let y=40;y<60;y++)for(let x=45;x<55;x++)data.set([255,255,255,255],(y*100+x)*4);const b=productBounds(100,100,data);expect(b.y).toBeLessThan(20);expect(b.y+b.height).toBeGreaterThanOrEqual(80)})
})

describe('background-preserving square crop',()=>{
 it('keeps the original when a square cannot contain the subject',()=>{expect(squareProductCrop({x:20,y:10,width:160,height:60},200,80)).toEqual({x:0,y:0,width:200,height:80})})
 it('keeps visible shadows alongside the object against a colored background',()=>{const pixels=fixture();for(let i=0;i<10000;i++)pixels.set([235,215,205,255],i*4);product(pixels);for(let y=60;y<85;y++)for(let x=60;x<80;x++)pixels.set([125,105,95,255],(y*100+x)*4);const b=productBounds(100,100,pixels);const crop=squareProductCrop(b,100,100);expect(crop.x+crop.width).toBeGreaterThanOrEqual(80);expect(crop.y+crop.height).toBeGreaterThanOrEqual(85);expect(crop.width).toBe(crop.height)})
 it('clamps a square to the source edges without losing its retained content',()=>{const b={x:2,y:10,width:55,height:30},crop=squareProductCrop(b,100,60);expect(crop.x).toBeGreaterThanOrEqual(0);expect(crop.y).toBeGreaterThanOrEqual(0);expect(crop.y+crop.height).toBeLessThanOrEqual(60);expect(crop.x+crop.width).toBeGreaterThanOrEqual(57)})
})
