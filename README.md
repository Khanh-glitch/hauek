# Saigon Sim

`npm ci && npm run dev` — mở **/** để vào trình mô phỏng nâng cấp. Nội dung tiếp theo là hướng dẫn nhiệm vụ gốc (truy cập **/?mission**); thông tin tài nguyên, đồ họa và điều khiển studio nằm cuối tệp.

# SCAMMAZE / Mission 02: The Last Interview

A playable first-person public-bus transfer for Wednesday morning in Ho Chi Minh City. The supplied workspace contained a Vite starter and no existing SCAMMAZE source, engine, player controller or assets to extend. This build runs as a standalone React + Three.js mission slice. The transport controller has a host boundary for integration once the game's repository is available.

## Run

```sh
npm install
npm run dev
```

Open the URL printed by Vite in a WebGL 2 browser. Hardware acceleration is recommended. The desktop controls support a keyboard with mouse lock, mouse drag if lock is unavailable, or the arrow keys for camera rotation. Hold **C** with a move key for fine positioning near the steps. On touch devices, drag the canvas to look, use the on-screen direction pad, and tap contextual prompts.

## Test the ride

1. From the mission briefing, select **View Route** to inspect the stops, the 7,000 ₫ fare, the 34-minute in-game ride, and the 11:30 deadline. Close the map and select **Enter Simulation**.
2. From the starting sidewalk, press **E** on **Inspect route board**, then select **Wait for Route 06**. Alternatively, press **F** near the stop or stay nearby until the scheduled bus arrives. The bus physically approaches the stop with its doors closed.
3. Walk toward the front of the bus using **WASD**. Its boarding door is on the sidewalk side, just behind the front corner, marked **CỬA LÊN**. Face the doorway and try walking against it while closed; the body and closed leaves should block you.
4. Back off slightly if necessary, press **E** on **Open front doors**, and walk straight through the doorway once the leaves have slid aside. Walk past the step into the vestibule until **Validate fare** appears, then press **E**. Cash goes from 50,000 ₫ to 43,000 ₫. Reboarding will not debit the same fare twice.
5. Turn toward the rear and walk along the center aisle. Press **E** on **Sit down** near a seat. The camera lowers and walking locks. Press **E** again to stand in the aisle, then sit again to test seated travel.
6. Press **F** to signal the driver once you have paid and are clear of the steps. Both doors must finish closing before departure. The bus drives past Châu Văn Liêm to Chợ Lớn. The ride takes about 30 seconds of real time on a normally rendering browser and advances the game clock by 34 minutes. Look out of the window, or stand and move along the aisle, to check that your position follows the bus.
7. At Chợ Lớn, stand with **E** if seated. The doors open at the stop. Walk through either door and fully onto the sidewalk to log the transfer and the deadline outcome. This completes the public-bus transfer, not the interview.
8. Press **M** to see route progress and **Esc** to pause/release the pointer. Return to the briefing and resume to verify the transfer state is retained for the current page session. **Restart Mission** resets the standalone demo after confirmation.

Automated checks, from the project root:

```sh
npm run build
npx tsc --noEmit
npx esbuild tests/transit.spec.ts --bundle --platform=node --format=esm --outfile=/tmp/scammaze-transit-tests.mjs
node --test /tmp/scammaze-transit-tests.mjs
npx playwright install chromium
# With the Vite development server running:
node tests/mission.browser.mjs
```

The browser test uses `?qa` on the development server for read-only pose assertions, then uses the same mouse and keyboard handlers as the player. Set `SCENE_URL` if Vite is not on port 5173. There is no gameplay debug interface in the production build.

## Game Integration

`src/simulation/transit.ts` is independent of React, DOM and the renderer. Its optional `TransitHost` accepts:

| Hook | Contract |
| --- | --- |
| `clock.read()` and `clock.advance(seconds)` | Read mission-day seconds since midnight, and apply increments for waiting, exploration and travel. Preserve fractional seconds or accumulate them in the host. The simulation pauses its increments while its UI is open. |
| `wallet.read()` and `wallet.debit(amount)` | Read whole VND; debit atomically and return `false` when unavailable. The controller debits exactly once per trip. |
| `onEvent(event)` | Receive `wait-started`, `bus-at-stop`, `boarded`, `left-bus`, `fare-paid`, `departed`, `passed-stop`, `arrived` and `transfer-complete`. Use the last event, including its `onTime` result and timestamp, to continue the transport branch. Do not use the earlier `arrived` event to end the mission: the player is still on the bus. |

