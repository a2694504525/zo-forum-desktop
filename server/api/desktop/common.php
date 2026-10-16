<?php
/**
 * ZO论坛桌面客户端 API - 公共入口
 * 不经过 Discuz 核心初始化，避免 Access denied / 访问限制
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/api_error.log');

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin && preg_match('#^https://([a-z0-9-]+\.)?zozse\.cn$#i', $requestOrigin)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

require_once __DIR__ . '/../../config/config_global.php';
require_once __DIR__ . '/../../config/config_ucenter.php';

// 统一 JSON 输出
function json_out($status, $message = '', $data = null, $meta = []) {
    $res = ['status' => $status, 'message' => $message, 'code' => $status === 'success' ? 0 : 2001, 'msg' => $message];
    if ($data !== null) {
        $res['data'] = $data;
    }
    $res = array_merge($res, $meta);
    echo json_encode($res, JSON_UNESCAPED_UNICODE);
    exit;
}

// 获取 PDO 连接
function get_pdo() {
    static $pdo = null;
    if ($pdo) return $pdo;

    $cfg = $GLOBALS['_config']['db']['1'];
    $dsn = "mysql:host={$cfg['dbhost']};dbname={$cfg['dbname']};charset={$cfg['dbcharset']}";
    $pdo = new PDO($dsn, $cfg['dbuser'], $cfg['dbpw'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

function table($name) {
    return $GLOBALS['_config']['db']['1']['tablepre'] . $name;
}

function table_columns($pdo, $tableName) {
    static $cache = [];
    if (isset($cache[$tableName])) return $cache[$tableName];
    $cache[$tableName] = [];
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM {$tableName}");
        while ($row = $stmt->fetch()) {
            $cache[$tableName][$row['Field']] = true;
        }
    } catch (Exception $e) {
        error_log($e->getMessage());
    }
    return $cache[$tableName];
}

function table_has_column($pdo, $tableName, $column) {
    $columns = table_columns($pdo, $tableName);
    return isset($columns[$column]);
}

function desktop_forum_attachment_url($path, $remote = 0) {
    $path = ltrim((string) $path, '/');
    if (!$path) return '';
    return $remote
        ? 'https://tp.zozse.cn/forum/' . $path
        : 'https://www.zozse.cn/data/attachment/forum/' . $path;
}

function desktop_thread_cover_sql($pdo, $threadAlias = 't') {
    $imageTable = table('forum_threadimage');
    if (!table_has_column($pdo, $imageTable, 'attachment')) {
        return "'' AS cover, 0 AS cover_remote";
    }
    $hasRemote = table_has_column($pdo, $imageTable, 'remote');
    $cover = "(SELECT ti.attachment FROM {$imageTable} ti WHERE ti.tid = {$threadAlias}.tid ORDER BY ti.tid DESC LIMIT 1) AS cover";
    $remote = $hasRemote
        ? "(SELECT ti.remote FROM {$imageTable} ti WHERE ti.tid = {$threadAlias}.tid ORDER BY ti.tid DESC LIMIT 1) AS cover_remote"
        : '0 AS cover_remote';
    return $cover . ', ' . $remote;
}

// 当前 Discuz cookie 前缀
function cookie_pre() {
    return $GLOBALS['_config']['cookie']['cookiepre'] ?? '';
}

// 通过 sid cookie / 查询参数 / Authorization 头获取当前登录用户
function current_user() {
    $pre = cookie_pre();
    $sid = '';

    // 1. cookie
    if (!empty($_COOKIE[$pre . 'sid'])) {
        $sid = $_COOKIE[$pre . 'sid'];
    }
    // 2. Authorization: Bearer sid
    elseif (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'];
        if (stripos($auth, 'Bearer ') === 0) {
            $sid = trim(substr($auth, 7));
        }
    }

    $sid = trim($sid);
    if (!$sid) return desktop_discuz_user();

    $pdo = get_pdo();
    $stmt = $pdo->prepare("SELECT uid, username FROM " . table('common_session') . " WHERE sid = ? AND uid > 0 LIMIT 1");
    $stmt->execute([$sid]);
    $s = $stmt->fetch();
    if (!$s) return desktop_discuz_user();

    return ['uid' => intval($s['uid']), 'username' => $s['username'], 'sid' => $sid];
}

function desktop_discuz_user() {
    $config = $GLOBALS['_config'];
    $cookie = $config['cookie'];
    $path = $cookie['cookiepath'] ?: '/';
    if (substr($path, 0, 1) !== '/') $path = '/' . $path;
    $prefix = $cookie['cookiepre'] . substr(md5($path . '|' . $cookie['cookiedomain']), 0, 4) . '_';
    if (empty($_COOKIE[$prefix . 'auth'])) return null;
    if (!defined('IN_DISCUZ')) define('IN_DISCUZ', true);
    require_once __DIR__ . '/../../source/function/function_core.php';
    $secret = $config['security']['authkey'] ?: md5($cookie['cookiepre'] . $config['db'][1]['dbname']);
    $auth = explode("\t", authcode($_COOKIE[$prefix . 'auth'], 'DECODE', md5($secret . ($_COOKIE[$prefix . 'saltkey'] ?? ''))));
    if (count($auth) !== 2 || !ctype_digit($auth[1]) || (int) $auth[1] < 1) return null;
    $query = get_pdo()->prepare('SELECT uid, username, password, groupid, freeze FROM ' . table('common_member') . ' WHERE uid = ? LIMIT 1');
    $query->execute([(int) $auth[1]]);
    $member = $query->fetch();
    if (!$member || !hash_equals((string) $member['password'], $auth[0]) || !empty($member['freeze']) || in_array((int) $member['groupid'], [4,5,6,7,8], true)) return null;
    return ['uid' => (int) $member['uid'], 'username' => $member['username'], 'sid' => ''];
}

function require_login() {
    $user = current_user();
    if (!$user) {
        http_response_code(401);
        json_out('error', '请先登录');
    }
    return $user;
}
