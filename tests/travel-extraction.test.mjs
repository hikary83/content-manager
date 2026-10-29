import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function parser() {
  const context = vm.createContext({ PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})}, userError_:message=>new Error(message) });
  vm.runInContext(readFileSync(new URL('../backend/Product.js',import.meta.url),'utf8'),context);
  return context;
}
function fixture() {
  return `<title>쿠팡!</title><meta property="og:title" content="COUPANG"><meta property="og:image" content="https://image.coupangcdn.com/image/mobile/v3/img_fb_like.png"><img src="https://assets.coupangcdn.com/static/media/cart.png"><script id="travel-detail-product-data" type="application/json">${JSON.stringify({product:{
    productName:'씨라이프코엑스아쿠아리움_성인권/어린이권/커플권',
    introductions:[{title:'소개',description:'SEA LIFE COEX, Seoul'}],
    location:{address:'서울 코엑스'},keyInfos:[{title:'사용방법',description:'바코드 제시'}],
    policies:[{title:'예약안내',description:'운영일정 확인'}],cancelPolicies:[{title:'취소 안내',description:'미사용 조건 확인'}],
    representativeVendorItem:{descriptions:['어린이권 조건']},facilities:[{title:'시설',facilities:[{description:'체험존'}]}],
    sellerInfo:{private:'수집하면 안 되는 판매자 정보'},bestReview:{text:'수집하면 안 되는 후기'},
    imageGroups:[{images:[{originImagePath:'//image.coupangcdn.com/product1.jpg'},{originImagePath:'//image.coupangcdn.com/product2.jpg'}]}],
    content:{content:'<div><img src="//image15.coupangcdn.com/detail.jpg"><img src="//image15.coupangcdn.com/detail.jpg"></div>'}
  }})}</script>`;
}
test('일반 COUPANG 메타·아이콘 대신 트래블 상품 JSON을 우선 읽는다',()=>{
  const data=parser().parseProduct_(fixture(),'https://trip.coupang.com/tp/products/30000011240405');
  assert.match(data.name,/씨라이프/);assert.equal(data.extraction,'coupang-travel-data');assert.equal(data.images.length,3);
  assert.deepEqual(Array.from(data.imageAssets,item=>item.kind),['product','product','detail']);assert.ok(data.imageAssets[2].url.startsWith('https://image15.'));
  for(const text of ['SEA LIFE','바코드 제시','운영일정 확인','미사용 조건 확인','대표 옵션 조건','체험존']) assert.ok(data.description.includes(text));
  assert.doesNotMatch(data.description,/판매자 정보|수집하면 안 되는 후기/);assert.ok(!data.images.some(url=>/cart|img_fb_like/.test(url)));
});
test('트래블 전용 데이터가 없거나 손상되어도 일반 수집으로 처리한다',()=>{
  const html='<meta property="og:title" content="COUPANG"><meta property="og:title" content="실제 상품"><script id="travel-detail-product-data" type="application/json">broken</script>';
  assert.equal(parser().parseProduct_(html,'https://trip.coupang.com/product').name,'실제 상품');
});
test('다른 도메인에서 트래블 데이터로 위장한 스크립트는 무시한다',()=>{
  assert.equal(parser().parseProduct_(fixture(),'https://shop.example.com/product').extraction,undefined);
});
test('큰 상세 이미지는 다운로드 허용, 12MB를 넘는 원본은 거부한다',()=>{
  const context=parser();const bytes=new Array(6119611);let content=bytes;
  context.Utilities={base64Encode:value=>`length:${value.length}`};
  context.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getAllHeaders:()=>({'Content-Type':'image/jpeg'}),getContent:()=>content})};
  assert.equal(context.readImage_('https://image.coupangcdn.com/detail.jpg').data,'length:6119611');
  content={length:13*1024*1024};assert.throws(()=>context.readImage_('https://image.coupangcdn.com/detail.jpg'),/12MB/);
});
