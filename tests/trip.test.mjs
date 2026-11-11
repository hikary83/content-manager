import test from 'node:test';
import assert from 'node:assert/strict';
import { originalUrl, jpegSize, productText } from '../tools/trip.mjs';

test('쿠팡 여행 사진은 잘린 주소 대신 원본 주소로 받는다', () => {
  assert.equal(originalUrl('//image.coupangcdn.com/image/resized_image/thumbnails/remote/1180x2360q60crop1180x630/image/travelConnect/hotel/A1/x.jpg'),
    'https://image.coupangcdn.com/image/travelConnect/hotel/A1/x.jpg');
  assert.equal(originalUrl('//image.coupangcdn.com/image/static/booking/image/pension/ddnayo/y.jpg'),
    'https://image.coupangcdn.com/image/static/booking/image/pension/ddnayo/y.jpg', '원본이면 그대로');
});

test('JPEG 크기는 SOF 표시에서 읽는다', () => {
  // SOI · APP0(길이 4) · SOF0: 높이 1080 · 가로 1920
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03]);
  assert.deepEqual(jpegSize(buf), [1920, 1080]);
  assert.deepEqual(jpegSize(Buffer.from([0xff, 0xd8])), [0, 0]);
});

test('본문 글에 판매 상태·정책·후기 평점이 들어간다', () => {
  const text = productText({
    productName: '테스트 펜션', onSale: true, representativeVendorItem: { saleStatus: '매진' },
    policies: [{ title: '유의사항', description: '반려동물 <b>불가</b><br>주차 무료' }],
    productReview: { ratingAverage: 5, ratingCount: 7 },
    bestReview: { rating: 5, reviewContent: { reviewAt: Date.UTC(2025, 11, 2), title: '좋아요', content: '또 갈래요' } },
  });
  assert.match(text, /\[유의사항\]\n반려동물 불가\n주차 무료/);
  assert.match(text, /onSale true · 대표 옵션 매진/);
  assert.match(text, /평균 5 · 7개/);
  assert.match(text, /2025-12-02, 별 5\): 좋아요\n또 갈래요/);
});
