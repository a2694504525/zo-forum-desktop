页面模块通过工厂接收共享 context，context 的状态 getter/setter 保持原请求序号和跨页面状态一致。app.js 只负责初始化与导航，模块不使用 eval 或新框架。
API bootstrap 保留会话 Cookie 网络桥与正文消毒；api-domains.js 安装各业务对象。主界面和认证页面均在启动前导入 api-domains.js，认证 Cookie 不进入渲染进程。
周年庆为独立模块，使用服务器配置与严格 act/method 白名单，写入携带服务器签发的 formhash（原活动 HMAC CSRF）。
