<?php

function desktop_client_control_config() {
    static $config = null;
    if (is_array($config)) return $config;
    require_once __DIR__.'/config_store.php';
    $config = desktop_config_get();
    return $config;
}

function desktop_client_control_enabled($section, $key, $default = true) {
    $config = desktop_client_control_config();
    return array_key_exists($key, $config[$section] ?? []) ? !empty($config[$section][$key]) : $default;
}

function desktop_client_control_message() {
    $config = desktop_client_control_config();
    return trim((string) ($config['auth']['disabled_message'] ?? '')) ?: '该功能当前已关闭，请稍后再试。';
}
