# 客户端与后台接口对接

默认论坛源为 `https://www.zozse.cn`，桌面接口基址为 `/api/desktop`，更新文件源为 `https://www.z19m.com/download/desktop/`。前者来自 `client/renderer/api.js`，后者来自 `client/package.json` 与 `client/config-schema.js`。换站须同步修改 README 第 4 节的信任规则。

## 环境与配置

项目没有定义必须填写的 `.env` 环境变量，也不自带独立 HTTP 服务监听端口。Electron 使用 HTTPS 访问现有论坛；PHP 接口由论坛 Web 服务器处理。数据库读取论坛根目录 `config/config_global.php`，UCenter 读取 `config/config_ucenter.php`，这些含秘密的文件不在仓库内。

构建可选环境变量 `ELECTRON_MIRROR` 和 `ELECTRON_BUILDER_BINARIES_MIRROR` 用于 Electron/构建工具下载镜像，见 `client/package.json` 和 README。可公开的客户端配置以 `server/api/desktop/client_config.example.json` 为起点，实际配置不提交 Git。

## 会话和响应

`client/renderer/api.js` 经 Electron 的 `siteRequest` 桥发送请求；`client/main.js` 使用 Electron 会话 Cookie。渲染进程不保存真实 sid。`server/api/desktop/common.php` 的 `current_user()` 优先读取 Discuz sid Cookie，也兼容 `Authorization: Bearer <sid>`，并可验证原生 Discuz auth Cookie。管理员接口还校验管理员身份、Origin 和 `formhash`，普通客户端请求桥禁止调用管理接口。

`common.php::json_out()` 的公共响应包含 `status`、`message`、`code`、`msg`，有数据时包含 `data`；成功 `code=0`，该输出函数的业务失败 `code=2001`。HTTP 状态与业务 code 应分别检查；各独立端点也可能有自己的错误处理。

## 可从代码核对的请求

| 端点 | 方法与字段 | 源码 |
| --- | --- | --- |
| `client_config.php` | GET，公开客户端配置；管理员预览可带 `preview` | `server/api/desktop/client_config.php` |
| `latest.php` | GET：`page` 默认 1；`perpage` 默认 30、范围 1–50，兼容 `count/limit`；`orderby=replies`、`view=newthread` 或 `sort=dateline`；`filter` 可选 `digest/sticky/featured`；`forum_ids`（兼容 `fid`）为逗号分隔版块 ID | `server/api/desktop/latest.php` |
| `thread.php` | GET：`tid` 必填正整数；`page` 默认 1，每页 20 条 | `server/api/desktop/thread.php` |
| `login.php` | POST 表单：`username`、`password`；验证码启用时要求原生网页验证 | `server/api/desktop/login.php` |
| `admin.php?action=get_overview` | GET，管理员读取配置与 `formhash` | `server/api/desktop/admin_actions.php` |
| `admin.php?action=save` | POST JSON：`config`、`formhash`，建议带 `expected_revision` | 同上 |

请求示例（不含真实用户资料）：

```http
GET /api/desktop/latest.php?page=1&perpage=10
```

该端点成功结构为 `{"status":"success","message":"ok","code":0,"msg":"ok","data":[],"sort":"lastpost","page":1,"perpage":10,"total":0,"total_page":0}`；这里的空列表和数量仅用于展示无帖子时的响应形状，不是线上结果。真实条目字段由 `latest.php` 的 `$threads[]` 定义。

```javascript
const form = new URLSearchParams({username: 'YOUR_USERNAME', password: 'YOUR_PASSWORD'});
// 在可信的 Electron 请求桥中使用同一会话发起请求，禁止将凭据写入仓库或日志。
const request = {url: 'https://YOUR_FORUM/api/desktop/login.php', method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
  body: form.toString()};
```

登录成功后的实际字段和 Cookie 行为见 `login.php`；管理配置、导航、公告、短信与 QQ 的详细契约和联调步骤见 README 第 4–6 节。

## 错误与联调

`require_login()` 未登录返回 HTTP 401；帖子不存在返回 404；登录方法错误返回 405。管理接口常见 400（配置不合法）、403（身份/表单/Origin 不合法）、405（方法错误）、409（修订冲突）、503（配置存储不可用），以各端点与 `config_contract.php` 实现为准。

先在自有论坛验证网页登录及插件，再部署接口和配置样例；检查公开配置、最新帖子及错误 JSON；随后用测试账号验证同会话登录、受限内容、管理员保存与客户端配置同步。不要使用原站账号、生产配置或真实短信验证码作为公共示例。
