<?php
if (isset($_POST['password']) && !isset($_POST['code'])) {
    require_once __DIR__ . '/client_control.php';
    $config = desktop_client_control_config();
    if (!desktop_client_control_enabled('auth', 'sms_enabled', false) || !in_array('password', $config['auth']['sms_login_modes'] ?? [], true)) {
        http_response_code(403); header('Content-Type: application/json'); echo json_encode(['code' => 2003, 'msg' => '手机号密码登录未开启', 'status' => 'error', 'message' => '手机号密码登录未开启'], JSON_UNESCAPED_UNICODE); exit;
    }
    $_POST['username'] = $_POST['mobile'] ?? '';
    require __DIR__ . '/login.php';
    exit;
}
define('DESKTOP_SMS_ACTION', 'login');
require __DIR__ . '/sms_adapter.php';
