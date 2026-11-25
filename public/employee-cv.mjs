// Shared allowlist, limits and labels. All fields are optional.
export const cvFields=[
 [
  "birth_date",
  "Ngày sinh",
  "date",
  10
 ],
 [
  "phone",
  "Điện thoại",
  "tel",
  40
 ],
 [
  "email",
  "Email",
  "email",
  160
 ],
 [
  "address",
  "Địa chỉ liên hệ",
  "text",
  300
 ],
 [
  "job_title",
  "Vị trí công việc",
  "text",
  120
 ],
 [
  "summary",
  "Giới thiệu bản thân / mục tiêu nghề nghiệp",
  "textarea",
  1000
 ],
 [
  "education",
  "Học vấn (trường, chuyên ngành, thời gian)",
  "textarea",
  1500
 ],
 [
  "experience",
  "Kinh nghiệm (đơn vị, vị trí, thời gian, nhiệm vụ)",
  "textarea",
  2500
 ],
 [
  "skills",
  "Kỹ năng chuyên môn",
  "textarea",
  1200
 ],
 [
  "languages",
  "Ngoại ngữ và trình độ",
  "textarea",
  500
 ],
 [
  "certificates",
  "Chứng chỉ / khóa đào tạo",
  "textarea",
  1200
 ],
 [
  "achievements",
  "Thành tích / khen thưởng",
  "textarea",
  1000
 ]
];

export const hrFields=[
 ['contract_reference','Mã / số hợp đồng','text',80],
 ['contract_kind','Loại hợp đồng','text',120],
 ['contract_start','Ngày bắt đầu hợp đồng','date',10],
 ['contract_end','Ngày hết hạn hợp đồng (bỏ trống nếu không có hạn)','date',10],
 ['probation_start','Ngày bắt đầu thử việc','date',10],
 ['probation_end','Ngày kết thúc thử việc','date',10],
 ['probation_result','Kết quả thử việc','text',300],
 ['training','Đào tạo và kế hoạch phát triển','textarea',800],
 ['performance','Đánh giá năng lực (đã trao đổi với nhân viên)','textarea',800],
 ['career_history','Quá trình thăng tiến / thay đổi vị trí','textarea',800],
 ['discipline','Kỷ luật đã xác nhận (không ghi cáo buộc chưa xác minh)','textarea',500],
 ['salary_history','Lịch sử thay đổi chế độ lương (tham chiếu quyết định, không thay đổi bảng lương)','textarea',500]
];
cvFields.push(...hrFields);
export function hrDeadlines(cv,day){
 const cutoff=new Date(Date.parse(day+'T00:00:00Z')+30*86400000).toISOString().slice(0,10);
 return [['contract_end','Hợp đồng'],['probation_end','Thử việc']].flatMap(([key,label])=>{
  const end=cv?.[key];
  // A documented probation result is not an outstanding probation decision.
  if(!end||typeof end!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end>cutoff||(key==='probation_end'&&cv.probation_result?.trim()))return [];
  return [{key,label,end,status:end<day?'expired':end===day?'today':'upcoming'}];
 });
}
