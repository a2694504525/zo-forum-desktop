<?php
/**
 * 桌面端 - 最新帖子
 * GET: page, perpage (兼容 limit)
 */
require_once __DIR__ . '/common.php';

$page = max(1, intval($_GET['page'] ?? 1));
$perpage = min(50, max(1, intval($_GET['perpage'] ?? ($_GET['count'] ?? ($_GET['limit'] ?? 30)))));
$offset = ($page - 1) * $perpage;
$sort=($_GET['orderby'] ?? '')==='replies'?'replies':((($_GET['view'] ?? '')==='newthread'||($_GET['sort'] ?? '')==='dateline')?'dateline':'lastpost');
$orderSql=$sort==='replies'?'t.replies DESC,t.lastpost':($sort==='dateline'?'t.dateline':'t.lastpost');
$filter=in_array($_GET['filter'] ?? '',['digest','sticky','featured'],true)?$_GET['filter']:'';
$threadFilter=$filter==='digest'?' AND digest>0':($filter==='sticky'?' AND displayorder>0':($filter==='featured'?' AND (digest>0 OR displayorder>0)':''));

$rawIds=$_GET['forum_ids'] ?? ($_GET['fid'] ?? '');if(!is_string($rawIds)||($rawIds!==''&&!preg_match('/^[1-9]\d*(?:,[1-9]\d*){0,99}$/',$rawIds))){http_response_code(400);json_out('error','来源版块参数不正确');}
$ids=$rawIds===''?[]:array_map('intval',explode(',',$rawIds));if($ids)$threadFilter.=' AND fid IN ('.implode(',',$ids).')';
try {
    $pdo = get_pdo();

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM " . table('forum_thread') . " WHERE displayorder >= 0{$threadFilter}");
    $stmt->execute();
    $total = intval($stmt->fetchColumn());

    $coverSql = desktop_thread_cover_sql($pdo, 't');

    $stmt = $pdo->query("SELECT (SELECT name FROM " . table('forum_forum') . " f WHERE f.fid=t.fid) AS forum_name,t.tid, t.fid, t.author, t.authorid, t.subject, t.dateline, t.lastpost, t.lastposter, t.displayorder, t.views, t.replies, t.digest,
            {$coverSql}
        FROM " . table('forum_thread') . " t
        WHERE t.displayorder >= 0{$threadFilter}
        ORDER BY {$orderSql} DESC, t.tid DESC
        LIMIT {$offset}, {$perpage}");
    $threads = [];
    while ($row = $stmt->fetch()) {
        $threads[] = [
            'tid'      => intval($row['tid']),
            'fid'      => intval($row['fid']),
            'forum_name'=>strip_tags($row['forum_name']),
            'author'   => $row['author'],
            'authorid' => intval($row['authorid']),
            'subject'  => $row['subject'],
            'dateline' => intval($row['dateline']),
            'lastpost' => intval($row['lastpost']),
            'lastposter' => $row['lastposter'],
            'displayorder' => intval($row['displayorder']),
            'views'    => intval($row['views']),
            'replies'  => intval($row['replies']),
            'digest'   => intval($row['digest']),
            'cover'    => desktop_forum_attachment_url($row['cover'] ?? '', intval($row['cover_remote'] ?? 0)),
        ];
    }

    // 桌面端首页直接返回帖子数组，与前端 loadHome 的 res.data 对齐
    json_out('success', 'ok', $threads, ['sort'=>$sort,'page'=>$page,'perpage'=>$perpage,'total'=>$total,'total_page'=>(int)ceil($total/$perpage)]);
} catch (Exception $e) {
    error_log($e->getMessage());
    json_out('error', '首页加载失败，请稍后重试');
}
