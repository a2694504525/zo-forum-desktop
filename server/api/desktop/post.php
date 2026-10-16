<?php
/**
 * 桌面端 - 发帖 / 回帖
 * POST: action=new|reply, tid, fid, subject, message
 */
require_once __DIR__ . '/common.php';
require_once __DIR__ . '/client_control.php';

$clientAction=$_POST['action'] ?? 'reply';
if(!is_string($clientAction)||!in_array($clientAction,['new','reply'],true)){http_response_code(400);json_out('error','发帖操作不正确');}
$clientState=desktop_client_control_config()['run_state'];
if($clientState['mode']==='maintenance'||($clientState['mode']==='disabled'||!$clientState['can_run'])&&$clientState['action']!=='notice'){http_response_code(403);json_out('error','客户端当前不允许写入');}
if (!desktop_client_control_enabled('features', $clientAction==='reply'?'reply_enabled':'posting_enabled')) {
    http_response_code(403);
    json_out('error', $clientAction==='reply'?'客户端回复功能当前已关闭':'客户端发帖功能当前已关闭');
}

header('Content-Type: application/json; charset=utf-8');

try {

$dbConfig = $_config['db']['1'];
$dsn = "mysql:host={$dbConfig['dbhost']};dbname={$dbConfig['dbname']};charset={$dbConfig['dbcharset']}";
$pdo = new PDO($dsn, $dbConfig['dbuser'], $dbConfig['dbpw'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$tablepre = $dbConfig['tablepre'];

$user = require_login();
$uid = intval($user['uid']);
$username = $user['username'];

$action = $_POST['action'] ?? 'reply';
$tid = intval($_POST['tid'] ?? 0);
$fid = intval($_POST['fid'] ?? 0);
$subject = trim($_POST['subject'] ?? '');
$message = trim($_POST['message'] ?? '');

function get_table_columns($pdo, $tableName) {
    static $cache = [];
    if (isset($cache[$tableName])) {
        return $cache[$tableName];
    }
    $columns = [];
    $stmt = $pdo->query("SHOW COLUMNS FROM {$tableName}");
    while ($row = $stmt->fetch()) {
        $columns[$row['Field']] = true;
    }
    $cache[$tableName] = $columns;
    return $columns;
}

function insert_forum_post($pdo, $tableName, array $data) {
    $columns = get_table_columns($pdo, $tableName);
    $filtered = [];
    foreach ($data as $column => $value) {
        if (isset($columns[$column])) {
            $filtered[$column] = $value;
        }
    }
    $keys = array_keys($filtered);
    $placeholders = implode(', ', array_fill(0, count($keys), '?'));
    $sql = "INSERT INTO {$tableName} (" . implode(', ', $keys) . ") VALUES ({$placeholders})";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($filtered));
}

if (empty($message)) {
    echo json_encode(['status' => 'error', 'message' => '内容不能为空'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (mb_strlen($message, 'utf-8') > 50000) {
    echo json_encode(['status' => 'error', 'message' => '内容过长，最多50000字符'], JSON_UNESCAPED_UNICODE);
    exit;
}

$timestamp = time();
$postTable = "{$tablepre}forum_post";

if ($action === 'reply' && $tid > 0) {
    $thread = $pdo->prepare("SELECT tid, fid, subject, closed FROM {$tablepre}forum_thread WHERE tid = ? AND displayorder >= 0 LIMIT 1");
    $thread->execute([$tid]);
    $t = $thread->fetch();

    if (!$t) {
        echo json_encode(['status' => 'error', 'message' => '帖子不存在'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($t['closed'] == 1) {
        echo json_encode(['status' => 'error', 'message' => '帖子已关闭'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $maxPid = $pdo->query("SELECT MAX(pid) FROM {$tablepre}forum_post")->fetchColumn();
    $pid = intval($maxPid) + 1;
    $positionStmt = $pdo->prepare("SELECT COALESCE(MAX(position), 0) FROM {$postTable} WHERE tid = ?");
    $positionStmt->execute([$tid]);
    $position = max(1, intval($positionStmt->fetchColumn()) + 1);

    insert_forum_post($pdo, $postTable, [
        'pid' => $pid,
        'fid' => intval($t['fid']),
        'tid' => $tid,
        'first' => 0,
        'author' => $username,
        'authorid' => $uid,
        'subject' => '',
        'dateline' => $timestamp,
        'message' => $message,
        'useip' => '',
        'port' => '0',
        'invisible' => 0,
        'anonymous' => 0,
        'usesig' => 1,
        'htmlon' => 0,
        'bbcodeoff' => 0,
        'smileyoff' => 0,
        'parseurloff' => 0,
        'attachment' => 0,
        'rate' => 0,
        'ratetimes' => 0,
        'status' => 0,
        'messageposition' => $position,
        'replycredit' => 0,
        'position' => $position,
        'tags' => '',
        'comment' => 0,
        'replyto' => 0,
        'authorstatus' => 0,
        'ismobile' => 0,
        'isapproved' => 1,
        'repid' => 0,
    ]);

    $pdo->prepare("UPDATE {$tablepre}forum_thread SET replies = replies + 1, lastpost = ?, lastposter = ? WHERE tid = ?")
        ->execute([$timestamp, $username, $tid]);

    $pdo->prepare("UPDATE {$tablepre}forum_forum SET posts = posts + 1, todayposts = todayposts + 1, lastpost = ? WHERE fid = ?")
        ->execute([$t['subject'] . "\t" . $timestamp . "\t" . $username, $t['fid']]);

    echo json_encode(['status' => 'success', 'message' => '回复成功', 'data' => ['pid' => $pid, 'tid' => $tid, 'author' => $username, 'dateline' => $timestamp]], JSON_UNESCAPED_UNICODE);

} elseif ($action === 'new' && $fid > 0) {
    if (empty($subject)) {
        echo json_encode(['status' => 'error', 'message' => '标题不能为空'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (mb_strlen($subject, 'utf-8') > 80) {
        echo json_encode(['status' => 'error', 'message' => '标题最长80字符'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $maxTid = $pdo->query("SELECT MAX(tid) FROM {$tablepre}forum_thread")->fetchColumn();
    $maxPid = $pdo->query("SELECT MAX(pid) FROM {$tablepre}forum_post")->fetchColumn();
    $tid = intval($maxTid) + 1;
    $pid = intval($maxPid) + 1;

    $pdo->prepare("INSERT INTO {$tablepre}forum_thread
        (tid, fid, posttableid, author, authorid, subject, dateline, lastpost, lastposter, views, replies, displayorder, digest, special, attachment, moderated, status)
        VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)")
        ->execute([$tid, $fid, $username, $uid, $subject, $timestamp, $timestamp, $username]);

    insert_forum_post($pdo, $postTable, [
        'pid' => $pid,
        'fid' => $fid,
        'tid' => $tid,
        'first' => 1,
        'author' => $username,
        'authorid' => $uid,
        'subject' => $subject,
        'dateline' => $timestamp,
        'message' => $message,
        'useip' => '',
        'port' => '0',
        'invisible' => 0,
        'anonymous' => 0,
        'usesig' => 1,
        'htmlon' => 0,
        'bbcodeoff' => 0,
        'smileyoff' => 0,
        'parseurloff' => 0,
        'attachment' => 0,
        'rate' => 0,
        'ratetimes' => 0,
        'status' => 0,
        'messageposition' => 1,
        'replycredit' => 0,
        'position' => 1,
        'tags' => '',
        'comment' => 0,
        'replyto' => 0,
        'authorstatus' => 0,
        'ismobile' => 0,
        'isapproved' => 1,
        'repid' => 0,
    ]);

    $pdo->prepare("UPDATE {$tablepre}forum_forum SET threads = threads + 1, posts = posts + 1, todayposts = todayposts + 1, lastpost = ? WHERE fid = ?")
        ->execute([$subject . "\t" . $timestamp . "\t" . $username, $fid]);

    echo json_encode(['status' => 'success', 'message' => '发帖成功', 'data' => ['tid' => $tid, 'fid' => $fid, 'subject' => $subject, 'author' => $username, 'dateline' => $timestamp]], JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode(['status' => 'error', 'message' => '参数错误'], JSON_UNESCAPED_UNICODE);
}
} catch (Throwable $e) {
    error_log('desktop post api: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => '帖子提交失败，请稍后重试',
        'debug' => defined('IN_ADMINCP') ? $e->getMessage() : null,
    ], JSON_UNESCAPED_UNICODE);
}
