# 第三方组件

本项目自行编写的客户端及 API 使用 MIT。以下组件不因本项目的 MIT 许可而改变原有许可：

| 组件 | 锁定版本 | 许可证 |
| --- | --- | --- |
| Electron | 43.0.0 | MIT；运行时还包含 Chromium/Node.js 等依赖 |
| electron-log | 5.4.4 | MIT |
| electron-updater | 6.6.2 | MIT |
| DOMPurify | 3.4.17 | MPL-2.0 或 Apache-2.0 |
| electron-builder | 24.13.3 | MIT |

随附 DOMPurify 许可文本，渲染层中的压缩文件保留上游许可头。其余组件通过 npm 安装，发行 Electron 二进制时应保留 Electron 安装包附带的 `LICENSE` 与 `LICENSES.chromium.html` 等文本。完整依赖版本以 `client/package-lock.json` 为准。

Discuz、UCenter、商业短信插件及 QQ 互联插件为部署前提，不在源码包内，其许可证和安装授权由部署者分别处理。MIT 许可不授予对第三方品牌、网站资源或商业插件的重新分发权。
