"""Create Linux x64 .deb and .tar.gz from electron-builder's linux-unpacked.
Standard-library only; may run on Windows or Linux. Files get explicit POSIX modes.
"""
import io, os, sys, json, stat, tarfile, gzip, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'dist-linux'
APP=Path(sys.argv[1]) if len(sys.argv)>1 else OUT/'linux-unpacked'
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
NAME='zo-forum-desktop'
STAMP=1792108800
OUT.mkdir(parents=True,exist_ok=True)
README=f'''# ZO 论坛盒子 {VERSION} Linux x64 首发测试版

面向 x86_64（amd64）桌面系统，不适用于 ARM。
优先使用 Debian/Ubuntu 安装包：

    sudo apt install ./ZO-Forum-{VERSION}-linux-x64.deb

安装后从应用菜单启动，或以普通桌面用户运行 zo-forum-desktop。
支持环境目标：Ubuntu 22.04/24.04、Debian 12 等带 GTK3/X11 或 XWayland 的 Linux 桌面。
本次在 Windows 交叉打包，已核对 Linux ELF、包结构、权限、源码一致性和共享界面；未进行 Linux 实机启动验证，请先在测试环境使用。

便携包：

    tar -xzf ZO-Forum-{VERSION}-linux-x64.tar.gz
    cd ZO-Forum-{VERSION}-linux-x64
    ./start.sh

便携包需系统提供 GTK3、NSS、ALSA、GBM 等 Electron 依赖。若系统禁用非特权用户命名空间，优先改用 .deb；它会以 root 所有权安装 chrome-sandbox 并设置所需的 4755 权限。不要全局关闭系统安全策略，不要以 root 启动图形客户端。Linux 首次启动默认关闭后台运行，避免无托盘支持的桌面环境关闭窗口后无法恢复；可在确认桌面托盘可用后手动开启。

Linux 更新使用 latest-linux.yml 独立通道，打开官网 Linux 安装包进行手动覆盖更新，不会下载 Windows EXE。
下载站：https://www.z19m.com/platform.php
论坛登录、QQ 授权、网盘链接仍使用现有论坛和系统默认浏览器；未针对所有 Linux 发行版/桌面环境完成验收。
'''
(OUT/'INSTALL-LINUX-2.2.7.md').write_text(README,encoding='utf-8')
def info(name,mode=0o644,size=0,kind=tarfile.REGTYPE,link=''):
    t=tarfile.TarInfo(name);t.mode=mode;t.size=size;t.type=kind;t.linkname=link;t.uid=t.gid=0;t.uname=t.gname='root';t.mtime=STAMP;return t
def add_bytes(tf,name,data,mode=0o644):
    if isinstance(data,str):data=data.encode('utf-8')
    tf.addfile(info(name,mode,len(data)),io.BytesIO(data))
def add_app(tf,prefix,deb=False):
    tf.addfile(info(prefix,0o755,kind=tarfile.DIRTYPE))
    for p in sorted(APP.rglob('*')):
        rel=p.relative_to(APP).as_posix();name=prefix+'/'+rel
        if p.is_dir():tf.addfile(info(name,0o755,kind=tarfile.DIRTYPE));continue
        with p.open('rb') as f:magic=f.read(4)
        mode=0o755 if magic==b'\x7fELF' else 0o644
        if rel=='chrome-sandbox':mode=0o4755 if deb else 0o755
        with p.open('rb') as f:tf.addfile(info(name,mode,p.stat().st_size),f)
    add_bytes(tf,prefix+'/INSTALL-LINUX.md',README)
exe=(APP/NAME).read_bytes()
assert exe[:4]==b'\x7fELF' and exe[4]==2 and int.from_bytes(exe[18:20],'little')==62,'Expected Linux x86_64 ELF'
portable=OUT/f'ZO-Forum-{VERSION}-linux-x64.tar.gz'
with portable.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw,mode='wb',mtime=STAMP,compresslevel=6) as gz:
        with tarfile.open(fileobj=gz,mode='w',format=tarfile.PAX_FORMAT) as tf:
            prefix=f'ZO-Forum-{VERSION}-linux-x64';add_app(tf,prefix)
            add_bytes(tf,prefix+'/start.sh','#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/zo-forum-desktop" "$@"\n',0o755)
