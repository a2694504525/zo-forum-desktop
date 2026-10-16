<?php
/**
 * 将 QQ 互联完成后的 Discuz 登录态转换为桌面客户端 sid 会话。
 */
define('APPTYPEID', 0);
define('CURSCRIPT', 'api');

ob_start();
require_once __DIR__ . '/../../source/class/class_core.php';

$discuz = discuz_application::instance();
$discuz->init();
ob_end_clean();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/member_sync.php';
require_once __DIR__ . '/client_control.php';

if (!desktop_client_control_enabled('auth', 'qq_login_enabled')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => desktop_client_control_message()], JSON_UNESCAPED_UNICODE);
    exit;
}

// 桌面授权窗口返回论坛页后，可携带页面上的 uid 与 Discuz formhash。
// formhash 与用户、站点密钥及 saltkey Cookie 绑定，校验通过后才能签发桌面会话。
if ((empty($_G['uid']) || empty($_G['member']['uid'])) && !empty($_GET['desktop_uid']) && !empty($_GET['desktop_formhash'])) {
    $desktopUid = intval($_GET['desktop_uid']);
    $desktopFormhash = strtolower(trim((string) $_GET['desktop_formhash']));
    if ($desktopUid > 0 && preg_match('/^[a-f0-9]{8}$/', $desktopFormhash)) {
        try {
            $desktopPdo = desktop_get_pdo();
            $desktopMember = desktop_fetch_member($desktopPdo, $desktopUid);
            if ($desktopMember) {
                $timeBucket = substr((string) TIMESTAMP, 0, -7);
                $expectedFormhash = substr(md5($timeBucket . $desktopMember['username'] . $desktopUid . $_G['authkey']), 8, 8);
                if (hash_equals($expectedFormhash, $desktopFormhash)) {
                    $_G['uid'] = $desktopUid;
                    $_G['member'] = array_merge($_G['member'] ?? [], $desktopMember);
                }
            }
        } catch (Throwable $error) {
            error_log('desktop qq formhash bridge: ' . $error->getMessage());
        }
    }
}

if (empty($_G['uid']) || empty($_G['member']['uid'])) {
    http_response_code(401);
    echo json_encode([
        'status' => 'pending',
        'message' => 'QQ 登录尚未完成',
        'api_version' => '2.0.14',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $uid = intval($_G['uid']);
    $pdo = desktop_get_pdo();
    $member = desktop_fetch_member($pdo, $uid);
    if (!$member) {
        throw new RuntimeException('论坛用户不存在');
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    // QQ 回调已经由 Discuz 创建了当前论坛会话。优先复用它，避免在同一请求中
    // 删除并重建 common_session，和 Discuz 请求结束时的会话写入发生冲突。
    $sid = isset($_G['sid']) ? trim((string) $_G['sid']) : '';
    if (!preg_match('/^[A-Za-z0-9]{6}$/', $sid)) {
        $session = desktop_create_session($pdo, $uid, $member['username'], intval($member['groupid']), $ip);
        $sid = $session['sid'];
        $timestamp = $session['timestamp'];
    } else {
        $timestamp = time();
    }
    desktop_set_auth_cookies($sid, $uid, $timestamp + 86400 * 30);

    echo json_encode([
        'status' => 'success',
        'message' => 'QQ 登录状态已同步',
        'api_version' => '2.0.14',
        'data' => ['uid' => $uid, 'username' => $member['username'], 'sid' => $sid],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    error_log('desktop qq session: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'QQ 登录状态同步失败',
        'api_version' => '2.0.14',
    ], JSON_UNESCAPED_UNICODE);
}
