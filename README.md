# Saigon Open World — Phòng 6.07 đến Sài Gòn 3D

Thế giới mở 3D liền mạch (zero loading screen) tại TP. Hồ Chí Minh xây dựng bằng React + Three.js + WebGL2 với hệ màu điện ảnh Khronos AgX Filmic:

- **Phòng 6.07 & Dãy Trọ 462/14 (Quận 10)**: Phòng trọ đầy đủ tương tác (đèn trần/bàn/ngủ/bếp, cửa sổ mưa, cửa phòng, tủ lạnh, đồng hồ & laptop đồng bộ thời gian thực), hành lang tầng 2, cầu thang và hẻm 462/14.
- **Trục Lý Thái Tổ & Tuyến Xe Buýt 06**: Bến xe buýt, nhà phố Sài Gòn, giao thông xe máy/ô tô PBR và NPC.
- **Trung tâm Quận 1, Bitexco, Landmark 81 & Sông Sài Gòn**: Đại lộ Quận 1, tháp Bitexco vách kính cánh sen, Landmark 81, cầu Ba Son và bờ sông Thủ Thiêm.
- **Thời tiết & Chu kỳ Ngày/Đêm**: Nắng quang, mây ẩm, sau cơn mưa (phản chiếu vũng nước có gợn sóng mưa), mưa giông và 24h động.

## Chạy dự án

```bash
npm ci
npm run dev
```

## Kiểm tra build

```bash
npm run typecheck
npm run build
```

## Điều khiển

- `WASD` / Phím mũi tên: Di chuyển (`Shift` chạy nhanh)
- Kéo chuột / Double-Click: Xoay góc nhìn
- `E`: Mở cửa / tương tác đồ vật / lên xuống Xe Buýt 06
- `1`–`4`: Đổi nhanh thời tiết (Nắng, Mây ẩm, Sau cơn mưa, Mưa giông)