data_path=OUT/'linux-data.tar.gz'
with tarfile.open(data_path,'w:gz',format=tarfile.PAX_FORMAT,compresslevel=6) as tf:
    for d in ['opt','usr','usr/bin','usr/share','usr/share/applications','usr/share/icons','usr/share/icons/hicolor','usr/share/icons/hicolor/256x256','usr/share/icons/hicolor/256x256/apps','usr/share/doc','usr/share/doc/zo-forum-desktop']:
        tf.addfile(info('./'+d,0o755,kind=tarfile.DIRTYPE))
    add_app(tf,'./opt/'+NAME,True)
    tf.addfile(info('./usr/bin/'+NAME,0o777,kind=tarfile.SYMTYPE,link='/opt/'+NAME+'/'+NAME))
    add_bytes(tf,'./usr/share/applications/'+NAME+'.desktop',f'[Desktop Entry]\nType=Application\nName=ZO论坛盒子\nComment=Discuz forum desktop client\nExec=/opt/{NAME}/{NAME} %U\nIcon={NAME}\nTerminal=false\nCategories=Network;\nStartupWMClass={NAME}\n')
    add_bytes(tf,'./usr/share/icons/hicolor/256x256/apps/'+NAME+'.png',(ROOT/'renderer/assets/icon.png').read_bytes())
    add_bytes(tf,'./usr/share/doc/'+NAME+'/copyright','ZO Forum client: MIT; Electron and bundled third-party libraries retain their own licenses. See bundled LICENSE and LICENSES.chromium.html.\n')
control=f'''Package: {NAME}
Version: {VERSION}
Architecture: amd64
Section: net
Priority: optional
Maintainer: ZO Forum
Homepage: https://www.z19m.com
Installed-Size: {sum(p.stat().st_size for p in APP.rglob('*') if p.is_file())//1024}
Depends: libc6 (>= 2.35), libgtk-3-0 | libgtk-3-0t64, libnss3, libasound2 | libasound2t64, libxss1, libxtst6, libgbm1, libx11-xcb1, libxkbcommon0, libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libatspi2.0-0 | libatspi2.0-0t64
Description: ZO Forum Desktop Linux x64 preview
 Native Electron client for Discuz forums. First Linux preview build.
'''
control_path=OUT/'linux-control.tar.gz'
with tarfile.open(control_path,'w:gz',format=tarfile.GNU_FORMAT) as tf:
    add_bytes(tf,'./control',control)
    add_bytes(tf,'./postinst','#!/bin/sh\nset -e\nchown root:root /opt/zo-forum-desktop/chrome-sandbox\nchmod 4755 /opt/zo-forum-desktop/chrome-sandbox\nif command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database >/dev/null 2>&1 || true; fi\nif command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true; fi\nexit 0\n',0o755)
    add_bytes(tf,'./postrm','#!/bin/sh\nif command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database >/dev/null 2>&1 || true; fi\nexit 0\n',0o755)
deb=OUT/f'ZO-Forum-{VERSION}-linux-x64.deb'
with deb.open('wb') as out:
    out.write(b'!<arch>\n')
    for name,payload in [('debian-binary',b'2.0\n'),('control.tar.gz',control_path),('data.tar.gz',data_path)]:
        size=len(payload) if isinstance(payload,bytes) else payload.stat().st_size
        header=f'{name+"/":<16}{STAMP:<12}{0:<6}{0:<6}{"100644":<8}{size:<10}`\n'.encode('ascii');assert len(header)==60;out.write(header)
        if isinstance(payload,bytes):out.write(payload)
        else:
            with payload.open('rb') as src:
                while True:
                    chunk=src.read(1024*1024)
                    if not chunk:break
                    out.write(chunk)
        if size%2:out.write(b'\n')
result={}
for p in [deb,portable]:
    data=p.read_bytes();result[p.name]={'bytes':len(data),'md5':hashlib.md5(data).hexdigest(),'sha256':hashlib.sha256(data).hexdigest(),'sha512_base64':__import__('base64').b64encode(hashlib.sha512(data).digest()).decode()}
(OUT/'linux-hashes.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
(OUT/'CHECKSUMS-LINUX-2.2.7.txt').write_text('\n\n'.join(f'{name}\nMD5: {v["md5"]}\nSHA256: {v["sha256"]}' for name,v in result.items())+'\n',encoding='utf-8')
(OUT/'latest-linux.yml').write_text(f'version: {VERSION}\nfiles:\n  - url: {deb.name}\n    sha512: {result[deb.name]["sha512_base64"]}\n    size: {result[deb.name]["bytes"]}\npath: {deb.name}\nsha512: {result[deb.name]["sha512_base64"]}\nreleaseDate: 2026-10-16T00:00:00.000Z\n',encoding='utf-8')
print(json.dumps(result))
