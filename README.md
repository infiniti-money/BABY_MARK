# BABY_MARK — Attendance
Nền tảng chấm công cho nhân viên và quản lý. Múi giờ nghiệp vụ Asia/Ho_Chi_Minh.
## Tình trạng v0.1
Mã nguồn nền tảng, chưa triển khai production. Không lưu bí mật hoặc ảnh thật vào GitHub.
- Supabase Auth, PostgreSQL, RLS, ca/lịch phân công, ảnh private, API xác thực thời gian server và geofence.
- Khoảng cách ngoài vùng được ghi cờ OUTSIDE để quản lý xem xét. GPS do thiết bị cung cấp, không phải bằng chứng tuyệt đối chống giả mạo.
- Timestamps là thời gian API nhận yêu cầu, không phải thời điểm màn trập đã được xác thực. Không lấy giờ máy khách làm giờ công.
## Cài đặt
1. Tạo project Supabase riêng, chạy supabase/schema.sql một lần trên project mới bằng SQL Editor.
2. Tạo người dùng Auth (tắt đăng ký công khai), tạo profiles với UUID tương ứng và mã nhân viên. Chỉ người vận hành có quyền DB mới tạo admin.
3. Tạo branches, shifts và assignments (starts_at/ends_at là timestamptz, work_date là ngày tại Việt Nam, grace_minutes sao chép từ ca). Ca qua đêm cần ends_at vào ngày kế tiếp.
4. cd apps/web; copy .env.example thành .env.local; điền URL, publishable key và service role key (chỉ phía server); tùy chọn Goong key. npm install; npm test; npm run build; npm run dev.
5. Trước production, cập nhật bản vá dependency, khóa lockfile, chạy kiểm thử quyền RLS và tải ảnh. Camera/GPS web cần HTTPS hoặc localhost.
## Bảo mật và riêng tư
Chỉ xin vị trí lúc chấm công; không theo dõi nền. Hạn chế quyền đọc ảnh; không dùng nhận diện khuôn mặt. Xác định chính sách thông báo, lưu trữ/xóa ảnh, quyền truy cập và quy trình sửa công trước triển khai. Không coi root/mock check là bảo đảm chống gian lận. Không dùng kết quả GPS đơn lẻ để tự động kỷ luật.
## Tiếp theo
Hoàn thiện Expo native, quản lý lịch ca, thông báo FCM/APNs và kiểm thử trên thiết bị. Báo cáo ngày/tháng cần đối soát ngày nghỉ, ca qua đêm, nghỉ giữa ca, duyệt ngoại lệ và phép trước khi tính lương.
