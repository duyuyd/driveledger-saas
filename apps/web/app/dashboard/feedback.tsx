export function Feedback({saved,error}:{saved?:string;error?:string}){
  if(saved)return <p role="status" className="notice">Đã lưu dữ liệu thành công.</p>;
  if(error)return <p role="alert" className="notice error">{error}</p>;
  return null;
}
