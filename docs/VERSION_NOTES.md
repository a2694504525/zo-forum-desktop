# 版本与平台说明

[返回项目首页](../README.md)

以下内容保留既有版本的实现说明、部署步骤与验收边界。历史功能描述以各版本为准，当前界面变化请结合最新小节阅读。

## 11. 2.2.5 三页面布局对接（历史）

客户端使用原生 HTML/CSS/JS：48px 顶栏、200px 分组导航、首页轮播和编号卡片、板块统计及分页、帖子双栏。

后台基础设置保存下列字段，保存后客户端约两秒更新；无需重新打包。

| 字段 | 配置说明 |
| --- | --- |
| slogan / show_version | 侧栏标语与版本显示开关 |
| banners | 轮播数组，含 id、title、image、slogan、link_type(thread/external)、link、button_text、enabled；图片使用 HTTPS |
| home_tabs | 完整板块数组，key 可用 latest/hot/digest/games；支持 label、enabled、icon、sort、forum_ids、count、link；后台独立首页四板块配置区支持排序和来源多选 |
| games_forum_id | 游戏资源标签对应的板块数字 fid |
| forum_filters | 数组，key 为 all/digest/sticky，配 label、enabled |
| pagination_mode | paged（默认）或 infinite；每批 30 条 |
| feedback_link | 详情反馈的 HTTP/HTTPS 地址，留空隐藏 |
| layout_labels | 页面、导航分组、搜索框等显示文案 |
| forum_stats | 公共接口实时计算 forums_count、today_posts，无需手工填写 |

空轮播自动取最近更新的精华或置顶主题，均无时回退最新主题。5 秒切换，悬停暂停。详情正文图片移动至封面和预览画廊，下载仍沿用论坛权限。当前没有收藏服务端接口，因此隐藏收藏按钮，单独开启 collect_enabled 不会产生收藏能力。

部署新增 layout_config.php，并同步 config_store.php、config_contract.php、config_v22.php、client_config.php、admin_dashboard.php、latest.php、forums.php、thread.php。打开后台保存一次，让旧导航迁移至八项；清除配置缓存后检查公共配置。论坛统计只统计实际展示的活跃有内容板块。

接口示例：latest.php?page=1&perpage=30&orderby=lastpost；filter 支持 digest、sticky、featured。forums.php 的板块详情参数沿用现有 fid，filter 支持 digest/sticky。分页必须使用接口 total，不能一次拉取全部主题再做客户端分页。

### 2.2.5 同版本修复：完整首页四板块（历史）

后台新增独立“首页四板块”，从论坛数据库读取来源版块树。可调整标签名、显示、图标、顺序、排序、过滤、来源多选、每页条数及查看全部链接。空来源表示全站，条数范围 1–50；旧标签自动补全默认值。sort 是权威字段，view/orderby 在保存时自动生成。

配置示例：

```json
{"key":"games","label":"游戏资源","enabled":true,"icon":"🎮","sort":"lastpost","view":"newreply","orderby":"","filter":"","forum_ids":[2],"count":30,"link":""}
```

latest.php 支持 view=newthread（dateline）、orderby=replies、filter=digest/sticky/featured、forum_ids=2,3（多来源），perpage 与 count 均可用。默认最后回复排序。列表保持 data 数组兼容旧客户端，并在顶层增加 sort/page/perpage/total/total_page。forums.php 板块详情置顶优先、同等级按最后回复；search.php 也按最后回复，二者返回 sort。渲染层不得二次排序。

游戏标签直接展示指定来源；“查看全部”优先打开配置的 HTTP/HTTPS 链接；空链接时 games 去板块，其余去搜索页并保留原标签配置，可继续加载下一页。隐藏标签不渲染，所有标签关闭时显示空状态。后台保存即时清缓存，也可单独点击“仅刷新缓存”。

无数据库业务表迁移：home_tabs 仍存在 desktop_config 的 JSON 值内。已有大型论坛可先检查 forum_thread 索引和执行计划，再按需添加 (fid,lastpost) 索引，不要重复创建索引。

