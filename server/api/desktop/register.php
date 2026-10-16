<?php
/**
 * 桌面端注册接口
 * POST: username, password, password_confirm, email, agreement
 */
error_reporting(0);
ini_set('display_errors', 0);

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

if (!desktop_client_control_enabled('auth', 'register_enabled')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => desktop_client_control_message()], JSON_UNESCAPED_UNICODE);
    exit;
}

// 仅引入 UCenter 客户端
if(desktop_client_control_enabled('auth','captcha_enabled',false)){http_response_code(403);echo json_encode(['status'=>'error','message'=>'请在论坛注册窗口完成原生验证码验证。'],JSON_UNESCAPED_UNICODE);exit;}
define('IN_UC', true);
require_once __DIR__ . '/../../uc_client/client.php';

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';
$passwordConfirm = $_POST['password_confirm'] ?? '';
$email = trim($_POST['email'] ?? '');
$agreement = ($_POST['agreement'] ?? '') === '1';

if (empty($username) || empty($password) || empty($email)) {
    echo json_encode(['status' => 'error', 'message' => '用户名、密码和邮箱不能为空'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (mb_strlen($username, 'UTF-8') < 3 || mb_strlen($username, 'UTF-8') > 15 || preg_match('/[\s<>"\']/u', $username)) {
    echo json_encode(['status' => 'error', 'message' => '用户名应为3-15个字符，且不能包含空格或特殊符号'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 120) {
    echo json_encode(['status' => 'error', 'message' => '请输入有效的邮箱地址'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (strlen($password) < 8 || strlen($password) > 64) {
    echo json_encode(['status' => 'error', 'message' => '密码长度应为8-64位'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
    echo json_encode(['status' => 'error', 'message' => '密码必须同时包含字母和数字'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!hash_equals($password, $passwordConfirm)) {
    echo json_encode(['status' => 'error', 'message' => '两次输入的密码不一致'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!$agreement) {
    echo json_encode(['status' => 'error', 'message' => '请先同意用户协议和隐私规则'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $ratePdo = desktop_get_pdo();
    $memberTable = desktop_table('common_member');
    $statusTable = desktop_table('common_member_status');
    $rateStmt = $ratePdo->prepare("SELECT COUNT(*) FROM {$memberTable} m INNER JOIN {$statusTable} s ON s.uid = m.uid WHERE s.regip = ? AND m.regdate >= ?");
    $rateStmt->execute([$_SERVER['REMOTE_ADDR'] ?? '0.0.0.0', time() - 3600]);
    if (intval($rateStmt->fetchColumn()) >= 3) {
        http_response_code(429);
        echo json_encode(['status' => 'error', 'message' => '注册操作过于频繁，请一小时后再试'], JSON_UNESCAPED_UNICODE);
        exit;
    }
} catch (Exception $e) {
    error_log($e->getMessage());
}

$uid = uc_user_register($username, $password, $email);

if ($uid <= 0) {
    if ($uid == -1) {
        echo json_encode(['status' => 'error', 'message' => '用户名不合法'], JSON_UNESCAPED_UNICODE);
    } elseif ($uid == -2) {
        echo json_encode(['status' => 'error', 'message' => '用户名包含不允许注册的词语'], JSON_UNESCAPED_UNICODE);
    } elseif ($uid == -3) {
        echo json_encode(['status' => 'error', 'message' => '用户名已经存在'], JSON_UNESCAPED_UNICODE);
    } elseif ($uid == -4) {
        echo json_encode(['status' => 'error', 'message' => '邮箱不合法'], JSON_UNESCAPED_UNICODE);
    } elseif ($uid == -5) {
        echo json_encode(['status' => 'error', 'message' => '邮箱不允许注册'], JSON_UNESCAPED_UNICODE);
    } elseif ($uid == -6) {
        echo json_encode(['status' => 'error', 'message' => '该邮箱已经注册'], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(['status' => 'error', 'message' => '未知错误'], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// 注册成功：写入 Discuz session 并设置 cookie（自动登录）
try {
    $pdo = desktop_get_pdo();
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    // Discuz 论坛侧不保存 UCenter 明文密码；使用独立随机占位散列。
    $forumPassword = md5(random_bytes(32));
    $member = desktop_ensure_member_synced($pdo, $uid, $username, $forumPassword, $email, $ip, 0);
    $session = desktop_create_session($pdo, $uid, $member['username'], $member['groupid'], $ip);
    $sid = $session['sid'];
    $timestamp = $session['timestamp'];

    desktop_set_auth_cookies($sid, $uid, $timestamp + 86400 * 30);

    echo json_encode([
        'status' => 'success',
        'message' => '注册成功',
        'uid' => $uid,
        'username' => $member['username'],
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    error_log($e->getMessage());
    if (function_exists('uc_user_delete')) {
        uc_user_delete($uid);
    }
    echo json_encode(['status' => 'error', 'message' => '注册未完成，请稍后重试'], JSON_UNESCAPED_UNICODE);
}
