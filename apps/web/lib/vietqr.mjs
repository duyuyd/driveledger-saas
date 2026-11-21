/**
 * Build a VietQR Quick Link. This only creates a PAYMENT REQUEST.
 * It does not read bank statements or confirm that money was received.
 * @param {{bankBin:string,account:string,accountName:string,amountVnd:number,reference:string}} input
 * @returns {string}
 */
export function getVietQrUrl(input) {
  const {bankBin,account,accountName,amountVnd,reference}=input;
  if(!/^\d{6}$/.test(bankBin)||!/^\d{5,25}$/.test(account)) throw new Error("Invalid VietQR payee");
  if(!Number.isSafeInteger(amountVnd)||amountVnd<1||amountVnd>9_000_000_000_000)throw new Error("Invalid amount");
  const search=new URLSearchParams({amount:String(amountVnd),addInfo:reference,accountName});
  return `https://img.vietqr.io/image/${bankBin}-${account}-compact2.png?${search.toString()}`;
}
