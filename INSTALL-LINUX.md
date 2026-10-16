# ZO 论坛盒子 2.2.7 Linux x64 首发测试版

面向 x86_64（amd64）桌面系统，不适用于 ARM。
优先使用 Debian/Ubuntu 安装包：

    sudo apt install ./ZO-Forum-2.2.7-linux-x64.deb

安装后从应用菜单启动，或以普通桌面用户运行 zo-forum-desktop。
支持环境目标：Ubuntu 22.04/24.04、Debian 12 等带 GTK3/X11 或 XWayland 的 Linux 桌面。
本次在 Windows 交叉打包，已核对 Linux ELF、包结构、权限、源码一致性和共享界面；未进行 Linux 实机启动验证，请先在测试环境使用。

便携包：

    tar -xzf ZO-Forum-2.2.7-linux-x64.tar.gz
    cd ZO-Forum-2.2.7-linux-x64
    ./start.sh

便携包需系统提供 GTK3、NSS、ALSA、GBM 等 Electron 依赖。若系统禁用非特权用户命名空间，优先改用 .deb；它会以 root 所有权安装 chrome-sandbox 并设置所需的 4755 权限。不要全局关闭系统安全策略，不要以 root 启动图形客户端。Linux 首次启动默认关闭后台运行，避免无托盘支持的桌面环境关闭窗口后无法恢复；可在确认桌面托盘可用后手动开启。

Linux 更新使用 latest-linux.yml 独立通道，打开官网 Linux 安装包进行手动覆盖更新，不会下载 Windows EXE。
下载站：https://www.z19m.com/platform.php
论坛登录、QQ 授权、网盘链接仍使用现有论坛和系统默认浏览器；未针对所有 Linux 发行版/桌面环境完成验收。
