# Nâng cấp vận hành
- Quản trị → Vận hành: kiểm tra 3 bảng và 2 trigger migration 0014, tên mục thiếu chỉ dành cho Admin; public health trả boolean hr_ready nghiêm ngặt hơn. Không kiểm chứng toàn bộ nội dung schema.
- Hiển thị trạng thái Secret lịch tự động trên Pages, số cửa hàng đang bật, chưa từng chạy, lỗi lần chạy gần nhất, thời gian ghi nhận. Không đọc hoặc hiển thị Secret; không chứng minh Secret GitHub trùng khớp hoặc lịch được chạy đúng giờ.
- Thông báo: lọc ngày, phân trang, phân biệt chưa vào/vắng, thiếu chấm ra, đi muộn, về sớm, GPS ngoài vùng, giờ không hợp lệ; dùng giờ điều chỉnh đã duyệt và bỏ ca nghỉ duyệt/ca bổ sung chưa duyệt. Chỉ Admin/manager trong phạm vi. Không gửi thêm Push, không tự kỷ luật/khấu trừ.
- Báo cáo: tổng hợp cửa hàng cùng bộ lọc, số ca đủ công, giờ, phút muộn/sớm, nghỉ/vắng/thiếu ra/ngoài vùng/chờ duyệt. Chỉ nhóm có ca trong dữ liệu trả về. Giữ CSV chi tiết; tải filter quản trị và báo cáo song song.
- Không migration mới. Nếu hr_ready chuyển false, kiểm tra đúng năm mục 0014; không chạy lại toàn bộ SQL tùy tiện. Lịch tự động 401 phải sửa Secret production riêng.
