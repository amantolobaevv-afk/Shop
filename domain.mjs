
import { randomBytes, createHash } from 'node:crypto';

export class ApiError extends Error { constructor(status, message) { super(message); this.status=status; } }
export const fail=(status,message)=>{throw new ApiError(status,message)};
export const text=(v,min,max,label)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail(400,`Проверьте поле: ${label}`);return v.trim()};
export const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,`Проверьте поле: ${label}`);return v};
export const categories=['Верхняя одежда','Рубашки','Футболка и поло','Трикотаж','Брюки'];
const sizes=['S','M','L','XL','XXL'];
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function validateProduct(p){
 if(!p||typeof p!=='object'||Array.isArray(p))fail(400,'Требуется объект товара');
 const result={name:text(p.name,1,100,'название'),category:text(p.category,1,60,'категория'),description:text(p.description??'',0,3000,'описание'),material:text(p.material??'',0,200,'материал'),price:integer(p.price,1,10000000,'цена'),active:p.active!==false,demo:p.demo===true};
 if(!categories.includes(result.category))fail(400,'Неизвестная категория');
 if(!Array.isArray(p.images)||p.images.length<1||p.images.length>6)fail(400,'Добавьте от 1 до 6 фото');
 result.images=p.images.map(s=>{if(typeof s!=='string'||s.length>500||!(/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(s)||/^https:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9-]+(?:\?[a-zA-Z0-9=&%-]+)?$/.test(s)))fail(400,'Загрузите фото через панель управления');return s});
 if(!Array.isArray(p.variants)||p.variants.length<1||p.variants.length>100)fail(400,'Добавьте варианты товара');
 const unique=new Set();result.variants=p.variants.map(v=>{const color=text(v.color,1,60,'цвет');if(!sizes.includes(v.size))fail(400,'Недопустимый размер');const k=JSON.stringify([color,v.size]);if(unique.has(k))fail(400,'Повтор цвета и размера');unique.add(k);return {color,size:v.size,stock:integer(v.stock,0,100000,'остаток')}});return result;
}
