# Luke Teleprompter

中文 / English 智能提词器。网页端默认使用浏览器的连续语音识别流接收临时与最终转写，并用原稿约束匹配来推进提词位置；浏览器不可用时可自动切换到 Cloudflare 的 Whisper 转写。原稿不会被转写结果改写。macOS Tauri 版本仍使用本机 Whisper base 模型。

## 功能

- 自动跟读：允许漏读或跳句后向前追赶，不会自动倒退
- 麦克风测试：显示输入电平、是否检测到说话以及实时转写文本
- 匀速滚动：`0.5×–2.0×`，`1.0×` 为每分钟 8 行
- 中英文安全换行：英文单词不会从中间切断
- 应用内编辑以及 UTF-8 TXT 打开/保存
- 动作提示：在文稿中输入 `//动作 1//`，正文位置会出现零宽插入标记，提示框显示在对应行上方，并且不参与语音跟读匹配
- 重点词：在文稿中输入 `**文本 1**`，文本会黄色高亮，并且照常参与语音跟读匹配
- 字号、水平镜像、全屏、第一句/上一句/下一句/最后一句与暂停控制
- 阅读位置可在屏幕高度的 `30%–70%` 间调整，并与其他设置一起自动保存
- 手机竖屏会显示横屏入口；手机横屏会切换为紧凑控制栏
- 文稿和所有阅读设置自动保存在本机
- 网页端在用户点击麦克风按钮后才申请麦克风权限；不会依赖 Luke 的 Mac 或本机常驻模型

## 在 Chrome 中使用：连续语音识别

启动网页：

```bash
cd /Users/huazhi_luke/luke-projects/luke-teleprompter
npm run web
```

浏览器打开 `http://127.0.0.1:1420` 后，点击右上角的麦克风按钮，再在 Chrome 权限提示中选择“允许”。网页必须通过 `localhost`/`127.0.0.1` 或 HTTPS 打开，不能直接双击 `index.html`。

自动模式优先保持一条 Chrome `SpeechRecognition` 连续会话：高分临时结果会立即跟读，较弱的临时结果需要相邻的下一次结果确认，最终结果立即确认。它不向 `127.0.0.1` 发送 PCM，也不需要 `npm run whisper:web`。

若 Chrome 的语音识别不可用、语言不支持或网络服务失败，自动模式会改为上传不超过 5 秒的 16 kHz 单声道 WAV 短片段到 Cloudflare Workers AI Whisper；文本匹配、滚动和文稿仍完全在当前浏览器内完成。可在设置中手动选 Chrome、Cloudflare 或本机 Whisper。Cloudflare 转写端点通过构建变量 `VITE_CLOUD_TRANSCRIPTION_ENDPOINT` 启用。

本机 Whisper 仅是同一台电脑上的可选离线方式，绝不会成为其他设备的服务端。

## 在 iPad 和手机上使用

正式网页地址（当前 `main` 的在线版本）：

<https://luke-teleprompter.pages.dev/>

1. 在 iPad 或手机上打开上述 HTTPS 地址。
2. 竖屏打开时点击“进入横屏”，或直接把设备旋转为横屏。
3. 首次打开时允许浏览器使用麦克风和语音识别。
4. 如果没有出现权限提示，点击一次“暂停”，再点击“继续”，以用户操作重新启动识别。
5. 如果仍无法转写，请在系统设置中启用 Siri、听写或浏览器麦克风权限，然后重新打开页面。

浏览器的横屏锁定能力不一致：Android Chrome 通常支持点击后进入全屏横屏；iPhone/iPad Safari 往往不允许网页强制旋转，只能显示提示并由用户手动横屏。

为获得完整连续识别能力，建议优先使用桌面 Chrome。iPad/iPhone 浏览器对 Web Speech API 的支持会随浏览器和系统版本变化；移动设备上的文稿、字号和阅读位置存储在当前浏览器本机，不会与 Mac 自动同步。

## 发布网页版

网页通过 Cloudflare Pages 发布。普通正式发布运行：

```bash
npm run deploy:web
```

该命令会先构建网页，再把 `dist` 上传到 `luke-teleprompter.pages.dev`。GitHub 仓库保持私有。

Cloudflare 转写 Worker 位于 `workers/transcription/`。先部署 Worker：

```bash
npm run deploy:cloud-worker
```

再用其 URL 构建和部署网页。例如独立测试分支：

```bash
VITE_CLOUD_TRANSCRIPTION_ENDPOINT="https://YOUR-WORKER.workers.dev" npm run build
wrangler pages deploy dist --project-name luke-teleprompter --branch remote-whisper-tunnel
```

Worker 只接收有来源限制、大小不超过 384 KB 的 WAV 请求，且不记录音频。测试部署仅用于验证功能；正式公开前应启用 Turnstile 或其他访问控制和用量限制，避免把转写接口变成开放中继。

## 开发

要求：Node.js 22+、Rust stable、Xcode Command Line Tools、CMake。

```bash
npm install
npm run tauri dev
```

启动网页开发服务器：

```bash
npm run web
```

## 测试与构建

```bash
npm test
npm run test:cloud-worker
npm run build
cd src-tauri && cargo test
cd .. && npm run tauri build
```

成品位于 `src-tauri/target/release/bundle/macos/` 和 `src-tauri/target/release/bundle/dmg/`。当前构建面向 Apple Silicon macOS 14+，采用本地 ad-hoc 签名，不包含 Apple 公证。

模型下载到：

```text
~/Library/Application Support/com.luke.teleprompter/models/ggml-base.bin
```

应用不会读取或修改 DaVinci Resolve、AutoSubs 或其他软件的模型文件。
