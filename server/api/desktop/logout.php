<?php
/**
 * 桌面端退出登录
 */
require_once __DIR__ . '/common.php';

$cookiepre = cookie_pre();
$cookiedomain = $_config['cookie']['cookiedomain'] ?? '';
$cookiepath = $_config['cookie']['cookiepath'] ?? '/';
$user = current_user();
$sid = $user['sid'] ?? ($_COOKIE[$cookiepre . 'sid'] ?? '');

// 清除服务端 session
if ($sid) {
    try {
        $pdo = get_pdo();
        $pdo->prepare("DELETE FROM " . table('common_session') . " WHERE sid = ?")->execute([$sid]);
    } catch (Exception $e) {
        // ignore
    }
}

// 清除 cookie
setcookie($cookiepre . 'sid', '', time() - 3600, $cookiepath, $cookiedomain);
setcookie($cookiepre . 'uid', '', time() - 3600, $cookiepath, $cookiedomain);
setcookie($cookiepre . 'auth', '', time() - 3600, $cookiepath, $cookiedomain);

echo json_encode(['status' => 'success', 'message' => '已退出登录'], JSON_UNESCAPED_UNICODE);