此历史修复保持版本 2.2.5；Electron 自动更新不会将同号包识别为更高版本，已安装同号旧构建的用户需手动下载覆盖安装。发布包、blockmap 和 latest.yml 必须作为一组替换；替换前备份旧包。

## 12. 2.2.6 内容页与九页后台（沿用能力）

后台地址仍为 /api/desktop/admin.php，由原有管理员身份和表单校验保护。左侧四组九页：客户端运行、公告管理、首页板块、轮播管理、登录注册、功能开关、导航主题、版本更新、数据缓存；每次只渲染当前页，记录可折叠；切页有未保存提示，保存携带 expected_revision，避免覆盖其他管理者的新配置。配置键仍保持兼容，显示标签和选项使用中文。数据缓存页导出的是客户端公开配置，不能用来保存服务端秘密。

本机收藏按论坛账号在本机存储，云端收藏通过论坛原生收藏确认窗口完成；不会伪造收藏成功。collect_enabled 控制两个收藏入口，仍沿用管理员已有开关。微信、邮箱登录和邮箱验证没有接入，后台明确标注尚未接入。托盘开关真实作用于窗口关闭及后台托盘；关闭托盘时会显示已隐藏主窗口。

### 正文渲染与权限

新增 content_renderer.php、content_labels.json。thread.php 服务器通过 HTTPS 请求同一论坛的原生 thread-主题编号-页码-1.html，仅向同源转发当前请求的 Cookie；使用原生 viewthread→discuzcode→插件链，复用隐藏、出售、附件权限，抽取 postmessage 正文片段而非嵌入网页。该方式避免独立 API 初始化论坛核心时改变会话、全局变量或遗漏插件权限。请求禁止跟随跨站重定向、验证 TLS、超时 15 秒；失败时使用保守 BBcode 降级，含 hide/sell/password 的正文保持受限提示。

接口继续返回兼容的 message（安全 HTML），同时返回 message_html、render_assets（enabled/engine/css）、content_labels 和权限允许的图片附件元数据。为防止泄漏隐藏或出售内容，不直接返回未过滤的原始 BBcode。render_assets.engine 为 discuz-native 或 safe-fallback，便于排障。CSS 从论坛当前缓存样式中选取引用、代码、附件和正文规则，服务端筛选属性并逐选择器加 .zo-native-body 前缀；客户端再次校验作用域。前后端都有脚本、事件、危险协议剥离；不使用 iframe。

换站部署时，除原 README 的域名清单外，还须替换 content_renderer.php 内原生页面地址、默认资源地址、forum.php 附件链接，以及 thread226.js 中的论坛分享/收藏地址。CSS 默认取 data/cache/style_25_common.css 和 style_25_forum_viewthread.css，应替换为实际模板样式编号；不是要求安装原站商业模板。服务器必须安装 PHP cURL、DOM/libxml，并能经有效 TLS 访问自身 HTTPS 域名；无需关闭证书校验。

共享字段映射在 content_labels.json（UTF-8，无 BOM），API 把映射后的 title 和映射字典返回客户端；无需前端复制另一套标识符映射。字段值继续沿用现有分类信息权限插件判断，权限判断出错时不下发分类值。

### 内容布局与图片

标题和作者条在顶部，主体为封面、快捷操作、简介、中文游戏信息、网盘资源、附件和回复卡片；右侧为作者、信息速览、下载入口和最多六条同版块最后回复排序推荐。正文保留原生结构；图片取消固定宽高、裁切及放大弹层，原图完整展示并懒加载。列表封面缩略策略不变。网盘按域名分类、一键复制，附件走论坛权限路由。收藏/下载/反馈遵循后台开关；反馈地址为空隐藏入口。

### 升级与验收

版本更新为 2.2.6。先部署新增渲染文件、字段映射、thread.php 与 admin_dashboard.php，保持其余配置；构建安装包，先上传安装包/blockmap/源码并核对 SHA-512，最后替换 latest.yml 和后台版本。无需变更论坛业务表和账号密码。验收不公开发帖；真实短信与 QQ 保留既有验收，使用隔离配置检查入口和开关。

