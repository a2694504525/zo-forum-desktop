# ZO 论坛盒子 2.2.7

> **本项目版权归 ZO论坛(www.zozse.cn、www.z19m.com)所有。版权归 ZO论坛所有。**
>
> 官网：[www.zozse.cn](https://www.zozse.cn) · [www.z19m.com](https://www.z19m.com)
>
> 本项目自行编写的代码按 [MIT](LICENSE) 授权，允许使用、修改、商用和闭源衍生，分发时须保留版权和许可声明；MIT 不要求公开衍生源码。相较 Apache-2.0，MIT 更简洁但没有同样的明确专利授权条款；相较 GPL-3.0，MIT 不要求衍生作品采用相同许可证。第三方组件、品牌、图标、论坛内容和商业插件仍适用其各自权利及许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。软件按现状提供，不提供适销性、特定用途适用性等保证，责任限制以 LICENSE 为准。


基于 Electron 的 Discuz 论坛桌面客户端，提供帖子浏览、论坛账号登录、QQ 授权、短信认证、个人中心，以及由管理员实时控制的导航、主题、运行状态和三种公告。

本仓库包含完整客户端源码和本项目编写的 Discuz 桌面 API。**不包含 Discuz 主程序、UCenter、商业插件、服务器配置、数据库、登录会话或生产账号凭据。** 这些依赖须由论坛运营者自行安装并取得使用授权。

代码使用 MIT 许可证。DOMPurify 和 Electron 等第三方组件适用各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。ZO 名称、图标及站点内容的使用不构成对品牌或论坛资源的额外授权。

## 1. 本版功能与范围

- 首页默认按最后回复时间 `lastpost DESC, tid DESC` 排序，板块置顶优先后按最后回复时间排序；热门按回复数再按最后回复时间。普通搜索按最后回复时间排序。
- 后台配置通过 `client_config.php` 下发，主进程每 2 秒刷新并向主窗口、登录窗口推送变化。
- 管理页分为基础设置、登录注册、功能开关、导航、主题、公告、运行状态、版本更新八组。
- 支持居中公告、首页公告条和右下角悬浮公告；后两者独立显示，支持时间窗、关闭、内容更新后重现。
- 右下角公告支持自动隐藏，重复拉取同一版本不会重新计时或闪烁。
- 登录总开关、密码、短信各用途、QQ、注册及手机绑定入口遵从后台配置。
- 回复、下载、勋章、任务、签到入口、个人资料保存和深浅模式有配置守卫。
- 签到使用论坛原生插件页面；图形/行为验证码使用论坛原生登录窗口，不在桌面端伪造验证码校验。
- 二周年庆客户端模块已移除，公开配置不输出 `anniversary` 和 `i18n`。
- 客户端已移除 AI 页面、导航和调用；独立 AI 服务未作修改。

## 2. 目录

```text
.
├── README.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── SECURITY.md
├── CHANGELOG.md
├── .gitignore
├── client/
│   ├── package.json / package-lock.json
│   ├── main.js                 # 窗口、会话、请求桥、更新、配置轮询
│   ├── preload.js              # 有限 IPC 接口
│   ├── security.js             # 地址、方法及功能白名单
│   ├── config-schema.js        # 客户端配置规范化
│   ├── renderer/
│   │   ├── index.html / auth.html
│   │   ├── app.js / api.js
│   │   ├── runtime.js          # 运行状态、主题、居中公告
│   │   ├── dynamic-ui.js/css   # 导航、功能入口、首页/悬浮公告
│   │   ├── auth.js / sms-auth.js
│   │   └── modules/            # 按业务拆分的页面与 API 模块
│   └── tests/
├── server/api/desktop/         # 部署到论坛同名目录
│   ├── common.php
│   ├── config_store.php / config_contract.php / config_v22.php
│   ├── admin.php / admin_dashboard.php / admin_actions.php / admin_auth.php
│   ├── client_config.php / client_control.php
│   ├── client_config.example.json
│   ├── latest.php / forums.php / thread.php / search.php
│   └── 登录、短信、用户、通知及发帖接口
└── third-party-licenses/       # 随附组件许可文本
```

`node_modules`、Electron 二进制、安装包、源码包、测试账号目录及真实 `client_config.json` 不属于源码仓库。执行 `npm ci` 恢复锁定版本依赖。

## 3. 开发环境与启动

验证环境：Windows 10 x64、Node.js 24.19.0、Electron 43.0.0。服务端语法检查使用 PHP 8.5.11；生产环境必须支持 PDO MySQL、JSON 和 Discuz 的既有运行依赖。建议在测试站先验证 PHP/Discuz/插件版本的兼容性。

```powershell
cd client
npm ci
npm test
npm start
```

Electron 包含独立 Chromium 和 Node 运行时。安装时网络须能访问 npm 和 Electron 下载源。网络受限时可设置项目 `package.json` 中提供的镜像，或设置：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm ci
```

开发模式同样会连接配置中的论坛地址。操作真实账号前请先使用测试站和测试账号；不需要登录即可浏览公开首页。

## 4. 从零对接自己的 Discuz 论坛

### 4.1 安装论坛依赖

1. 安装并正常运行 Discuz X 与 UCenter，确保网页登录、退出、发帖、附件权限和 Cookie 域配置可用。
2. 确认论坛根目录已有 `config/config_global.php`、`config/config_ucenter.php`、`source/` 和 `uc_client/`。
3. PHP 启用 PDO MySQL。数据库配置沿用 Discuz 自己的配置，桌面 API 不需要另填数据库密码。
4. 准备一个具有管理员角色的论坛账号；普通会员或活动特殊用户组不能进入客户端管理后台。
5. QQ 登录须先在论坛网页中正确完成互联插件配置。短信须安装并配置可用的 `comiis_sms` 插件及短信服务商；插件源码和服务商凭据不在此仓库。

### 4.2 修改默认域名（必须同时修改信任规则）

本项目默认对接 ZO 站点。换站不能只更改一个显示地址，否则主进程会拒绝未受信任的请求。

需要核对以下位置：

| 文件 | 修改内容 |
| --- | --- |
| `client/main.js` | `SITE_URL`、`CLIENT_CONFIG_URL`、默认更新源、站内窗口地址检查、QQ 回调域名 |
| `client/security.js` | `permittedRequest()` 的精确论坛源；`safeHeaders()` 的 Referer |
| `client/config-schema.js` | 应用地址和更新源的域名白名单及默认更新源 |
| `client/renderer/api.js` | `SITE_BASE`、`API_BASE` |
| `client/renderer/runtime.js` | `safeSite()` 允许的站点源 |
| `client/renderer/auth.js`、`sms-auth.js` | 原生登录、注册、短信找回、绑定窗口地址 |
| `client/renderer/index.html` | CSP 的 `connect-src` 论坛源 |
| `client/package.json` | `appId`、名称、作者、图标、更新源 URL |
| `server/api/desktop/common.php` | CORS 来源域名 |
| `server/api/desktop/config_store.php` | `desktop_config_url()` 的受信任配置域名 |
| `server/api/desktop/admin_auth.php` | 管理写入允许的 Origin |
| `server/api/desktop/config_v22.php` | 应用和站点默认地址 |
| `server/api/desktop/client_config.example.json` | 你的站点、API、图床和更新目录 |

用下面的搜索检查遗漏，逐项确认用途，不要把请求白名单改成“允许所有域名”：

```powershell
rg -n 'zozse\.cn|zoscloud\.cn' client server
```

公告和外链导航可以跳到普通 HTTP/HTTPS 网站，但仅通过系统浏览器打开。它们不能扩大登录 Cookie 或桌面 API 请求桥的受信任范围。`javascript:`、`file:` 等协议和含用户名密码的 URL 会被拒绝。

### 4.3 部署 API 文件

将 `server/api/desktop/` 中的项目 PHP 文件复制到：

```text
你的论坛根目录/api/desktop/
```

不要把整个 `server/` 目录放进 `api/desktop`；部署后应能访问 `/api/desktop/client_config.php`。

将 `client_config.example.json` 复制为 `client_config.json`，按实际情况填写地址及版本。生产配置不应提交到 Git。

论坛数据库表名前缀从 Discuz 配置读取，不要求必须是 `pre_`。配置表由管理员首次保存时创建，结构为：

```sql
CREATE TABLE <论坛前缀>desktop_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

配置按分组存储 JSON，另有 `__revision` 行用于并发修改校验。首次创建需要论坛数据库用户拥有该配置表的建表权限；后续保存需要相应读写权限。此操作针对客户端配置表，不重建 Discuz 业务表。

### 4.4 初始化后台

1. 在系统浏览器登录论坛管理员账号。
2. 打开 `https://你的论坛/api/desktop/admin.php`。
3. 核对基础设置、登录注册、功能、导航、主题、公告、运行状态和版本八组。
4. 保存一组配置，完成首次配置表初始化与旧配置迁移。
5. 访问 `client_config.php`，确认 `status=success`，包含 `home_notices`、`floating_notices`，不包含已删除字段。
6. 启动客户端，确认配置同步正常。

后台身份校验依据经过验证的 Discuz 登录态和管理员角色；所有保存请求还需原生 `formhash` 校验。不要为了处理 403 而跳过身份校验、把任意用户组改为管理员，或硬编码 UID。

### 4.5 文件权限与访问限制

API 需要写入配置镜像、30 秒配置缓存和管理员预览临时文件；保证相应目录仅按部署需要可写。

- `client_config.json` 只含可公开的客户端配置，不能存数据库密码或 API key。
- `client_config.cache.php` 和管理员预览文件带退出保护。
- 在 Web 服务器层禁止访问 `api_error.log`、临时文件和备份目录，关闭目录索引。
- 不要把 `config_global.php`、`config_ucenter.php`、FTP 密码或生产数据库导出放入源码仓库。

## 5. 配置与客户端接口对接

### 5.1 公共配置

```http
GET /api/desktop/client_config.php
```

```json
{"status":"success","message":"ok","code":0,"msg":"ok","data":{"latest_version":"2.2.7","home_notices":[],"floating_notices":[]}}
```

实际 `data` 还包含 `app`、`auth`、`features`、`navigation`、`theme`、`run_state`、公告和版本配置。客户端只消费可识别字段；新字段对旧客户端保持兼容。

主进程约每 2 秒拉取，变化时通过 `client-config` IPC 推送。公开端缓存最多 30 秒；后台保存后立即清除缓存。网络失败时保留当前界面和已有配置，继续重试。首次离线时使用静态八项导航及默认配色。

### 5.2 管理 API

管理接口：`/api/desktop/admin.php?action=<action>`。GET 请求包括：

| action | 返回 |
| --- | --- |
| `get` / `get_overview` | 完整 `config`、`formhash`、是否需要初始化 |
| `get_auth` / `get_features` | 登录或功能分组、`formhash`、版本修订值 |
| `get_navigation` / `get_theme` | 导航或主题分组 |
| `get_home_notices` / `get_floating` | 公告条或悬浮公告列表 |

保存全部配置：

```javascript
const base = '/api/desktop/admin.php?action=';
const overview = await (await fetch(base + 'get_overview', {
  credentials: 'same-origin'
})).json();
const data = overview.data;
const response = await fetch(base + 'save', {
  method: 'POST', credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    formhash: data.formhash,
    expected_revision: data.config._revision,
    config: {...data.config, theme: {...data.config.theme, default: 'purple'}}
  })
});
const result = await response.json();
```

分组保存的 POST action 为 `save_auth`、`save_features`、`save_navigation`、`save_theme`、`save_home_notices`、`save_floating`。请求字段 `config` 为对应分组对象或列表，还需 `formhash`；建议附带 `expected_revision` 防止覆盖其他管理员的修改。

```json
{"formhash":"由GET返回","expected_revision":"由GET返回","config":{"default":"purple","available":["purple"],"allow_user_change":false,"appearance":"system"}}
```

读操作不能用于保存。无有效管理员身份返回 403，缺少/错误表单校验返回 403，方法错误返回 405，配置错误返回 400，并发冲突返回 409。客户端普通请求桥不允许访问管理 API。

### 5.3 导航

```json
{"items":[
  {"id":"home","page":"home","label":"首页","enabled":true},
  {"id":"help","label":"帮助","url":"https://example.com/help","enabled":true}
],"order":["home","help"]}
```

内置页面为 `home`、`forums`、`search`、`notifications`、`profile`、`medals`、`tasks`、`settings`。外链项目填写 HTTP/HTTPS `url`，通过 `openExternal` 打开。空 `items` 使用默认八项；非空列表只显示启用的配置项。后台有上移/下移按钮调整顺序。

### 5.4 首页和悬浮公告

```json
{"id":"welcome-001","title":"更新提示","content":"第一行\n第二行","icon":"📢","link":"https://example.com/","button_text":"查看详情","bg_color":"#E8F3FF","text_color":"#233047","enabled":true,"start_at":"","end_at":"","updated_at":1760000000,"dismissible":true,"auto_hide":0,"position":"bottom-right"}
```

- `home_notices` 占首页帖子列表上方的布局空间；`floating_notices` 固定在窗口右下角。
- 每类最多 50 条，同类同时只显示有效时间窗内最新的那条，按 `updated_at` 优先、数组顺序作为同时间的补充。
- 内容、标题、按钮文字用 `textContent` 渲染，不解释 HTML。
- 颜色只接受 `#RRGGBB`；链接仅 HTTP/HTTPS。
- 时间不带时区时客户端按北京时间处理；建议统一填写 `YYYY-MM-DDTHH:mm:ss` 或显式 `+08:00`。
- 保存改变公告内容时服务端会更新 `updated_at`，关闭的旧版本可重新出现。
- `dismissible=false` 隐藏关闭按钮。悬浮公告的 `auto_hide` 为秒，0 表示常驻；自动隐藏后同版本不会因刷新重现。
- 两个列表可分别清空、关闭或设置过期时间。

居中公告使用 `announcements` 列表，ID 用于持久去重。旧 `announcement` 单条字段用于兼容旧客户端；后台居中公告列表保存时同步兼容字段。三种公告的状态彼此独立。

### 5.5 登录、功能与运行状态

登录矩阵包括 `login_enabled`、`register_enabled`、`password_login_enabled`、`sms_enabled`、四个短信用途开关、`qq_login_enabled`、`captcha_enabled`、`bind_mobile_required` 和 `sms_login_modes`。短信服务商未配置时应保持短信总开关关闭；开启入口不会自动创建短信供应商账号。

验证码通过论坛原生页面验证。当 `captcha_enabled=true` 时，客户端账号密码登录和账号注册转到论坛对应窗口，直接 API 也会拒绝绕过原生验证。已登录会话不会仅因关闭登录入口而被退出。

功能开关分别控制对应入口。托盘与崩溃上报的实验性字段未在本版管理界面公开，避免把未完成的能力作为站长可用功能。签到依赖论坛原生签到插件，任务和勋章依赖论坛已有配置。

```json
{"mode":"maintenance","can_run":true,"action":"lock","message":"维护中","close_reason":"","resume_at":"","link":"","check_interval":600}
```

运行模式为 `normal/maintenance/disabled`，处理方式为 `notice/lock/exit`。维护限制写操作，退出动作由主进程执行。恢复正常后移除提示/锁定层。控制刷新节奏由主进程的 `control_poll_seconds`（2–3 秒）决定，不依赖用户触发检查更新。

## 6. 短信、QQ 与原生页面对接

### 短信

`sms_config.php` 提供插件能力；`sms_send.php` 按 `type=login/register/reset/bind` 发送；对应的 `sms_login.php`、`sms_register.php`、`sms_reset.php`、`sms_bind.php` 处理认证。

请求需要真实短信插件、论坛会话和插件自己的校验流程，不能用示例验证码绕过认证。发送接口会检查总开关和用途开关，登录/注册也检查各自总开关。验证码、手机号、Cookie、表单校验值不应进入公开日志或提交到 Git。

### QQ

客户端打开论坛已有 QQ 授权入口，用户在授权窗口登录，成功后同步 Discuz 会话。先验证论坛网页 QQ 登录，再调试客户端回调。修改站点域名时同时修改 QQ 应用后台允许的回调域名及客户端对回调域的检查。

### 原生个人功能

任务、勋章、个人资料和论坛认证复用原生页面/表单。不同 Discuz 主题或插件可能改变 HTML 结构，解析适配主要位于 `renderer/modules/api-profile.js`、`account-forms.js` 和页面业务模块。遇到结构差异先保留权限检查，再调整解析选择器，不能直接把后台接口加入普通请求白名单。

## 7. 构建 Windows 安装包与发布更新

```powershell
cd client
npm ci
npm test
npm run build
```

输出 `dist/` 下的 NSIS 安装包、`.blockmap` 和 `latest.yml`。默认安装器支持选择目录，不在构建时自动发布。

本项目当前为论坛分发的未签名安装包；若使用正式代码签名，应由发布者自行提供证书，并调整 `publisherName`、签名配置和更新签名校验设置。证书与私钥不应提交到仓库。

发布顺序：

1. 备份线上 PHP、数据库客户端配置和旧更新清单。
2. 部署服务器配置契约与后台，确认登录和公开读取。
3. 打包并验证客户端。
4. 上传 EXE、blockmap 和源码 ZIP。
5. 从 HTTPS 下载完整 EXE，比较 SHA-512 与本地及 `latest.yml` 的 base64 校验值。
6. 上传 `latest.yml`，再在后台同步最新版本、下载 URL、更新说明及最低版本。
7. 验证两个版本源一致，使用实际打包客户端检查更新。

不要先发布指向尚未上传完成安装包的清单。已有客户端升级必须增加版本号，不能只替换同名同版本 EXE。

## 8. 验证与回滚

基础测试：`cd client && npm test`。服务端写入策略的独立测试：`php server/tests/post-policy.php`，不会连接数据库或公开写入，覆盖发帖/回复开关、维护禁写和无效操作拒绝。PHP 语法检查示例：

```powershell
Get-ChildItem server/api/desktop -Filter *.php | ForEach-Object { php -l $_.FullName }
```

上线验证应覆盖密码/QQ/登录总开关、回复与下载、主题限制、导航外链、两种公告实时更新、关闭后更新重现、时间窗、自动隐藏、空配置、后台八组、更新链路与运行状态。

管理员可用 `test_start`（POST）创建独立配置预览，返回 `preview_token`；保存时携带该令牌，读取公共配置时加 `?preview=<令牌>`。预览绑定当前管理员，15 分钟过期。测试完成后 POST `test_end` 清理。预览内容不应对公共配置生效，令牌不能发布到日志或 Git。

排序可使用已有帖子、数据库事务和回滚验证，不需要公开发测试帖。真实短信和 QQ 授权需要有权使用的账号由人完成，不能在自动测试中代替用户授权。

回滚时恢复服务器文件及配置表中的旧值，再恢复旧 `latest.yml`；保留旧安装包。不要清空论坛数据库或覆盖用户表。移除的客户端二周年庆模块只涉及桌面端，本项目不会删除论坛网站上的活动业务数据。

## 9. 常见问题

| 问题 | 检查方式 |
| --- | --- |
| 后台 403 | 是否登录同域论坛管理员、Cookie 是否有效、角色是否真正具有后台权限 |
| 保存 403 | 重新读取 `formhash`；检查 Origin 和反向代理域名，勿取消校验 |
| 保存 409 | 配置已被其他操作更新，刷新后合并修改再保存 |
| 配置 503 | PDO MySQL、Discuz 配置路径、配置表权限、PHP 错误日志 |
| 接口返回 HTML | 地址或目录复制错误、代理路由、PHP 错误输出、WAF/网页登录重定向 |
| 短信入口消失 | 总开关、用途开关、插件能力返回是否全部可用 |
| 密码登录要求网页验证 | `captcha_enabled=true`，需在原生页面完成验证码 |
| 公告没有显示 | enabled、时间窗、ID/updated_at、是否已关闭该版本、公开端数据是否更新 |
| 悬浮公告自动隐藏后没重现 | 正常行为；修改内容并保存生成新版本，或更换 ID |
| 外链无效 | 只能 HTTP/HTTPS，不能使用文件路径、自定义协议或带凭据的 URL |
| 更新不提示 | 版本未递增、两个版本源不一致、清单路径或 HTTPS 下载失败 |
| 换站后请求被拒绝 | 同时修改第 4.2 节的域名白名单和 CSP，不能只改 API 地址 |

## 10. 发布 GitHub 仓库

解压源码包后，把包含本 README 的目录作为仓库根目录。先检查文件，再提交：

```powershell
git init
git add .
git status
git commit -m "Release ZO Forum Desktop 2.2.7"
git branch -M main
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

安装包上传 GitHub Releases，建议 tag `v2.2.7`；不要把 `node_modules`、证书、缓存和账号会话放进 Git。源码包包含 `.gitignore` 和 MIT 许可。发布前再次检查生产配置、短信服务商参数、UCenter 密钥和数据库凭据；本仓库中的样例不需要任何真实秘密。

对于自己部署的论坛，README 中的默认 ZO 站点地址只是原项目对接示例，应按第 4 节替换并独立测试。不要使用原站的生产配置或管理员账号作为自己的配置样例。

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


## 开源复核补充

接口与环境配置见 [API.md](API.md)，本次检查及人工确认事项见 [OPEN_SOURCE_CHECKLIST.md](OPEN_SOURCE_CHECKLIST.md)。

