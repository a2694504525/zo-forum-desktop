<?php
ini_set('display_errors', '0');
// Native comiis_sms owns validation, rate limits, UCenter and authentication cookies.
if (!defined('DESKTOP_SMS_ACTION')) { http_response_code(404); exit; }
function desktop_sms_json($code, $msg, $data = null) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['code' => $code, 'msg' => $msg, 'status' => $code === 0 ? 'success' : ($code === 202 ? 'pending' : 'error'), 'message' => $msg, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); desktop_sms_json(2001, '仅支持 POST'); }
if (isset($_POST['mobile']) && !is_string($_POST['mobile'])) desktop_sms_json(2001, '手机号参数格式错误');
$mobile = trim((string) ($_POST['mobile'] ?? ''));
if (!preg_match('/^1\d{10}$/', $mobile)) desktop_sms_json(2001, '请输入有效的11位手机号');
$operation = DESKTOP_SMS_ACTION;
$type = $operation === 'send' ? ($_POST['type'] ?? '') : $operation;
if (!is_string($type)) desktop_sms_json(2001, '短信用途参数格式错误');
$actions = ['register' => 'register', 'login' => 'login', 'reset' => 'lostpw', 'bind' => 'binding'];
if (!isset($actions[$type])) desktop_sms_json(2001, '无效的短信用途');
require_once __DIR__ . '/client_control.php';
if(($type==='login'&&!desktop_client_control_enabled('auth','login_enabled'))||($type==='register'&&!desktop_client_control_enabled('auth','register_enabled'))){http_response_code(403);desktop_sms_json(2003,desktop_client_control_message());}
if (!desktop_client_control_enabled('auth', 'sms_enabled', false)
    || !desktop_client_control_enabled('auth', $type === 'bind' ? 'sms_bind_enabled' : 'sms_' . $type . '_enabled', true)) {
    http_response_code(403); desktop_sms_json(2003, desktop_client_control_message());
}
$native = ['action' => $actions[$type], 'comiis_tel' => $mobile, 'inajax' => 1,
    'formhash' => (string) ($_POST['formhash'] ?? ''), 'referer' => './',
    'comiis_mobile_jms_submit'=>'mfnn','handlekey'=>'desktop_sms'];