For the browser engine, `createSimulation(mount, callbacks, host)` in `src/simulation/runtime.ts` mounts the scene. `src/simulation/boarding.ts` can be used independently as the collider/standing/seating controller, or replaced by the host's player collider while preserving door state, vehicle-frame coordinates, and physical doorway crossing events. A native renderer can reuse the route controller but needs its own scene mounting and asset conversion. The route is authored as a short playable corridor, not a 1:1 geographic reproduction.

## Files

| Path | Role |
| --- | --- |
| `src/App.tsx`, `src/index.css`, `index.html` | Mission briefing, control guide, route map, settings, and interactive HUD. |
| `src/simulation/street.ts` | Procedural corridor, shelters, signage, vegetation, parked bikes and traffic. |
| `src/simulation/bus.ts` | PBR bus body, sliding door leaves, interior, wheels, driver and decals. |
| `src/simulation/boarding.ts` | Player sweep, doorway/steps, seat placement, and bus-local position. |
| `src/simulation/transit.ts` | Door and route state, clock, fare, and host events. |
| `src/simulation/runtime.ts`, `src/simulation/scene-kit.ts`, `src/simulation/sound.ts` | Renderer, input, interaction prompts, geometry/material helpers, and synthesized ambient audio. |
| `src/vite-env.d.ts` | Asset base URL typing. |
| `public/images/mission-saigon.jpg`, `public/images/canopy.png`, `public/images/shopfronts.jpg`, `public/images/stucco.jpg` | Generated briefing illustrative image and localized environment surface textures. The briefing photograph is not used in the playable scene. |
| `public/scammaze.svg` | Mission icon. |
| `tests/transit.spec.ts`, `tests/mission.browser.mjs` | Controller and end-to-end verification. |
| `package.json`, `package-lock.json` | npm-managed dependency updates. |

## References and Limits

- Used the supplied shelter, bus, door/step, passenger interior and driver-cabin images to guide the geometry, paint, signs and layout. The supplied images are not projected onto the playable scene. The briefing image is generated artwork, not a screenshot of the 3D scene.
- Still needed for location-accurate production: continuous curbside photos along the selected District 3 to District 5 route, both actual stop locations and current signage, and reference photographs of the bus's rear, opposite side and roof. Manufacturer drawings or measured entrance, axle, aisle and seat dimensions would be needed for a vehicle-specific match.
- Route 06 and its fare/timetable are fictional mission data. Châu Văn Liêm is a pass-through waypoint. Live route data and the two ride-hailing branches are outside this bus slice.
- The assets are procedural real-time models. Traffic riders and the driver are simplified models, not fully animated character assets. Lighting uses directional shadows, a prefiltered sky and local contact shading. Visual fidelity and frame rates on target PCs or consoles have not been signed off. No existing SCAMMAZE gameplay, save file, or scheduler could be tested in this workspace.
## Saigon Sim — bản nâng cấp

Trang `/` chạy thẳng cảnh 3D; `/?mission` giữ nhiệm vụ chuyển tuyến của ZIP gốc. 1–4 chọn máy quay; Space tạm dừng; H ẩn bảng điều khiển; R bật ảnh đối chiếu. Ảnh trong thư viện chụp từ framebuffer của khung hình đang chạy, chỉ lưu trong phiên. Ảnh chờ và thumbnail thời tiết là khung hình game đã chụp, không thay cho renderer.

**Nguồn.** `interactive-saigon-bus-environment.zip` (MD5 `a0673f91c7584b4cd18a26c9acaee107`) và hai ảnh tại 462 Lý Thái Tổ từ Drive của người dùng. Hai ảnh hướng dọc tuyến cho thấy dải phân cách sắt thấp, mặt tiền hẹp và cây xanh; không đủ dữ liệu đo chính xác bến hoặc toàn khu phố. Tuyến, thời tiết và lịch xe là kịch bản, không phải dịch vụ giao thông trực tiếp.

`public/models/taixe.glb` là biến thể game của `taixe.glb` gốc (MD5 `34dfa5ea8466213167c267c9a333e257`). Nguồn: 563.179 đỉnh, 1 triệu tam giác, 1 mesh, một bộ UV, 3 texture nhúng, không có rig hay hoạt ảnh. Bản game: 48.000 tam giác, rig cabin 8 khớp và texture thu nhỏ. Để tạo lại: chạy `python scripts/prepare_driver.py input.glb /tmp/cabin.glb` (cần Pillow), sau đó `npx gltfpack -i /tmp/cabin.glb -o public/models/taixe.glb -si 0.048 -sp -cc -ce ext -kn`.

