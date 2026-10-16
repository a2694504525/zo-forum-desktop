<?php
/**
 * 桌面端 - 版块列表 / 版块详情（含帖子）
 * GET: fid（可选）, page, perpage
 */
require_once __DIR__ . '/common.php';

$fid = intval($_GET['fid'] ?? 0);
$page = max(1, intval($_GET['page'] ?? 1));
$perpage = min(50, max(1, intval($_GET['perpage'] ?? ($_GET['count'] ?? ($_GET['limit'] ?? 30)))));
$offset = ($page - 1) * $perpage;
$orderSql = 't.lastpost';
$filter=in_array($_GET['filter'] ?? '',['digest','sticky'],true)?$_GET['filter']:'';
$threadFilter=$filter==='digest'?' AND digest>0':($filter==='sticky'?' AND displayorder>0':'');

try {
    $pdo = get_pdo();
    $forumTable = table('forum_forum');
    $hasDescription = false;
    try {
        $columnStmt = $pdo->query("SHOW COLUMNS FROM {$forumTable} LIKE 'description'");
        $hasDescription = (bool) $columnStmt->fetch();
    } catch (Exception $e) {
        $hasDescription = false;
    }
    $descriptionSql = $hasDescription ? "description" : "'' AS description";
    $hasIcon = table_has_column($pdo, $forumTable, 'icon');
    $iconSql = $hasIcon ? 'icon' : "'' AS icon";

    // forum_forum.threads 是缓存值，可能因导入、移动或删除主题而不同步。
    // 客户端展示数量统一按当前实际可见主题实时统计。
    $liveThreadCounts = [];
    $countStmt = $pdo->query("SELECT fid, COUNT(*) AS total FROM " . table('forum_thread') . " WHERE displayorder >= 0 GROUP BY fid");
    while ($countRow = $countStmt->fetch()) {
        $liveThreadCounts[intval($countRow['fid'])] = intval($countRow['total']);
    }

    if ($fid < 1) {
        // 版块列表：兼容 status=1 正常版块以及 status=3 的群组分类
        $stmt = $pdo->query("SELECT fid, fup, type, name, {$descriptionSql}, threads, posts, todayposts, {$iconSql}, status
            FROM {$forumTable}
            WHERE status IN (1, 3) AND type IN ('group', 'forum', 'sub')
            ORDER BY type, displayorder ASC, fup ASC");
        $groups = [];
        $forums = [];
        $subs = [];
        while ($row = $stmt->fetch()) {
            $item = [
                'fid'         => intval($row['fid']),
                'fup'         => intval($row['fup']),
                'type'        => $row['type'],
                'name'        => $row['name'],
                'description' => $row['description'],
                'threads'     => intval($liveThreadCounts[intval($row['fid'])] ?? 0),
                'posts'       => intval($row['posts']),
                'todayposts'  => intval($row['todayposts']),
                'icon'        => desktop_forum_icon_url($row['icon'] ?? ''),
                'sub_forums'  => [],
            ];
            if ($row['type'] === 'sub') {
                $subs[$row['fup']][] = $item;
            } elseif ($row['type'] === 'group') {
                $groups[$row['fid']] = $item;
            } else {
                $forums[$row['fid']] = $item;
            }
        }
        // 子版块挂到所属版块
        foreach ($subs as $fup => $items) {
            if (isset($forums[$fup])) {
                $forums[$fup]['sub_forums'] = array_merge($forums[$fup]['sub_forums'], $items);
            }
        }
        // 版块挂到所属分类；若分类不存在则作为顶层版块
        $result = [];
        foreach ($forums as $fid => $forum) {
            if ($forum['fup'] > 0 && isset($groups[$forum['fup']])) {
                $groups[$forum['fup']]['sub_forums'][] = $forum;
            } else {
                $result[] = $forum;
            }
        }
        // 只向桌面端返回实际有内容的版块，过滤历史导入产生的空壳分类。
        foreach ($groups as $groupId => $group) {
            $group['sub_forums'] = array_values(array_filter($group['sub_forums'], 'desktop_forum_has_content'));
            $group['threads'] = desktop_forum_thread_total($group);
            $groups[$groupId] = $group;
        }
        $result = array_values(array_filter(array_merge(array_values($groups), $result), 'desktop_forum_has_content'));

        // 如果仍然为空，放宽条件再次兜底查询
        if (empty($result)) {
            $stmt = $pdo->query("SELECT fid, fup, type, name, {$descriptionSql}, threads, posts, todayposts, {$iconSql}, status
                FROM {$forumTable}
                WHERE status > 0
                ORDER BY displayorder ASC");
            while ($row = $stmt->fetch()) {
                $result[] = [
                    'fid'         => intval($row['fid']),
                    'fup'         => intval($row['fup']),
                    'type'        => $row['type'],
                    'name'        => $row['name'],
                    'description' => $row['description'],
                    'threads'     => intval($liveThreadCounts[intval($row['fid'])] ?? 0),
                    'posts'       => intval($row['posts']),
                    'todayposts'  => intval($row['todayposts']),
                    'icon'        => desktop_forum_icon_url($row['icon'] ?? ''),
                    'sub_forums'  => [],
                ];
            }
            $result = array_values(array_filter($result, 'desktop_forum_has_content'));
        }

        json_out('success', 'ok', $result);
    }

    // 版块详情
    $stmt = $pdo->prepare("SELECT fid, fup, name, {$descriptionSql}, threads, posts, todayposts, {$iconSql}
        FROM {$forumTable} WHERE fid = ? AND status > 0 LIMIT 1");
    $stmt->execute([$fid]);
    $forum = $stmt->fetch();
    if (!$forum) {
        json_out('error', '版块不存在');
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM " . table('forum_thread') . " WHERE fid = ? AND displayorder >= 0{$threadFilter}");
    $stmt->execute([$fid]);
    $total = intval($stmt->fetchColumn());

    $coverSql = desktop_thread_cover_sql($pdo, 't');

    $stmt = $pdo->query("SELECT t.tid, t.author, t.authorid, t.subject, t.dateline, t.lastpost, t.lastposter, t.displayorder, t.views, t.replies, t.digest,
            {$coverSql}
        FROM " . table('forum_thread') . " t
        WHERE t.fid = {$fid} AND t.displayorder >= 0{$threadFilter}
        ORDER BY t.displayorder DESC, {$orderSql} DESC, t.tid DESC
        LIMIT {$offset}, {$perpage}");
    $threads = [];
    while ($row = $stmt->fetch()) {
        $threads[] = [
            'tid'      => intval($row['tid']),
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

    json_out('success', 'ok', [
        'forum' => [
            'fid'         => intval($forum['fid']),
            'fup'         => intval($forum['fup']),
            'name'        => $forum['name'],
            'description' => $forum['description'],
            'threads'     => $total,
            'posts'       => intval($forum['posts']),
            'todayposts'  => intval($forum['todayposts']),
            'icon'        => desktop_forum_icon_url($forum['icon'] ?? ''),
        ],
        'sort' => 'lastpost',
        'threads' => $threads,
        'page'    => $page,
        'perpage' => $perpage,
        'total'   => $total,
        'total_page' => ceil($total / $perpage),
    ], ['sort'=>'lastpost']);
} catch (Exception $e) {
    error_log($e->getMessage());
    json_out('error', '版块加载失败，请稍后重试');
}

function desktop_forum_has_content($forum) {
    if (intval($forum['threads'] ?? 0) > 0 || intval($forum['posts'] ?? 0) > 0 || intval($forum['todayposts'] ?? 0) > 0) {
        return true;
    }
    foreach (($forum['sub_forums'] ?? []) as $child) {
        if (desktop_forum_has_content($child)) return true;
    }
    return false;
}

function desktop_forum_thread_total($forum) {
    $total = intval($forum['threads'] ?? 0);
    foreach (($forum['sub_forums'] ?? []) as $child) {
        $total += desktop_forum_thread_total($child);
    }
    return $total;
}

function desktop_forum_icon_url($icon) {
    $icon = trim(htmlspecialchars_decode((string) $icon));
    if ($icon === '') return '';
    if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $icon, $match)) {
        $icon = $match[1];
    }
    if (preg_match('#^https?://#i', $icon)) return preg_replace('#^http:#i', 'https:', $icon);
    if (strpos($icon, '/') === 0) return 'https://www.zozse.cn' . $icon;
    if (strpos($icon, 'data/') === 0) return 'https://www.zozse.cn/' . $icon;
    return 'https://www.zozse.cn/data/attachment/common/' . ltrim($icon, '/');
}
