<?php
/**
 * 桌面端登录接口
 * POST: username, password
 */
error_reporting(0);
ini_set('display_errors', 0);
ob_start(function ($output) {
    $result = json_decode($output, true);
    if (!is_array($result)) return $output;
    $result['code'] = $result['status'] === 'success' ? 0 : 2001;
    $result['msg'] = $result['message'] ?? '';
    return json_encode($result, JSON_UNESCAPED_UNICODE);
});

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin && preg_match('#^https://([a-z0-9-]+\.)?zozse\.cn$#i', $requestOrigin)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => '请求方法不正确'], JSON_UNESCAPED_UNICODE);
    exit;
}

// 引入配置以定义 UC_API，否则 uc_client/client.php 会拒绝访问
require_once __DIR__ . '/../../config/config_ucenter.php';
require_once __DIR__ . '/../../config/config_global.php';
require_once __DIR__ . '/member_sync.php';
require_once __DIR__ . '/client_control.php';

if (!desktop_client_control_enabled('auth', 'login_enabled') || !desktop_client_control_enabled('auth', 'password_login_enabled')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => desktop_client_control_message()], JSON_UNESCAPED_UNICODE);
    exit;
}

// 仅引入 UCenter 客户端
if(desktop_client_control_enabled('auth','captcha_enabled',false)){http_response_code(403);echo json_encode(['status'=>'error','message'=>'请在论坛登录窗口完成原生验证码验证。'],JSON_UNESCAPED_UNICODE);exit;}
define('IN_UC', true);
require_once __DIR__ . '/../../uc_client/client.php';

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';

if (empty($username) || empty($password)) {
    echo json_encode(['status' => 'error', 'message' => '用户名和密码不能为空'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (preg_match('/^1\d{10}$/', $username)) {
    try {
        $phone = desktop_get_pdo()->prepare('SELECT m.username FROM ' . desktop_table('comiis_sms_user') . ' s JOIN ' . desktop_table('common_member') . ' m ON m.uid=s.uid WHERE s.tel=? LIMIT 2');
        $phone->execute([$username]);
        $accounts = $phone->fetchAll();
        if (count($accounts) === 1) $username = $accounts[0]['username'];
        elseif (count($accounts) > 1) { echo json_encode(['code' => 2001, 'msg' => '该手机号绑定多个账号，请使用用户名登录', 'status' => 'error', 'message' => '该手机号绑定多个账号，请使用用户名登录'], JSON_UNESCAPED_UNICODE); exit; }
    } catch (Exception $e) { /* Preserve numeric usernames when plugin is absent. */ }
}
list($uid, $username, $password, $email) = uc_user_login($username, $password);

if ($uid <= 0) {
    if ($uid == -1) {
        echo json_encode(['status' => 'error', 'message' => '用户不存在'], JSON_UNESCAPED_UNICODE);
    } elseif ($uid == -2) {
        echo json_encode(['status' => 'error', 'message' => '密码错误'], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(['status' => 'error', 'message' => '未知错误'], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// 登录成功：读取 Discuz 配置并写入 common_session，设置 sid cookie
try {
    $pdo = desktop_get_pdo();
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $member = desktop_ensure_member_synced($pdo, $uid, $username, $password, $email, $ip, 0);
    $session = desktop_create_session($pdo, $uid, $member['username'], $member['groupid'], $ip);
    $sid = $session['sid'];
    $timestamp = $session['timestamp'];

    desktop_set_auth_cookies($sid, $uid, $timestamp + 86400 * 30);

    echo json_encode([
        'status' => 'success',
        'message' => '登录成功',
        'uid' => $uid,
        'username' => $member['username'],
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    error_log($e->getMessage());
    echo json_encode(['status' => 'error', 'message' => '登录状态写入失败，请稍后重试'], JSON_UNESCAPED_UNICODE);
}
