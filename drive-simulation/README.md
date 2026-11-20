# Bến xe buýt Lý Thái Tổ — bản sửa lỗi khung hình đen

Bản độc lập từ `build-aaa-saigon-simulation.zip` (MD5 `393fc7dbfb417a9457cc36a17034fbb0`), không dùng giao diện Studio. Chạy `npm ci` rồi `npm run dev`, hoặc `npm run build && npm run preview`.

`Post` phải thêm `RenderPass(scene,camera)` trước `N8AOPostPass`. N8AO đọc ảnh màu và chiều sâu từ pass trước; tắt nó trong Inspector cũng không được tắt RenderPass. Bộ đếm hình học được đặt lại một lần cho cả khung hình, thay vì sau mỗi pass toàn màn hình. Renderer phần mềm dùng texture nhỏ hơn và chỉ gửi khung hình mới khi GPU đã xử lý xong khung trước.

Tệp gốc chỉ có giấy phép trong `public/models/`, không có GLB. Bản sửa này giữ nguyên tài nguyên gốc: mô hình tải ngoài có thể vắng mặt nhưng đường, nhà chờ, xe buýt và các camera vẫn hoạt động.
