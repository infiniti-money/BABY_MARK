# Hosting BABY MARK
## GitHub Pages — tài liệu giới thiệu, không phải hệ thống nghiệp vụ
Settings → Pages → Build and deployment → Deploy from a branch → main → /docs → Save.
URL dự kiến: https://infiniti-money.github.io/BABY_MARK/
Trang docs/index.html và logo.png đã chuẩn bị. Không thu thập GPS, ảnh, thông tin đăng nhập hoặc dữ liệu nhân sự tại Pages. Không xuất Next.js API sang static export. GitHub Pages không chạy route handlers hoặc sharp.
Chính sách: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
## Next.js pilot server
Render Web Service có thể chạy bản thử nghiệm: kết nối repo, root directory apps/web, build command npm install && npm run build, start command npm start -- --hostname 0.0.0.0 --port $PORT. Chọn Node 22 và Free nếu thử nghiệm. Đặt env theo apps/web/.env.example; secret chỉ ở server. Free có cold start, không khuyến nghị production. Không cấu hình cron để lách sleep. Chọn tên babymark-attendance nếu khả dụng; URL do Render cấp, không đảm bảo tên đã được giữ. Chưa tạo service.
## Tên miền
Ảnh thương hiệu có babymark.vn; nếu doanh nghiệp sở hữu và quản lý DNS, có thể dùng chamcong.babymark.vn cho ứng dụng thật và docs.babymark.vn cho Pages, không cần mua tên miền mới. Không đặt CNAME khi chưa xác minh quyền kiểm soát DNS, hostname đích và domain ownership. Không sửa bản ghi website chính.
GitHub Pages custom domain: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages
Tên miền phụ do dịch vụ cung cấp không phải tên miền đăng ký sở hữu riêng, không bảo đảm miễn phí vĩnh viễn.
