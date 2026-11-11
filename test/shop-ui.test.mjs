import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {esc} from '../public/api.js';
const source=(await readFile(new URL('../public/shop.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
async function setup(){
 const listeners={};const node=()=>({value:'',innerHTML:'',textContent:'',disabled:true,hidden:false});
 const nodes=Object.fromEntries(['cart','count','cartItems','total','checkout','closeCart','continue','order'].map(id=>['#'+id,node()]));
 nodes['#cart'].showModal=function(){this.open=true};nodes['#cart'].close=function(){this.open=false};
 const buttons=[node(),node()];buttons.forEach(b=>{b.dataset={};b.classList={toggle(){}};b.setAttribute=()=>{}});for(const kind of ['color','size','choice-hint'])nodes[`[data-${kind}="1"]`]=node();
 const context=vm.createContext({document:{querySelector:s=>nodes[s]||null,querySelectorAll:()=>buttons,addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn)},$:s=>nodes[s]||null,esc,money:n=>n+' som',localStorage:{getItem:()=>null,setItem(){}},location:{hash:''},setTimeout,clearTimeout,URLSearchParams});
 await vm.runInContext(`(async()=>{${source}\n globalThis.ui={choices,syncChoice,addProduct,setProducts:p=>products=p,getCart:()=>cart};})()`,context);
 return {ui:context.ui,nodes,buttons,click:target=>listeners.click.forEach(fn=>fn({target}))};
}
const product={id:1,name:'Shirt',price:100,demo:false,variants:[{id:11,color:'Black',size:'M',stock:2},{id:12,color:'White',size:'L',stock:1},{id:13,color:'Black',size:'S',stock:0}]};
test('sizes work before color selection; zero stock disabled; single color selected',async()=>{
 const {ui}=await setup();const html=ui.choices(product);
 assert.match(html,/<select data-size="1" aria-label="Размер">/);assert.match(html,/<option value="11" >M · Black/);assert.match(html,/<option value="13" disabled>/);
 assert.match(ui.choices({...product,variants:[product.variants[0]]}),/value="Black" selected/);
});
test('size selects color and enables purchase; color change clears selection',async()=>{
 const {ui,nodes,buttons}=await setup();ui.setProducts([product]);nodes['[data-size="1"]'].value='12';ui.syncChoice(1,true);
 assert.equal(nodes['[data-color="1"]'].value,'White');assert.ok(buttons.every(b=>!b.disabled));
 nodes['[data-color="1"]'].value='Black';ui.syncChoice(1);assert.equal(nodes['[data-size="1"]'].value,'');assert.ok(buttons.every(b=>b.disabled));assert.doesNotMatch(nodes['[data-size="1"]'].innerHTML,/value="12"/);
});
test('cart opens empty, buys selected variant, enforces stock, changes quantity and removes',async()=>{
 const {ui,nodes,click}=await setup();ui.setProducts([product]);click({closest:s=>s==='#openCart'?{}:null});assert.equal(nodes['#cart'].open,true);
 nodes['#cart'].close();nodes['[data-size="1"]'].value='11';ui.addProduct(1,true);assert.equal(nodes['#cart'].open,true);assert.equal(ui.getCart()[0].variantId,11);
 ui.addProduct(1);ui.addProduct(1);assert.equal(ui.getCart()[0].qty,2);
 click({closest:s=>s==='[data-qty]'?{dataset:{qty:'0',delta:'-1'}}:null});assert.equal(ui.getCart()[0].qty,1);
 click({closest:s=>s==='[data-remove]'?{dataset:{remove:'0'}}:null});assert.equal(ui.getCart().length,0);assert.equal(nodes['#checkout'].hidden,true);
});
test('zero-stock demo explains unavailability and cannot be purchased',async()=>{
 const {ui,nodes,buttons}=await setup();const p={...product,demo:true,variants:[{...product.variants[0],stock:0}]};ui.setProducts([p]);assert.match(ui.choices(p),/Демонстрационная модель/);
 nodes['[data-size="1"]'].value='11';ui.syncChoice(1,true);ui.addProduct(1);assert.ok(buttons.every(b=>b.disabled));assert.equal(ui.getCart().length,0);
});
test('size chip selects its variant and enables add-to-cart',async()=>{
 const {ui,nodes,buttons,click}=await setup();ui.setProducts([product]);
 click({closest:s=>s==='[data-variant]'?{disabled:false,dataset:{product:'1',variant:'12'}}:null});
 assert.equal(nodes['[data-size="1"]'].value,'12');assert.equal(nodes['[data-color="1"]'].value,'White');assert.ok(buttons.every(b=>!b.disabled));ui.addProduct(1);assert.equal(ui.getCart()[0].variantId,12);
});
