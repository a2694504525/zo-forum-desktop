<?php
function desktop_v22_defaults() {
    return [
        'app' => ['name' => 'ZO论坛盒子', 'site_url' => 'https://www.zozse.cn', 'api_base' => 'https://www.zozse.cn/api/desktop', 'image_cdn' => 'https://tp.zozse.cn', 'download_url' => 'https://www.z19m.com/download/desktop'],
        'auth' => ['sms_enabled' => false, 'sms_register_enabled' => true, 'sms_login_enabled' => true, 'sms_reset_enabled' => true, 'sms_bind_enabled' => true, 'sms_login_modes' => ['code'], 'bind_mobile_required' => false, 'password_login_enabled' => true, 'captcha_enabled' => false],
        'features' => ['sign_in_enabled' => true, 'medals_enabled' => true, 'tasks_enabled' => true, 'profile_save_enabled' => true, 'reply_enabled' => true, 'download_enabled' => true, 'theme_enabled' => true, 'tray_enabled' => true, 'dark_mode_enabled' => true],
        'navigation' => ['items' => [], 'order' => ['home', 'forums', 'search', 'notifications', 'profile', 'settings']],
        'theme' => ['default' => 'blue', 'available' => ['blue', 'purple', 'green', 'orange'], 'allow_user_change' => true, 'appearance' => 'system'],
        'run_state' => ['mode' => 'normal', 'can_run' => true, 'action' => 'notice', 'message' => '', 'close_reason' => '', 'resume_at' => '', 'link' => '', 'check_interval' => 600],
        'announcements' => [], 'home_notices'=>[], 'floating_notices'=>[],
        'update' => ['check_interval' => 10800, 'force_min_version' => '2.0.0', 'changelog' => []]
    ];
}
function desktop_v22_merge($config, $saved) {
    $result = array_replace_recursive(desktop_v22_defaults(), $config);
    foreach (['announcements', 'i18n'] as $key) if (isset($saved[$key]) && is_array($saved[$key])) $result[$key] = $saved[$key];
    $run = $result['run_state'];
    if (empty($saved['run_state']) && isset($config['client_enabled']) && $config['client_enabled'] === false) { $run['mode'] = 'maintenance'; $run['message'] = $config['maintenance_message'] ?? ''; }
    if (!in_array($run['mode'], ['normal', 'maintenance', 'disabled'], true)) $run['mode'] = 'normal';
    if (!in_array($run['action'], ['notice', 'lock', 'exit'], true)) $run['action'] = 'notice';
    $run['can_run'] = $run['can_run'] === true;
    $run['check_interval'] = max(60, min(86400, (int) $run['check_interval']));
    $result['run_state'] = $run;
    return $result;
}
