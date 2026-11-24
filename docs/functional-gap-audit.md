# Rà soát chức năng BABY MARK — 25/11/2026
Nguồn: main ed567ab; [CI](https://github.com/infiniti-money/BABY_MARK/actions/runs/45451168430/job/138648343862): 79/79 backend, 16/17 browser. Lỗi pattern HTML đã được sửa trong commit kèm tài liệu này, cần CI mới xác minh. Pages đã deploy; Worker baby-mark cũ lỗi. Không truy cập dữ liệu nhân sự production.
## P0 — nghiệm thu vận hành
- Lịch tự động đã có nhưng lần chạy production được cung cấp trả 401; kiểm tra Secret đồng nhất, Production, redeploy, từng cửa hàng opt-in. Không nới xác thực. Chưa có xác nhận chạy thành công.
- Push schema sẵn sàng không đồng nghĩa nhận thông báo. Kiểm thử Cron Worker, VAPID, thiết bị iOS/Android thực, số lượng gửi/dispatch và trường hợp tải cao.
- Health hr_ready chỉ kiểm tra roster_automation và payroll_closings, không kiểm tra payroll_inputs hay hai trigger bất biến. Kiểm tra schema toàn diện, trạng thái scheduler, không lộ Secret.
- GPS thực, camera thực, sao lưu và khôi phục D1/KV, giới hạn free-tier; xác minh không làm trên production tùy tiện.
## P1 — nghiệp vụ
- Lịch trực quan tuần/tháng, bộ lọc cửa hàng, lịch nghỉ riêng; thay ca tương lai có định danh người thay và người được thay, phê duyệt/kiểm tra trùng. Hiện COVER chỉ khai báo ca hôm nay hoặc ca qua đêm, tên người thay dạng text. Roster không tự tìm người thay.
- Nghỉ nhiều ngày hiện chỉ trên ca tương lai đã có; thiếu loại phép, số dư, nghỉ hưởng lương, xin nghỉ trước khi có lịch và duyệt theo nhóm.
- Cảnh báo hiện có đi muộn/chưa vào ca, nhắc ca; bổ sung danh sách thiếu chấm ra, quy trình xử lý bất thường và thông báo kết quả duyệt. Báo cáo hiện có trạng thái Vắng, Thiếu chấm ra, Ngoài vùng.
- Hồ sơ nhân sự hiện có mã, tên, bộ phận, vai trò, active; bổ sung ngày bắt đầu/kết thúc, trạng thái làm việc và import CSV kiểm tra trước khi lưu, không thu thập dữ liệu không cần.
- Bảng lương hiện là dự kiến theo giờ, Admin-only; thiếu lương tháng, phụ cấp định kỳ, nghỉ hưởng lương, OT, nghỉ giữa ca, thuế/bảo hiểm, phiếu lương cá nhân và phê duyệt trước khi công bố. Không tự đặt chính sách pháp lý. Chốt snapshot không khóa công gốc, đọc không có giao dịch nhất quán xuyên nhiều truy vấn. Rà soát người mới vào làm khi tính tháng cũ (hiện lấy mọi hồ sơ đang active).
## P2 — trải nghiệm và hiệu năng
- Báo cáo theo nhóm cửa hàng/tháng, biểu đồ xu hướng và XLSX; CSV và lọc ngày/cửa hàng/người đã có.
- Phân trang server, chỉ tải trường cần thiết, đo chi phí truy vấn; hiện phân trang client, API báo cáo giới hạn 5.000 ca và từ chối khoảng quá lớn.
- Quản lý nhật ký audit trong giao diện (bảng log có sẵn), quy trình khôi phục Admin an toàn; hiện recovery Admin do người có quyền D1 thực hiện.
- Kiểm tra tài liệu lịch sử Next/Expo/Supabase để tránh nhầm với Pages.
Không cam kết tính năng nào chưa triển khai; không thêm API trả phí, không migration trong đợt sửa giao diện.