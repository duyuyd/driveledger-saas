import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getVietQrUrl} from '../apps/web/lib/vietqr.mjs';
import {distanceMeters,plausibleHop} from '../apps/mobile/lib/gps.mjs';

test('VietQR generates a payment request with encoded reference and exact VND amount',()=>{
  const url=new URL(getVietQrUrl({bankBin:'970415',account:'1234567890',accountName:'NGUYEN VAN A',amountVnd:1350000,reference:'HD-001 A'}));
  assert.equal(url.host,'img.vietqr.io');
  assert.equal(url.pathname,'/image/970415-1234567890-compact2.png');
  assert.equal(url.searchParams.get('amount'),'1350000');
  assert.equal(url.searchParams.get('addInfo'),'HD-001 A');
  assert.equal(url.searchParams.get('accountName'),'NGUYEN VAN A');
});
test('VietQR rejects invalid payee and negative or noninteger amounts',()=>{
  const valid={bankBin:'970415',account:'1234567890',accountName:'TEST',amountVnd:1000,reference:'HD1'};
  assert.throws(()=>getVietQrUrl({...valid,bankBin:'bad'}));
  assert.throws(()=>getVietQrUrl({...valid,account:'abc'}));
  assert.throws(()=>getVietQrUrl({...valid,amountVnd:-1}));
  assert.throws(()=>getVietQrUrl({...valid,amountVnd:1.5}));
});
test('GPS Haversine handles stationary and a known latitude delta',()=>{
  const a={latitude:10,longitude:106},b={latitude:10.001,longitude:106};
  assert.equal(distanceMeters(a,a),0);
  assert.ok(Math.abs(distanceMeters(a,b)-111.2)<1);
});
test('GPS filters stationary noise, impossible speed, and missing time',()=>{
  assert.equal(plausibleHop(0,5),false);
  assert.equal(plausibleHop(50,10),true);
  assert.equal(plausibleHop(490,1),false);
  assert.equal(plausibleHop(50,0),false);
  assert.equal(plausibleHop(550,30),false);
});
