import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
const schema=fs.readFileSync(new URL('../supabase/migrations/202611210001_foundation.sql',import.meta.url),'utf8');
test('every exposed table has RLS enabled',()=>{
 for(const name of ['platform_settings','profiles','organizations','memberships','billing_subscriptions','students','vehicles','lessons','invoices','transactions','trips','trip_points','audit_events']){
  assert.match(schema,new RegExp(`alter table public\\.${name} enable row level security;`));
 }
});
test('accounting entries are immutable via RLS and reports use confirmed entries',()=>{
 assert.match(schema,/create policy transaction_insert/);
 assert.doesNotMatch(schema,/create policy transaction_update/);
 assert.doesNotMatch(schema,/create policy transaction_delete/);
 assert.match(schema,/status='confirmed' and kind='income'/);
 assert.match(schema,/create unique index transactions_transfer_ref_unique/);
});
test('server performs GPS mileage and invoice checks',()=>{
 assert.match(schema,/function public\.finish_trip/);
 assert.match(schema,/created_by=\(select auth\.uid\(\)\)/);
 assert.match(schema,/meters\/seconds <= 45/);
 assert.match(schema,/function private\.prevent_invoice_overpayment/);
 assert.match(schema,/security_invoker=true/);
});