验收涵盖九页路由、中文选项、未保存切换保护、独立保存、五秒内同步、原生正文、受限降级不泄漏、复制、本机收藏和原生云端收藏表单；iOS 外框及图片展示策略与网页有意不同，不宣称整页逐像素一致。

## 13. 2.2.7 移动后台、统一下载入口及动态游戏信息

后台新增“内容管理 → 游戏信息”，总计十个页面。小于 768px 使用默认收起的抽屉：汉堡打开，分组手风琴，遮罩/关闭按钮/选择菜单后收起；桌面保留固定侧栏。输入控件最小字号 16px、按钮点击区域至少 44px，单列卡片和安全区留白；关闭的抽屉不可被键盘误聚焦。viewport 参数遵照移动方案设置，但仍需在实际 iOS 设备做最终浏览器体验核验。自动化检查覆盖 375/390px Chromium 视口、聚焦后视口比例、十页无横向溢出与触控尺寸。

帖子封面下方移除高速下载按钮。快捷区仅保留收藏、反馈、分享与复制链接；右侧“查看下载资源”是唯一下载引导按钮，点击滚动至主内容下载资源卡。资源卡显示实际链接统计，链接和附件仍按原论坛权限及下载开关操作。

### 游戏信息配置契约

新增根键 game_info，不更改既有数据库表结构；字段列表顺序即显示顺序，删除或空数组按原样保存，不会由递归默认值补回。默认映射来自 content_labels.json，后台 label 优先；支持自定义帖子字段标识，需与 sort_options[].identifier 精确匹配。恢复按钮补回缺失的默认字段，不覆盖已有名称和排序。

```json
{"enabled":true,"title":"游戏信息","empty_text":"本帖未设置分类信息。","fields":[{"key":"game_name","label":"游戏名称","enabled":true},{"key":"english_name","label":"英文名称","enabled":true},{"key":"game_type","label":"游戏类型","enabled":true},{"key":"developer","label":"游戏开发","enabled":true},{"key":"publisher","label":"游戏发行","enabled":true},{"key":"official_site","label":"官方网站","enabled":true},{"key":"release_date","label":"发售时间","enabled":true},{"key":"netdisk","label":"网盘链接","enabled":true}]}
```

字段标识为 1–64 位英文字母开头、后续字母/数字/下划线，必须唯一；最多 64 个字段。标题和字段名称最多 180 字节，占位文案最多 1000 字节；enabled 必须为布尔值。label 中的 {value} 以当前已授权的纯文本值替换；受保护字段不代入原始值，只渲染既有查看条件。整体与字段开关同时作用于主卡和右侧速览，已打开详情页无需重新进入即可热更新；不会因为关闭展示而改写帖子数据或权限。

### 2.2.7 部署步骤

1. 备份 admin_dashboard.php、layout_config.php、config_store.php、admin_actions.php、公开配置和旧更新清单。
2. 同步四个服务端文件，并保留上版 content_renderer.php/content_labels.json 及其依赖。游戏字段默认值会在读取时补齐；后台保存时写入现有 desktop_config。
3. 管理后台打开“游戏信息”，检查默认字段、标题与占位；按实际论坛的 identifier 添加自定义字段。游戏信息配置仅管理分类字段，不能把普通正文文本自动当作分类信息。
4. 以 375px、390px 检查十页导航、字段和按钮；实体 iPhone 上补查 Safari 聚焦行为。
5. 运行客户端 2.2.7，检查右侧下载定位与配置同步，再发布安装包/blockmap/源码；完整校验通过后替换 latest.yml 和后台版本。

验收使用真实帖子检查下载、空分类与原生正文；字段名称/隐藏/排序/保护提示用本地响应替身配合后台私有配置预览，未公开发测试帖，也未把测试字段写进生产配置。

### 2026-10-16 内容页调整