foreach (['code', 'seccodeverify', 'seccodehash', 'seccodemodid', 'secanswer', 'secqaahash'] as $key) $native[$key] = (string) ($_POST[$key] ?? '');
if ($operation !== 'send' && !preg_match('/^\d{4,8}$/', $native['code'])) desktop_sms_json(2004, '验证码格式错误');
if ($type === 'register' && $operation !== 'send') {
    if (($_POST['agreement'] ?? '') !== '1') desktop_sms_json(2001, '请先同意用户协议');
    $native += ['comiis_smssubmit' => 'true', 'agreebbrule' => '1', 'name' => (string) ($_POST['username'] ?? ''),
        'password1' => (string) ($_POST['password'] ?? ''), 'password2' => (string) ($_POST['password'] ?? '')];
}
if ($type === 'login' && $operation !== 'send') $native['comiis_mobile_loginsubmit'] = 'true';
if ($type === 'bind' && $operation !== 'send') $native['comiis_mobile_bindingsubmit'] = 'true';
$stage = (int) ($_POST['stage'] ?? 0);
if ($type === 'reset' && $operation !== 'send') {
    if ($stage === 0) $native['comiis_mobile_lostpwsubmit'] = 'true';
    if ($stage === 2) $native += ['comiis_mobile_pwsubmit' => 'true', 'comiis_uidpassedit' => (int) ($_POST['uid'] ?? 0),
        'password1' => (string) ($_POST['new_password'] ?? ''), 'password2' => (string) ($_POST['new_password'] ?? '')];
}
// Do not let query parameters inject additional plugin operations or bypass captcha.
$_GET = $native;
$_POST = $native;
$_REQUEST = $native;
define('APPTYPEID', 0);
define('CURSCRIPT', 'plugin');
$_SERVER['HTTP_ACCEPT_ENCODING'] = 'identity';
$smsResult = null;
$_SERVER['DESKTOP_SMS_CONTEXT'] = ['operation' => $operation, 'type' => $type, 'stage' => $stage, 'mobile' => $mobile, 'result' => null];
ob_start(function ($html,$phase) use (&$smsResult, $operation, $type, $stage) {
    global $_G, $comiis_sms, $comiis_alluser;
    if (!headers_sent()) { header_remove('Location'); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); }
    if ($_SERVER['DESKTOP_SMS_CONTEXT']['result'] !== null) return json_encode($_SERVER['DESKTOP_SMS_CONTEXT']['result'], JSON_UNESCAPED_UNICODE);
    $code = 2004; $msg = '操作未完成，请在论坛网页继续'; $data = ['fallback_url' => 'https://www.zozse.cn/plugin.php?id=comiis_sms:comiis_login&action=login'];
    // AJAX templates may replace their output buffers; verify native state changes too.
    $context = $_SERVER['DESKTOP_SMS_CONTEXT'];
    if (isset($context['initial_uid']) && class_exists('DB', false)) {
        if ($operation === 'send') {
            $fresh = DB::fetch_first('SELECT id FROM %t WHERE tel=%s AND id>%d AND state=1 ORDER BY id DESC LIMIT 1', ['comiis_sms_temp',$context['mobile'],$context['temp_before']]);
            if ($fresh) { $code=0; $msg='验证码已发送'; $data=['retry_after'=>max(60,(int)($_G['cache']['plugin']['comiis_sms']['code_time'] ?? 60))]; }
        } elseif (in_array($type,['login','register'],true) && !$context['initial_uid'] && !empty($_G['uid'])) {
            $code=0; $msg='登录成功'; $data=['uid'=>(int)$_G['uid']];
        }
    }
    if ($code !== 0 && $operation === 'send' && preg_match('/comiis_mob_reg\|([^|<]+)\|([^<]*)/', $html, $m)) {
        $code = trim($m[1]) === '1' ? 0 : 2005;
        $msg = $code === 0 ? '验证码已发送' : trim(strip_tags($m[1]));
        $data = ['retry_after' => max(60, (int) $m[2])];
    } elseif ($code !== 0 && $operation !== 'send') {
        $key = ['register' => '88', 'login' => '75', 'bind' => '90', 'reset' => '97'][$type];
        if (!empty($comiis_sms[$key]) && strpos($html, $comiis_sms[$key]) !== false) {
            $code = 0; $msg = '操作成功'; $data = ['uid' => (int) ($_G['uid'] ?? 0)];
        } elseif ($type === 'reset' && $stage === 0 && !empty($comiis_sms['96']) && strpos($html, $comiis_sms['96']) !== false) {
            $code = 202; $msg = '验证码已校验'; $data = ['stage' => 1];
        } elseif ($type === 'reset' && $stage === 1 && !empty($comiis_alluser)) {
            $code = 202; $msg = '请选择要重置的账号'; $data = ['stage' => 2, 'accounts' => array_map(function ($u) { return ['uid' => (int) $u['uid'], 'username' => $u['username']]; }, $comiis_alluser)];
        } else {
            foreach (['86', '87', '82', '83', '84', '89', '95', '98'] as $key) {
                if (!empty($comiis_sms[$key]) && strpos($html, $comiis_sms[$key]) !== false) { $msg = strip_tags($comiis_sms[$key]); break; }
            }
            if (preg_match('/(?:showDialog\([\'\"]|<div[^>]+class=[\'\"]alert_(?:error|info)[^>]*>)([^<\'\"]+)/u', $html, $m)) $msg = trim($m[1]);
        }
    }
    if (preg_match('/验证码|安全验证|seccode|secqaa/iu', $msg)) { $data['fallback_url'] = 'https://www.zozse.cn/member.php?mod=register'; }
    if (!headers_sent()) { header_remove('Location'); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); }
    return json_encode(['code' => $code, 'msg' => $msg, 'status' => $code === 0 ? 'success' : ($code === 202 ? 'pending' : 'error'), 'message' => $msg, 'data' => $data], JSON_UNESCAPED_UNICODE);
});
require_once __DIR__ . '/../../source/class/class_core.php';
$discuz = C::app();
$discuz->init();
extract(array_intersect_key($_SERVER['DESKTOP_SMS_CONTEXT'], array_flip(['operation', 'type', 'stage', 'mobile'])));
loadcache('plugin');
if ($type === 'login' && empty($_G['cache']['plugin']['comiis_sms']['tel_reglogin'])) {
    $_SERVER['DESKTOP_SMS_CONTEXT']['result'] = ['code'=>2003,'msg'=>'论坛未启用短信验证码登录','status'=>'error','message'=>'论坛未启用短信验证码登录'];exit;
}
if (empty($_G['cache']['plugin']['comiis_sms'])) {
    $_SERVER['DESKTOP_SMS_CONTEXT']['result'] = ['code' => 2003, 'msg' => '短信插件未启用', 'status' => 'error', 'message' => '短信插件未启用']; exit;
}
if (empty($_GET['formhash']) || !hash_equals(FORMHASH, $_GET['formhash'])) {
    $_SERVER['DESKTOP_SMS_CONTEXT']['result'] = ['code' => 2003, 'msg' => '请求校验失败，请刷新后重试', 'status' => 'error', 'message' => '请求校验失败，请刷新后重试']; exit;
}
$_SERVER['DESKTOP_SMS_CONTEXT']['initial_uid'] = (int) $_G['uid'];
$_SERVER['DESKTOP_SMS_CONTEXT']['temp_before'] = (int) DB::result_first('SELECT MAX(id) FROM %t WHERE tel=%s',['comiis_sms_temp',$mobile]);
if ($type === 'reset' && $stage > 0) $_GET['md5'] = $stage === 1
    ? md5($mobile . $_G['clientip'] . $_G['sid'] . $_GET['code'])
    : md5($_G['clientip'] . $mobile . $_G['sid'] . $_GET['code']);
include DISCUZ_ROOT . 'source/plugin/comiis_sms/' . ($operation === 'send' ? 'comiis_sms.inc.php' : 'comiis_sms_post.inc.php');
