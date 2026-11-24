import {describe,it,expect} from 'vitest'
import {productBounds,fitProduct} from './product-framing'
function fixture(alpha=255){const data=new Uint8ClampedArray(100*100*4);for(let i=0;i<10000;i++)data.set([255,255,255,alpha],i*4);return data}
function product(data:Uint8ClampedArray){for(let y=20;y<80;y++)for(let x=40;x<60;x++)data.set([40,50,60,255],(y*100+x)*4)}
describe('conservative product framing',()=>{
 it('trims plain margins and retains the complete tall product with safety padding',()=>{const data=fixture();product(data);const b=productBounds(100,100,data);expect(b.x).toBeLessThan(40);expect(b.y).toBeLessThan(20);expect(b.x+b.width).toBeGreaterThanOrEqual(60);expect(b.y+b.height).toBeGreaterThanOrEqual(80);expect(b.width).toBeLessThan(35);const fit=fitProduct(b);expect(fit.height).toBeCloseTo(691.2);expect(fit.x).toBeGreaterThan(0);expect(fit.y).toBeGreaterThan(0)})
 it('supports transparent cutouts',()=>{const data=fixture(0);product(data);expect(productBounds(100,100,data).width).toBeLessThan(35)})
 it('preserves full photos on inconsistent corners, blank background and edge-touching subjects',()=>{const full={x:0,y:0,width:100,height:100};const blank=fixture();expect(productBounds(100,100,blank)).toEqual(full);product(blank);blank.set([0,0,0,255],0);expect(productBounds(100,100,blank)).toEqual(full);const edge=fixture();for(let y=0;y<80;y++)for(let x=40;x<60;x++)edge.set([40,50,60,255],(y*100+x)*4);expect(productBounds(100,100,edge)).toEqual(full)})
 it('retains interior white label details',()=>{const data=fixture();product(data);for(let y=40;y<60;y++)for(let x=45;x<55;x++)data.set([255,255,255,255],(y*100+x)*4);const b=productBounds(100,100,data);expect(b.y).toBeLessThan(20);expect(b.y+b.height).toBeGreaterThanOrEqual(80)})
})
