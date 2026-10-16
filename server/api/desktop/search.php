<?php
/**
 * 桌面端 - 帖子搜索
 * GET: q (兼容 keyword), page, perpage (兼容 limit)
 */
require_once __DIR__ . '/common.php';
require_once __DIR__ . '/client_control.php';

if (!desktop_client_control_enabled('features', 'search_enabled')) {
    http_response_code(403);
    json_out('error', '帖子搜索当前已关闭');
}

$q = trim($_GET['q'] ?? ($_GET['keyword'] ?? ''));
$page = max(1, intval($_GET['page'] ?? 1));
$perpage = min(50, max(1, intval($_GET['perpage'] ?? ($_GET['limit'] ?? 20))));
$offset = ($page - 1) * $perpage;

if (empty($q)) {
    json_out('error', '请输入搜索关键词');
}

try {
    $pdo = get_pdo();
    $like = '%' . $q . '%';

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM " . table('forum_thread') . "
        WHERE displayorder >= 0 AND (subject LIKE ? OR author LIKE ?)");
    $countStmt->execute([$like, $like]);
    $total = intval($countStmt->fetchColumn());

    $coverSql = desktop_thread_cover_sql($pdo, 't');

    $likeQuoted = $pdo->quote($like);
    $stmt = $pdo->query("SELECT t.tid, t.fid, t.author, t.authorid, t.subject, t.dateline, t.lastpost, t.displayorder, t.views, t.replies, t.digest,
                {$coverSql}
            FROM " . table('forum_thread') . " t
            WHERE t.displayorder >= 0 AND (t.subject LIKE {$likeQuoted} OR t.author LIKE {$likeQuoted})
            ORDER BY t.lastpost DESC, t.tid DESC
            LIMIT {$offset}, {$perpage}");
    $threads = [];
    while ($row = $stmt->fetch()) {
        $threads[] = [
            'tid'      => intval($row['tid']),
            'fid'      => intval($row['fid']),
            'author'   => $row['author'],
            'authorid' => intval($row['authorid']),
            'subject'  => $row['subject'],
            'dateline' => intval($row['dateline']),
            'lastpost' => intval($row['lastpost']),
            'displayorder' => intval($row['displayorder']),
            'views'    => intval($row['views']),
            'replies'  => intval($row['replies']),
            'digest'   => intval($row['digest']),
            'cover'    => desktop_forum_attachment_url($row['cover'] ?? '', intval($row['cover_remote'] ?? 0)),
        ];
    }

    json_out('success', 'ok', [
        'sort' => 'lastpost',
        'threads' => $threads,
        'page' => $page,
        'perpage' => $perpage,
        'total' => $total,
        'total_page' => $total > 0 ? intval(ceil($total / $perpage)) : 0,
    ], ['sort'=>'lastpost']);
} catch (Exception $e) {
    error_log($e->getMessage());
    json_out('error', '搜索失败，请稍后重试');
}
