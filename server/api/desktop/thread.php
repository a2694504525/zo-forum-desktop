<?php
/**
 * 桌面端 - 帖子详情
 * GET: tid, page
 */
require_once __DIR__ . '/common.php';
require_once __DIR__.'/content_renderer.php';

set_exception_handler(function ($error) {
    error_log($error->getMessage());
    http_response_code(500);
    json_out('error', '帖子加载失败，请稍后重试');
});

$tid = intval($_GET['tid'] ?? 0);
$page = max(1, intval($_GET['page'] ?? 1));
$perpage = 20;
$offset = ($page - 1) * $perpage;

if ($tid < 1) {
    json_out('error', '缺少 tid 参数');
}

$pdo = get_pdo();

$threadTable = table('forum_thread');
$hasSortId = false;
try {
    $columnStmt = $pdo->query("SHOW COLUMNS FROM {$threadTable} LIKE 'sortid'");
    $hasSortId = (bool) $columnStmt->fetch();
} catch (Exception $e) {
    $hasSortId = false;
}
$sortIdSql = $hasSortId ? 'sortid' : '0 AS sortid';

$stmt = $pdo->prepare("SELECT tid, fid, subject, author, authorid, dateline, views, replies, digest, displayorder, attachment, {$sortIdSql}
    FROM {$threadTable} WHERE tid = ? AND displayorder >= 0 LIMIT 1");
$stmt->execute([$tid]);
$thread = $stmt->fetch();

if (!$thread) {
    http_response_code(404);
    json_out('error', '帖子不存在或无法访问');
}

// 浏览量 +1
$pdo->prepare("UPDATE " . table('forum_thread') . " SET views = views + 1 WHERE tid = ?")->execute([$tid]);

// 版块名
$forum = $pdo->prepare("SELECT name FROM " . table('forum_forum') . " WHERE fid = ? LIMIT 1");
$forum->execute([$thread['fid']]);
$forumName = $forum->fetchColumn() ?: '';

// 首帖内容
$firstPostStmt = $pdo->prepare("SELECT pid, message, dateline FROM " . table('forum_post') . " WHERE tid = ? AND first = 1 LIMIT 1");
$firstPostStmt->execute([$tid]);
$firstPost = $firstPostStmt->fetch();
$firstPid = intval($firstPost['pid'] ?? 0);

// 获取帖子附件（表不存在时兜底为空）
$attachments = [];
try {
    $attachmentIndexTable = table('forum_attachment');
    $indexColumns = table_columns($pdo, $attachmentIndexTable);
    if (isset($indexColumns['attachment'])) {
        $attStmt = $pdo->prepare("SELECT aid, pid, filename, filesize, attachment, isimage, remote FROM {$attachmentIndexTable} WHERE tid = ?");
        $attStmt->execute([$tid]);
        while ($att = $attStmt->fetch()) $attachments[$att['aid']] = $att;
    } else {
        $indexStmt = $pdo->prepare("SELECT aid, pid, tableid FROM {$attachmentIndexTable} WHERE tid = ?");
        $indexStmt->execute([$tid]);
        $partitions = [];
        while ($index = $indexStmt->fetch()) {
            $tableId = max(0, min(9, intval($index['tableid'] ?? 0)));
            $partitions[$tableId][intval($index['aid'])] = intval($index['pid']);
        }
        foreach ($partitions as $tableId => $aidToPid) {
            $aids = array_keys($aidToPid);
            if (!$aids) continue;
            $partitionTable = table('forum_attachment_' . intval($tableId));
            $placeholders = implode(',', array_fill(0, count($aids), '?'));
            $detailStmt = $pdo->prepare("SELECT aid, pid, filename, filesize, attachment, isimage, remote FROM {$partitionTable} WHERE aid IN ({$placeholders})");
            $detailStmt->execute($aids);
            while ($att = $detailStmt->fetch()) {
                if (empty($att['pid'])) $att['pid'] = $aidToPid[intval($att['aid'])] ?? 0;
                $attachments[$att['aid']] = $att;
            }
        }
    }
} catch (Exception $e) {
    error_log($e->getMessage());
}

// 分类信息（游戏资源等）
$typeOptions = [];
$sortTitle = '';
if (!empty($thread['sortid'])) {
  try {
    $sort = $pdo->prepare("SELECT typeid AS sortid, name FROM " . table('forum_threadtype') . " WHERE typeid = ? LIMIT 1");
    $sort->execute([$thread['sortid']]);
    $sortRow = $sort->fetch();
    if ($sortRow) {
        $sortTitle = $sortRow['name'];
    }

    // 读取选项定义
    $optDefs = [];
    $typeOptionTable = table('forum_typeoption');
    // typeoption.classid 是字段分类，不是帖子分类模板 ID。模板修改后继续按
    // classid 查询会得到空列表；Discuz 使用 forum_typevar 维护模板和字段的关系。
    $typeVarTable = table('forum_typevar');
    $optStmt = $pdo->prepare("SELECT o.optionid, o.title, o.identifier, o.type, o.unit, o.rules
        FROM {$typeVarTable} v
        INNER JOIN {$typeOptionTable} o ON o.optionid = v.optionid
        WHERE v.sortid = ?
        ORDER BY o.displayorder ASC, o.optionid ASC");
    $optStmt->execute([$thread['sortid']]);
    while ($opt = $optStmt->fetch()) {
        $optDefs[$opt['optionid']] = $opt;
    }

    // 兼容少数旧版/定制表结构直接在 typeoption 保存 sortid 的情况。
    if (empty($optDefs)) {
        $typeOptionColumns = table_columns($pdo, $typeOptionTable);
        if (isset($typeOptionColumns['sortid'])) {
            $legacyStmt = $pdo->prepare("SELECT optionid, title, identifier, type, unit, rules FROM {$typeOptionTable} WHERE sortid = ? ORDER BY displayorder ASC");
            $legacyStmt->execute([$thread['sortid']]);
            while ($opt = $legacyStmt->fetch()) {
                $optDefs[$opt['optionid']] = $opt;
            }
        }
    }

    // 读取选项值（forum_typeoptionvar）
    $valueTable = table('forum_typeoptionvar');
    $valueColumns = table_columns($pdo, $valueTable);
    $valueWhere = isset($valueColumns['sortid']) ? 'tid = ? AND sortid = ?' : 'tid = ?';
    $valStmt = $pdo->prepare("SELECT optionid, value FROM {$valueTable} WHERE {$valueWhere}");
    $valueParams = isset($valueColumns['sortid']) ? [$tid, intval($thread['sortid'])] : [$tid];
    $valStmt->execute($valueParams);
    $values = [];
    while ($v = $valStmt->fetch()) {
        $values[$v['optionid']] = $v['value'];
    }

    // 某些 Discuz 版本把全部或部分值放在 forum_optionvalue{sortid} 表里。
    // 两处都读取并合并，避免模板字段迁移后只显示一部分。
    {
        $optValueTable = table('forum_optionvalue') . intval($thread['sortid']);
        try {
            $valStmt2 = $pdo->prepare("SELECT * FROM {$optValueTable} WHERE tid = ? AND fid = ? LIMIT 1");
            $valStmt2->execute([$tid, $thread['fid']]);
            $valueRow = $valStmt2->fetch();
            if ($valueRow) {
                foreach ($optDefs as $optid => $opt) {
                    if ((!isset($values[$optid]) || $values[$optid] === '') && isset($valueRow[$opt['identifier']])) {
                        $values[$optid] = $valueRow[$opt['identifier']];
                    }
                }
            }
        } catch (Exception $e) {
            // ignore
        }
    }

    foreach ($optDefs as $optid => $opt) {
        if (isset($values[$optid]) && $values[$optid] !== '') {
            $typeOptions[] = [
                'optionid' => intval($optid),
                'title' => $opt['title'],
                'identifier' => $opt['identifier'] ?? '',
                'value' => bbcode_to_html(desktop_format_sort_value($values[$optid], $opt), $attachments),
                'unit' => $opt['unit'] ?? '',
            ];
        }
    }
    try {
        $typeOptions = desktop_apply_hidethreadsort($pdo, $thread, $typeOptions, current_user());
    } catch (Exception $permissionError) {
        // 权限插件表结构变化时仍返回基础分类信息，避免整个区域消失。
        error_log('hidethreadsort: ' . $permissionError->getMessage());
        $typeOptions=[];
    }
  } catch (Exception $e) {
    error_log($e->getMessage());
    $typeOptions = [];
    $sortTitle = '';
  }
}

// 回帖总数
$totalStmt = $pdo->prepare("SELECT COUNT(*) FROM " . table('forum_post') . " WHERE tid = ? AND first = 0 AND invisible = 0");
$totalStmt->execute([$tid]);
$totalReplies = intval($totalStmt->fetchColumn());

// 回帖列表
$replyList = [];
$repStmt = $pdo->query("SELECT pid, author, authorid, message, dateline FROM " . table('forum_post') . "
    WHERE tid = {$tid} AND first = 0 AND invisible = 0
    ORDER BY dateline ASC LIMIT {$offset}, {$perpage}");
while ($row = $repStmt->fetch()) {
    $replyList[] = [
        'pid'      => intval($row['pid']),
        'author'   => $row['author'],
        'authorid' => intval($row['authorid']),
        'message'  => $row['message'],
        'dateline' => intval($row['dateline']),
    ];
}

$native=desktop_native_content($tid,$page);$firstNative=$page===1?$native:desktop_native_content($tid,1);
$messageHtml=$firstNative?($firstNative['posts'][$firstPid] ?? '<div class="locked">当前账号暂时无法查看正文，请在论坛完成访问验证。</div>'):zo_bbcode_html($firstPost['message'] ?? '');
foreach($replyList as &$reply){$reply['message']=$native?($native['posts'][$reply['pid']] ?? '<div class="locked">此回复暂不可查看。</div>'):zo_bbcode_html($reply['message']);}unset($reply);
$visibleAttachments=[];foreach($attachments as $att){if(empty($att['isimage'])||(int)$att['pid']!==$firstPid)continue;$imageUrl=desktop_attachment_url($att);if($imageUrl!==''&&strpos(html_entity_decode($messageHtml,ENT_QUOTES,'UTF-8'),$imageUrl)!==false)$visibleAttachments[]=['aid'=>(int)$att['aid'],'filename'=>$att['filename'],'filesize'=>(int)$att['filesize'],'isimage'=>true,'url'=>$imageUrl];}
$labels=json_decode(file_get_contents(__DIR__.'/content_labels.json'),true) ?: [];
foreach($typeOptions as &$option){$option['title']=$labels[$option['identifier']] ?? (preg_match('/[\x{4e00}-\x{9fff}]/u',$option['title'])?$option['title']:'资源信息');}unset($option);

json_out('success', 'ok', [
    'tid'        => intval($thread['tid']),
    'fid'        => intval($thread['fid']),
    'forum_name' => $forumName,
    'subject'    => $thread['subject'],
    'author'     => $thread['author'],
    'authorid'   => intval($thread['authorid']),
    'dateline'   => intval($thread['dateline']),
    'views'      => intval($thread['views']) + 1,
    'replies'    => intval($thread['replies']),
    'digest'     => intval($thread['digest']),
    'displayorder'=>intval($thread['displayorder']),
    'message'    => $messageHtml,
    'message_html' => $messageHtml,
    'render_assets' => ['enabled'=>true,'engine'=>$firstNative?'discuz-native':'safe-fallback','css'=>$firstNative['css'] ?? ''],
    'content_labels'=>$labels,
    'attachments'=>$visibleAttachments,
    'sort_title' => $sortTitle,
    'sort_options' => $typeOptions,
    'reply_list' => $replyList,
    'page'       => $page,
    'perpage'    => $perpage,
    'total_replies' => $totalReplies,
    'total_reply_pages' => $totalReplies > 0 ? intval(ceil($totalReplies / $perpage)) : 1,
]);

function bbcode_to_html($text, $attachments = []) {
    if (empty($text)) return '';
    $text = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    $text = preg_replace_callback('/\[hide(?:=([^\]]*))?\](.*?)\[\/hide\]/is', function ($match) {
        global $pdo, $thread;
        $viewer = current_user();
        $allowed = $viewer && (int) $viewer['uid'] === (int) $thread['authorid'];
        if (!$allowed && $viewer && empty($match[1])) {
            $query = $pdo->prepare('SELECT pid FROM ' . table('forum_post') . ' WHERE tid = ? AND authorid = ? AND invisible = 0 AND first = 0 LIMIT 1');
            $query->execute([(int) $thread['tid'], (int) $viewer['uid']]); $allowed = (bool) $query->fetchColumn();
        }
        return $allowed ? $match[2] : '<div class="hidden-content">回复后可见，请在论坛页面查看</div>';
    }, $text);

    // 处理 [attach]aid[/attach]
    $text = preg_replace_callback('/\[attach\](\d+)\[\/attach\]/is', function($m) use ($attachments) {
        $aid = intval($m[1]);
        if (!empty($attachments[$aid])) {
            $att = $attachments[$aid];
            $url = desktop_attachment_url($att);
            if ($att['isimage']) {
                return '<img src="' . $url . '" style="max-width:100%;border-radius:8px;margin:8px 0;" />';
            }
            $downloadUrl = 'https://www.zozse.cn/forum.php?mod=attachment&aid=' . $aid;
            return '<a href="' . $downloadUrl . '" target="_blank" style="display:inline-block;padding:8px 12px;background:rgba(59,130,246,0.15);border-radius:6px;color:#60A5FA;">附件：' . htmlspecialchars($att['filename']) . '</a>';
        }
        return '<a href="https://www.zozse.cn/forum.php?mod=attachment&aid=' . $aid . '" target="_blank" style="color:#60A5FA;">附件 #' . $aid . '</a>';
    }, $text);

    $text = preg_replace('/\[b\](.*?)\[\/b\]/is', '<b>$1</b>', $text);
    $text = preg_replace('/\[i\](.*?)\[\/i\]/is', '<i>$1</i>', $text);
    $text = preg_replace('/\[u\](.*?)\[\/u\]/is', '<u>$1</u>', $text);
    $text = preg_replace_callback('/\[img(?:=\d+[,x]\d+)?\](.*?)\[\/img\]/is', function($m) {
        $url = desktop_post_image_url(trim($m[1]));
        return '<img src="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '" class="bbcode-image" loading="lazy" />';
    }, $text);
    $text = preg_replace_callback('/\[url=([^\]]*)\](.*?)\[\/url\]/is', function ($m) { $url = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8'); return preg_match('#^https://#i', $url) ? '<a href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '">' . $m[2] . '</a>' : $m[2]; }, $text);
    $text = preg_replace('/\[url\](.*?)\[\/url\]/is', '<a href="$1" target="_blank">$1</a>', $text);
    $text = preg_replace('/\[quote\](.*?)\[\/quote\]/is', '<blockquote style="border-left:3px solid #E2E8F0;padding:8px 12px;margin:8px 0;color:#64748B;font-size:13px;">$1</blockquote>', $text);
    $text = preg_replace('/\[align=(left|center|right)\](.*?)\[\/align\]/is', '<div class="bbcode-align-$1">$2</div>', $text);
    $text = preg_replace('/\[font(?:=[^\]]*)?\](.*?)\[\/font\]/is', '<span class="bbcode-font">$1</span>', $text);

    $text = preg_replace('/\[list(?:=1)?\](.*?)\[\/list\]/is', '<ul class="bbcode-list">$1</ul>', $text);
    $text = preg_replace('/\[\*\](.*?)(?=\[\*\]|<\/ul>)/is', '<li>$1</li>', $text);
    $text = preg_replace('/\[code\](.*?)\[\/code\]/is', '<pre class="bbcode-code"><code>$1</code></pre>', $text);
    $text = preg_replace('/\[color=([^\]]+)\](.*?)\[\/color\]/is', '<span style="color:$1">$2</span>', $text);
    $text = preg_replace('/\[size=([^\]]+)\](.*?)\[\/size\]/is', '<span style="font-size:$1">$2</span>', $text);
    $text = preg_replace('/\[hr\]/is', '<hr style="border:none;border-top:1px solid #E2E8F0;margin:12px 0;" />', $text);
    $text = nl2br($text);
    return $text;
}

function desktop_format_sort_value($value, $option) {
    $type = strtolower((string) ($option['type'] ?? ''));
    if (!in_array($type, ['select', 'radio', 'checkbox'], true)) return $value;
    $rules = @unserialize((string) ($option['rules'] ?? ''), ['allowed_classes' => false]);
    if (!is_array($rules) || empty($rules['choices'])) return $value;
    $choices = [];
    foreach (preg_split('/\r?\n/', (string) $rules['choices']) as $line) {
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) $choices[trim($parts[0])] = trim($parts[1]);
    }
    $selected = $type === 'checkbox' ? preg_split('/[\t,]+/', (string) $value) : [(string) $value];
    $labels = [];
    foreach ($selected as $key) {
        $key = trim($key);
        if ($key !== '') $labels[] = $choices[$key] ?? $key;
    }
    return $labels ? implode('、', $labels) : $value;
}

function desktop_attachment_url($attachment) {
    return desktop_forum_attachment_url($attachment['attachment'] ?? '', intval($attachment['remote'] ?? 0));
}

function desktop_post_image_url($url) {
    $url = html_entity_decode(trim((string) $url), ENT_QUOTES, 'UTF-8');
    $url = preg_replace('#^https?://(?:www\.)?zozse\.cn/data/attachment/forum/#i', 'https://tp.zozse.cn/forum/', $url);
    $url = preg_replace('#^(?:https?://)?tp\.zozse\.cn/#i', 'https://tp.zozse.cn/', $url);
    if (preg_match('#^(?:\./|/)?data/attachment/forum/(.+)$#i', $url, $match)) {
        return 'https://tp.zozse.cn/forum/' . ltrim($match[1], '/');
    }
    if (!preg_match('#^https?://#i', $url)) {
        return 'https://www.zozse.cn/' . ltrim($url, '/');
    }
    return preg_replace('#^http:#i', 'https:', $url);
}

function desktop_apply_hidethreadsort($pdo, $thread, $options, $viewer) {
    $fieldTable = table('plugin_hidethreadsort_field');
    if (!table_has_column($pdo, $fieldTable, 'id') || !$options) return $options;

    $stmt = $pdo->prepare("SELECT id, optionlist, forumid, afterdays, showtype, parameters FROM {$fieldTable} WHERE sortid = ? AND (forumid = 0 OR forumid = ?)");
    $stmt->execute([intval($thread['sortid']), intval($thread['fid'])]);
    $rules = $stmt->fetchAll();
    if (!$rules) return $options;

    $viewerUid = intval($viewer['uid'] ?? 0);
    $member = ['groupid' => 0, 'credits' => 0];
    $counts = [];
    if ($viewerUid > 0) {
        $memberStmt = $pdo->prepare("SELECT groupid, credits FROM " . table('common_member') . " WHERE uid = ? LIMIT 1");
        $memberStmt->execute([$viewerUid]);
        $member = $memberStmt->fetch() ?: $member;
        $countStmt = $pdo->prepare("SELECT * FROM " . table('common_member_count') . " WHERE uid = ? LIMIT 1");
        $countStmt->execute([$viewerUid]);
        $counts = $countStmt->fetch() ?: [];
    }

    foreach ($options as &$option) {
        foreach ($rules as $rule) {
            $optionIds = array_filter(array_map('intval', explode(',', (string) $rule['optionlist'])));
            if (!in_array(intval($option['optionid'] ?? 0), $optionIds, true)) continue;
            if ($viewerUid > 0 && intval($thread['authorid']) === $viewerUid) continue;
            if (time() - intval($thread['dateline']) < intval($rule['afterdays']) * 86400) continue;

            $parameters = @unserialize($rule['parameters'], ['allowed_classes' => false]);
            if (!is_array($parameters)) $parameters = [];
            $vipGroups = array_map('intval', (array) ($parameters['vipgroup'] ?? []));
            if (in_array(intval($member['groupid'] ?? 0), $vipGroups, true)) continue;

            $allowed = false;
            $action = 'none';
            $actionUrl = '';
            $message = '该分类信息暂不可见';
            switch ((string) $rule['showtype']) {
                case 'login':
                    $allowed = $viewerUid > 0;
                    $action = 'login';
                    $message = '登录后查看';
                    break;
                case 'buy':
                    if ($viewerUid > 0 && table_has_column($pdo, table('plugin_hidethreadsort_buy'), 'id')) {
                        $buyTable = table('plugin_hidethreadsort_buy');
                        $sql = "SELECT id FROM {$buyTable} WHERE uid = ? AND tid = ?";
                        $params = [$viewerUid, intval($thread['tid'])];
                        if (empty($parameters['once'])) {
                            $sql .= ' AND fieldid = ?';
                            $params[] = intval($rule['id']);
                        }
                        $sql .= ' LIMIT 1';
                        $buyStmt = $pdo->prepare($sql);
                        $buyStmt->execute($params);
                        $allowed = (bool) $buyStmt->fetchColumn();
                    }
                    $creditNum = intval($parameters['creditnum'] ?? 0);
                    if (!empty($parameters['credittids'])) {
                        foreach (preg_split('/[\r\n]+/', trim($parameters['credittids'])) as $line) {
                            list($targetTid, $targetCredit) = array_pad(explode('=', $line, 2), 2, 0);
                            if (intval($targetTid) === intval($thread['tid'])) $creditNum = intval($targetCredit);
                        }
                    }
                    $action = 'site';
                    $actionUrl = 'https://www.zozse.cn/plugin.php?id=hidethreadsort:payment&tid=' . intval($thread['tid']) . '&fieldid=' . intval($rule['id']);
                    $message = ($creditNum > 0 ? $creditNum . ' 积分购买' : '购买') . '后查看';
                    break;
                case 'reply':
                    if ($viewerUid > 0) {
                        $replyStmt = $pdo->prepare("SELECT pid FROM " . table('forum_post') . " WHERE tid = ? AND authorid = ? AND first = 0 LIMIT 1");
                        $replyStmt->execute([intval($thread['tid']), $viewerUid]);
                        $allowed = (bool) $replyStmt->fetchColumn();
                    }
                    $action = 'reply';
                    $message = '回复后查看';
                    break;
                case 'credit':
                    $required = intval($parameters['creditnum'] ?? 0);
                    $allowed = intval($member['credits'] ?? 0) >= $required;
                    $message = '积分达到 ' . $required . ' 后查看';
                    break;
                case 'vipuser':
                    $message = '指定用户组可见';
                    break;
                case 'pwverify':
                    $cookieName = cookie_pre() . 'hideoptionpw_' . intval($thread['tid']) . '_' . intval($rule['id']);
                    $allowed = isset($_COOKIE[$cookieName]) && hash_equals((string) ($parameters['password'] ?? ''), (string) $_COOKIE[$cookieName]);
                    $action = 'site';
                    $actionUrl = 'https://www.zozse.cn/plugin.php?id=hidethreadsort:pwverify&tid=' . intval($thread['tid']) . '&fieldid=' . intval($rule['id']);
                    $message = '输入密码后查看';
                    break;
                default:
                    $allowed = true;
            }
            if (!$allowed) {
                $option['value'] = '';
                $option['protected'] = true;
                $option['action'] = $action;
                $option['action_url'] = $actionUrl;
                $option['message'] = $message;
            }
            break;
        }
    }
    unset($option);
    return $options;
}
