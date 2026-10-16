<?php
ini_set('display_errors', '0');
define('APPTYPEID', 0);
define('CURSCRIPT', 'api');
$_SERVER['HTTP_ACCEPT_ENCODING'] = 'identity';
$_SERVER['DESKTOP_SMS_CONFIG'] = ['status'=>'error','code'=>5000,'msg'=>'短信配置读取失败','message'=>'短信配置读取失败'];
ob_start(function ($output) {
    if (!headers_sent()) {header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');}
    return json_encode($_SERVER['DESKTOP_SMS_CONFIG'], JSON_UNESCAPED_UNICODE);
});
require_once __DIR__ . '/../../source/class/class_core.php';
$discuz = C::app();$discuz->init();loadcache('plugin');
$p = $_G['cache']['plugin']['comiis_sms'] ?? [];
$ready = !empty($p['appkey']) && !empty($p['appsecret']) && !empty($p['name']);
$data = ['formhash'=>FORMHASH,'sms_enabled'=>(bool)$p,'provider_ready'=>$ready,
    'sms_register_enabled'=>!empty($p['open_pcreg']), 'sms_login_enabled'=>!empty($p['tel_reglogin']),
    'sms_reset_enabled'=>!empty($p['tel_lpw']), 'username_required'=>!empty($p['open_name']),
    'captcha_enabled'=>!empty($p['seccodeverify']), 'login_captcha_enabled'=>!empty($p['login_seccodeverify']),
    'code_length'=>max(4,min(8,(int)($p['code_len'] ?? 6))),
    'login_template_ready'=>!empty($p['login_template']), 'register_template_ready'=>!empty($p['reg_template'])];
$_SERVER['DESKTOP_SMS_CONFIG']=['status'=>'success','code'=>0,'msg'=>'ok','message'=>'ok','data'=>$data];
