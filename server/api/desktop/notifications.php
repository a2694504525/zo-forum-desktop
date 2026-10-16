<?php
/**
 * 桌面端 - 通知消息
 * GET: type=system|interactive, page
 */
require_once __DIR__ . '/common.php';
require_once __DIR__ . '/client_control.php';

if (!desktop_client_control_enabled('features', 'notifications_enabled')) {
    http_response_code(403);
    json_out('error', '消息中心当前已关闭');
}

$user = require_login();
$type = ($_GET['type'] ?? 'system') === 'interactive' ? 'interactive' : 'system';
$page = max(1, intval($_GET['page'] ?? 1));
$perpage = 20;
$offset = ($page - 1) * $perpage;

$pdo = get_pdo();
$uid = $user['uid'];

$table = table('home_notification');
$whereSql = $type === 'interactive'
    ? "uid = ? AND type <> 'system'"
    : "uid = ? AND type = 'system'";

$stmt = $pdo->prepare("SELECT id, uid, type, `new`, authorid, author, note, dateline
    FROM {$table}
    WHERE {$whereSql}
    ORDER BY `new` DESC, dateline DESC
    LIMIT {$offset}, {$perpage}");
$stmt->execute([$uid]);

$items = [];
while ($row = $stmt->fetch()) {
    $items[] = [
        'id'       => intval($row['id']),
        'type'     => $row['type'],
        'new'      => intval($row['new']),
        'author'   => $row['author'],
        'authorid' => intval($row['authorid']),
        'note'     => $row['note'],
        'dateline' => intval($row['dateline']),
    ];
}

// 标记为已读
$markReadWhereSql = $type === 'interactive'
    ? "uid = ? AND type <> 'system' AND `new` = 1"
    : "uid = ? AND type = 'system' AND `new` = 1";
$pdo->prepare("UPDATE {$table} SET `new` = 0 WHERE {$markReadWhereSql}")
    ->execute([$uid]);

json_out('success', 'ok', $items);
