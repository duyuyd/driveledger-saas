# DriveLedger SaaS v0.2.0 — Web + Android/iOS dành cho giáo viên và trung tâm dạy lái xe

**Nhà phát triển: NPT duy.**

**Trạng thái: mã nguồn nền tảng/MVP, chưa triển khai production và chưa đủ điều kiện bán thương mại.**
Không có dữ liệu mô phỏng trong giao diện. Mọi số liệu kinh doanh và hành trình đọc từ Supabase.

## Các module đã có mã nguồn

- Website Next.js 15.5.29, React 19, Tailwind CSS 4, Supabase SSR + Server Actions.
- Ứng dụng mobile Expo SDK 58, React Native 0.88, React 19.3; chung Supabase Auth + PostgreSQL.
- SaaS multi-tenant: tổ chức, vai trò owner/manager/instructor/accountant/viewer, RLS mọi bảng, nhật ký thay đổi, trạng thái gói thuê bao dạng **chưa tích hợp thanh toán**.
- Học viên, xe, lịch học, giới hạn không trùng giờ giáo viên/xe, chỉ tiêu km và quãng đường GPS thực tế theo học viên.
- Sổ thu/chi VND. Chỉ giao dịch confirmed được tính doanh thu/lợi nhuận; chống trùng mã sao kê, idempotency, lưu bất biến từ phía người dùng.
- Phiếu thu nội bộ, VietQR Quick Link theo số dư; **không phải hóa đơn điện tử thuế, không tự xác nhận tiền vào ngân hàng**.
- GPS điện thoại chạy **chỉ khi app ở foreground**; ghi điểm thực vào Supabase; PostgreSQL tính lại số km và loại điểm nhiễu/tốc độ bất hợp lý.
- Branding động `platform_settings`, quản lý tài khoản ngân hàng, thiết lập chủ sở hữu và nhân viên đã đăng ký.

## 1. Điều kiện chạy

Node.js **>=22.13**; npm; tài khoản Supabase; Android/iOS simulator hoặc thiết bị có Expo Go compatible SDK 58.

Bước 1: Tạo **project Supabase mới trống**, không dùng project khác đang chạy. Mở Supabase SQL Editor, dán toàn bộ nội dung:

`supabase/migrations/202611210001_foundation.sql`

Chạy migration một lần. Kiểm tra không có lỗi. KHÔNG chạy trên database chứa dữ liệu thật trước khi được đánh giá migration.

Bước 2: Trong **Supabase Authentication**, bật Email/password, cấu hình Site URL và Redirect URLs:

- Local: `http://localhost:3000/auth/callback`
- Production: `https://<ten-mien>/auth/callback`

Bước 3: Sao chép `apps/web/.env.example` thành `apps/web/.env.local` và `apps/mobile/.env.example` thành `apps/mobile/.env`. Điền **Supabase Project URL** và **publishable/anon key** công khai, không phải `service_role` hoặc secret key. Điền `NEXT_PUBLIC_SITE_URL` và `EXPO_PUBLIC_WEB_URL` phù hợp. Không commit file `.env`.

Bước 4: Ở thư mục gốc chạy:

```bash
npm install
npm test
npm run typecheck:web
npm run typecheck:mobile
npm run dev:web
```

Mở `http://localhost:3000`. Đăng ký tài khoản → xác nhận email → đăng nhập → tạo tổ chức → nhập học viên/xe/lịch.

Để mở mobile, trong terminal khác chạy:

```bash
npm run dev:mobile
```

Mobile và website bắt buộc dùng **cùng Supabase project**. Với thiết bị thật, `EXPO_PUBLIC_WEB_URL` không thể là localhost của máy tính.

## 2. Super Admin

Sau khi đã đăng ký bằng email, thực hiện **một lần** trong Supabase SQL Editor bằng tài khoản quản trị DB (thay địa chỉ email của chủ sản phẩm):

```sql
update public.profiles
set system_role='super_admin'
where user_id=(select id from auth.users where email='OWNER@EXAMPLE.COM' limit 1);
```

Không bao giờ chạy lệnh này từ frontend. Super Admin có thể đổi logo-text/tiêu đề/màu trong `dashboard/settings`. Thành viên mới mặc định không có quyền này. Cấu hình `feature_registration=false` chỉ ẩn/chặn đăng ký qua web action; muốn khóa đăng ký thực sự phải cấu hình **Supabase Auth** ở tầng dịch vụ.

## 3. Các bất biến nghiệp vụ