按最新界面要求，封面下方快捷操作区整排移除，简介卡紧随封面。作者栏分享/复制和右侧下载引导保留。版本保持2.2.7，已安装同号旧包需手动下载覆盖安装。

### 2026-10-16 发布站迁移

下载与更新统一使用 https://www.z19m.com/download/desktop/；官网后台为 https://www.z19m.com/admin/，源码不含管理凭据。安装包文件名改为 ZO-Forum-Setup-2.2.7.exe（客户端显示名仍为ZO论坛盒子），源码为 ZO-Forum-Source-2.2.7.zip。旧更新地址在新客户端规范化为新站地址；新域名仅用于下载/更新，不放宽论坛登录/API的可信域。

已安装旧2.2.7的用户需从新官网手动下载安装，以切换到新更新源。原安装包MD5/SHA256不适用于此次重新构建，请使用新站页面展示的值。以后禁止向旧下载站上传任何新构建；发布须先验证文件完整，再切换latest.yml、官网记录和论坛客户端配置。

## 14. Linux x64 构建、安装与更新（2.2.7 首发测试版）

提供 `.deb` 和 `.tar.gz`，目标为 Ubuntu 22.04+/Debian 12+ x86_64 桌面环境，不支持 ARM。本次在 Windows 交叉构建，已核对 Linux ELF、包结构、执行权限、源文件和共享界面，但尚未完成 Linux 实机启动验收。请先在测试机验证登录、下载、窗口、托盘与退出行为。

### 从源码构建

需要 Node.js/npm、Python 3，以及能下载 Electron Linux 运行时的网络。在 `client` 目录执行：

```sh
npm ci
npm run build:linux
npm run package:linux
```

第一步构建生成 `dist-linux/linux-unpacked/`，第二步由 `scripts/package-linux.py` 生成 `.deb`、`.tar.gz`、安装说明、校验值和 `latest-linux.yml`。Windows 可把最后一步替换为 `python scripts/package-linux.py`。不依赖本机 dpkg，也不生成 AppImage。本次正式产物放在维护者的 `dist-v227-linux/`，重建不保证逐字节相同。

### 安装与运行

下载官网 `.deb`，在所在目录执行：

```sh
sudo apt install ./ZO-Forum-2.2.7-linux-x64.deb
zo-forum-desktop
```

使用普通用户启动。便携包先解压，阅读包内 INSTALL 文档，再运行 `./start.sh`；宿主机仍需安装 GTK3/NSS/ALSA 等依赖。不要通过禁用 Chromium 沙箱解决权限问题。`.deb` 将应用安装到 `/opt/zo-forum-desktop`，只为应用自带 `chrome-sandbox` 配置所需权限；卸载使用 `sudo apt remove zo-forum-desktop`。

Linux 默认关闭后台运行，确认桌面托盘支持后可自行开启。Wayland 桌面可能需要 XWayland。依赖与详细运行要求见发布目录中的 `INSTALL-LINUX-2.2.7.md`。

### 官网和更新通道对接

Linux 独立读取 `https://www.z19m.com/download/desktop/latest-linux.yml`，其中 `version` 为版本号，`path` 为同目录 `.deb` 文件名，`sha512`/`size` 必须与产物一致。Linux 更新打开官网包链接后由用户手动安装；不会读取 Windows 安装包或执行 EXE。Windows 继续使用 `latest.yml`，两平台可同时保持最新版。

发布顺序：上传包和校验文件并完整回下载核对 SHA256，然后发布对应平台清单，再登记官网“下载管理”和“公告新闻 → 版本发布”。官网数据库原先的 `zo_downloads.version` 唯一索引需要改为普通索引，以允许多个平台和包格式共用同一版本号；下载后台的最新版切换必须限定同一 `platform`，默认首页与默认 latest API 保留 Windows，Linux 使用 `api/latest.php?platform=linux`。修改前备份数据库和网站文件。

此源码包不包含官网独立站源码、管理凭据或生产数据库；官网管理员应按上述规则适配现有站点。论坛接口仍沿用 README 前文的对接方式，勿将下载站作为论坛认证接口。
