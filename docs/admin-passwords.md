# Mật khẩu do quản trị viên đặt

Giao diện cho phép nhập mật khẩu 8–128 ký tự khi tạo hoặc đặt lại tài khoản nhân viên/quản lý. Để trống thì vẫn sinh mã ngẫu nhiên 48 ký tự như phiên bản cũ. Admin cũ không đổi, không cần migration D1. Không đặt mật khẩu dạng đúng 48 ký tự hex chữ thường vì dành cho mã cũ.

Trình duyệt dùng Web Crypto PBKDF2-HMAC-SHA256 600.000 vòng, salt ngẫu nhiên riêng từng lần cấp; gửi khóa dẫn xuất qua HTTPS. Máy chủ lưu giá trị băm SHA-256 có salt, tách miền với mã cũ, không lưu mật khẩu gốc hoặc khóa đăng nhập. Khóa dẫn xuất vẫn là bí mật tương đương mật khẩu khi truyền; không log nó. Đặt lại thu hồi tất cả phiên, đổi salt và verifier. Không dùng mật khẩu BABY MARK ở nơi khác. Việc kéo dài khóa trên trình duyệt tránh chi phí CPU KDF trực tiếp trên Workers Free; cần đo hiệu năng thiết bị thật. API lấy salt là công khai và không cam kết chống liệt kê tên tài khoản; giới hạn thử đăng nhập hiện tại vẫn áp dụng.

Chưa có tự đổi mật khẩu của nhân viên, chống dò mật khẩu toàn cục theo IP hoặc WebAuthn. Không bật xóa dữ liệu hoặc thay đổi cấu hình lưu trữ trong lần nâng cấp này.

Mật khẩu tối thiểu 8 ký tự theo yêu cầu vận hành; nên chọn cụm mật khẩu dài từ 15 ký tự trở lên, riêng cho BABY MARK. Giới hạn chiều dài được kiểm tra trong giao diện và KDF phía trình duyệt; API nhận khóa dẫn xuất nên không thể xác minh độ dài mật khẩu gốc. Danh sách bộ phận gợi ý gồm Kho, Lái xe, Kế toán, Bán hàng, Thu ngân, Quản lý cửa hàng, Giao nhận, Nhân sự, Hành chính, Marketing, Chăm sóc khách hàng, Mua hàng, IT, Bảo vệ, Tạp vụ; Admin có thể nhập thêm tên mới. Bộ phận đã lưu được tái sử dụng làm gợi ý, không phải phân quyền.