- Mỗi hàng nghiệp vụ có `organization_id`; RLS đối chiếu tài khoản đăng nhập và quyền.
- Hóa đơn có thể thu từng phần; view `invoice_balances` tổng hợp chỉ các khoản đã xác minh. Có khóa giao dịch để không thể ghi vượt số dư đồng thời.
- Giao dịch mới là `pending` hoặc `confirmed`. Để duyệt pending dùng RPC bảo vệ `confirm_pending_transaction`, không cho người dùng sửa giao dịch đã xác minh.
- Dữ liệu của hai tổ chức khác nhau không được trộn bằng khóa ngoại, lịch học và ghi điểm GPS.
- Chỉ chủ sở hữu thêm nhân viên đã có tài khoản; chưa có luồng email mời tự động.
- Các khoản ghi nhận không tự tạo thêm doanh thu từ lịch học, tránh nhân đôi doanh thu.
- Vị trí GPS có thể sai hoặc bị giả mạo từ thiết bị; phần mềm chưa phải hệ thống chứng nhận quãng đường pháp định.

## 4. Build Android / iOS

Trong `apps/mobile`:

```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

Đối với IPA cần tài khoản nhà phát triển Apple và cấu hình ký số. **Không có APK/IPA được build sẵn trong gói nguồn này.** EAS/Apple/Google hoặc hosting production có thể phát sinh chi phí: tuyệt đối không đăng ký gói tính phí khi chưa quyết định.

## 5. Đưa lên GitHub (repository riêng, private)

Cách tự động nếu máy đã cài GitHub CLI và đăng nhập tài khoản `duyuyd`:

```bash
bash scripts/publish-to-github.sh
```

Script tạo repo mới `duyuyd/driveledger-saas` dạng **private**, khởi tạo commit và push toàn bộ nguồn. Script **không sửa các repo hiện hữu**. Nếu repo trùng tên, script dừng. Tài khoản Github phải xác thực sẵn hoặc xác thực qua trình duyệt khi `gh auth login`.

## 6. Kiểm chứng hiện có

Đã chạy `npm test`: 7/7 test qua (cấu trúc RLS, bất biến tài chính, tạo VietQR, tính Haversine và lọc bước nhảy GPS). Đã parse cú pháp TS/TSX không lỗi. **Chưa thể chạy npm install/build/typecheck/E2E** tại môi trường đóng gói vì không phân giải được DNS `registry.npmjs.org`; chưa có Supabase project/test-account/secrets kết nối để chạy integration. GitHub Actions CI sẽ kiểm tra typecheck/build khi được push. Android Debug APK build cần cấu hình GitHub Actions variables. Mọi trạng thái "production ready" cần CI xanh + chạy migration thật + test RLS/E2E + kiểm chứng APK.

## 7. Việc bắt buộc trước khi bắt đầu thu tiền khách hàng

1. Cài đặt dependency + tạo và commit `package-lock.json`; `npm ci` cho CI, chạy `npm audit` và cập nhật bảo mật.
2. Kiểm tra SQL migration trên Supabase test project; thêm các bài RLS integration kiểm thử cross-tenant, thử đồng thời thu nợ, dùng hai tài khoản thực.
3. Thêm email mời, quy trình đóng tài khoản/khôi phục, sao lưu, monitoring, giới hạn tải, chống spam và chống lạm dụng GPS.
4. Thêm quy trình SaaS billing thật, webhook có chữ ký/idempotency, giới hạn từng gói, gia hạn/hủy/tăng giảm gói. Bảng subscription hiện chỉ là **trạng thái nền tảng**, chưa thu phí.
5. Thêm thuế/hóa đơn điện tử hợp lệ nếu doanh nghiệp cần; VietQR hiện chỉ là phiếu đề nghị thanh toán.
6. Thử GPS thực địa, offline/retry, nền/background, quyền riêng tư, cảnh báo thiết bị. Xin chấp thuận thu thập dữ liệu vị trí của học viên/giáo viên.
7. Thử email xác thực, chạy Playwright E2E, chạy Android/iOS release build và kiểm tra quyền truy cập, tối ưu hiệu suất tải dữ liệu lớn.
8. Cấu hình tên miền, CDN, SSL, chính sách bảo mật/điều khoản, thanh toán và hỗ trợ khách hàng. Lưu ý các gói cloud miễn phí có thể giới hạn hoặc không phù hợp cho mục đích thương mại.

## Quyền tác giả

Dự án do chủ sở hữu kho lưu trữ quản lý; mã nguồn phát hành riêng tư theo `LICENSE.md`. Không mở mã nguồn công khai trước khi quyết định chiến lược bán sản phẩm.