15 nhân vật đi bộ/hành khách, hai mô hình người lái xe máy và đạo cụ đến từ `teehihi/scam-maze` ở `05943bd50b9c4f359908516f4793d1513870db15`. Dữ liệu rig, bộ phận trang phục và clip: `public/models/catalog.json`. Giữ thông tin xuất xứ tại `public/models/sources/`: giấy phép MIT của **mã nguồn** không chứng minh quyền phân phối thương mại của tất cả model. Cần xác nhận quyền với chủ tài nguyên trước khi phát hành công khai.

Cảnh dùng PBR, sky probe, bóng đổ, LOD khu phố/nhân vật, mưa và phản chiếu phẳng. Trên GPU hỗ trợ HDR float: depth-of-field, nhòe chuyển động theo camera, bloom, ACES và SMAA. Renderer phần mềm bỏ chuỗi hậu kỳ nặng, giảm kích thước phản chiếu và khoảng chuyển LOD. Không tuyên bố GI ray tracing, mô phỏng giao thông ở quy mô thành phố, chất lượng GTA 6 hay FPS cố định. Sky dome và vật liệu mặt tiền tầng trên là texture tạo mới dùng trên hình học 3D.

Kiểm thử UI studio bằng `node tests/studio.browser.mjs` khi máy chủ đang chạy. `CHROMIUM_PATH` cho phép dùng Chromium sẵn có. `SCENE_URL` đặt URL của máy chủ. npm build và kiểm tra kiểu độc lập: `npm run build && npx tsc --noEmit`.

### 462 Lý Thái Tổ · đối chiếu 06/2024

`/` mở ở góc DIDONG360 trong ánh sáng ban ngày. Vào **Tham chiếu → Góc nhìn → Đối chiếu với cảnh 3D** để xem hai phía từ cùng điểm giữa đường. Nút Google Maps mở địa chỉ, không khẳng định đó là panorama đúng ngày chụp. Các lô nhà trong 105 m quanh điểm quan sát có bố cục cố định trong `survey462.ts`; bề rộng, chiều cao và vị trí camera là ước lượng từ ảnh, không phải số liệu địa chính. Phần nối tới Chợ Lớn là tuyến chơi rút gọn.

Bản Drive `build-aaa-saigon-simulation.zip` thiếu tệp GLB mặc dù mã khởi tạo yêu cầu chúng. Bản tích hợp dùng mô hình cục bộ, nạp bổ sung sau khi vẽ cảnh và bỏ qua nhân vật lỗi riêng lẻ. Ba bản đồ vật liệu nhựa đường được bake từ bộ tạo của ZIP, không chạy bộ tạo texture 1024² lúc mở game. Nếu máy gặp lỗi GPU, `/?safe` dùng đường vẽ nhẹ hơn; vẫn cần WebGL 2.

**Mặt phố Quận 10**: `/?viahe` mở tour ngay tại góc nhìn chéo vào dãy cửa tiệm. Nhịp nhà phố, các loggia có lam/gạch bông gió, sân lát gạch trước hiên và hai lối hẻm là chi tiết diễn giải cho mô phỏng, không phải khảo sát từng căn. Ba texture `survey/loggia-q10.jpg`, `survey/shop-bay-q10.jpg` và `survey/phone-bay-q10.jpg` được tạo cho bề mặt 3D, không phải ảnh tư liệu công trình.

### Ánh sáng và vật liệu từ bản Drive

Mở `/?tram&time=rain` để nhìn xe từ trạm đêm mưa, hoặc `/?viahe&time=sunset` để xem dãy nhà phố lúc hoàng hôn. Phím **N** chuyển cảnh khi ở máy quay điện ảnh. **Chỉnh hình ảnh** điều khiển phơi sáng, phản chiếu mặt đường và tia nắng; hai tuỳ chọn hậu kỳ (bóng tiếp xúc màn hình và ống kính) chỉ bật được khi có HDR. Bản chính không chạy game Drive trong iframe. Nó dùng thời tiết, vật liệu và một số kỹ thuật dựng hình của bản đó trên hình học và tuyến chơi Q10 hiện có. Texture đã bake trong `public/images/drive-look`; chỉ cần `node scripts/bake-drive-look.mjs` nếu muốn tạo lại từ bộ sinh trong `drive-simulation` (cần Playwright Chromium).
