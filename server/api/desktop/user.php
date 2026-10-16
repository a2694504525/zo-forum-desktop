<?php
/**
 * 桌面端 - 用户信息
 * GET: uid（可选，默认当前登录用户）
 */
require_once __DIR__ . '/common.php';

$uid = intval($_GET['uid'] ?? 0);
if ($uid < 1) {
    $user = current_user();
    if (!$user) {
        http_response_code(401);
        json_out('error', '请先登录');
    }
    $uid = $user['uid'];
}

$pdo = get_pdo();

$stmt = $pdo->prepare("SELECT uid, username, groupid, regdate, credits FROM " . table('common_member') . " WHERE uid = ? LIMIT 1");
$stmt->execute([$uid]);
$member = $stmt->fetch();
if (!$member) {
    json_out('error', '用户不存在');
}

$stats = ['threads' => 0, 'posts' => 0];
try {
    $count = $pdo->prepare("SELECT posts, threads
        FROM " . table('common_member_count') . " WHERE uid = ? LIMIT 1");
    $count->execute([$uid]);
    $row = $count->fetch();
    if ($row) {
        $stats = $row;
    }
} catch (Exception $e) {
    // 某些表不存在或字段不兼容时兜底
}

if (intval($stats['threads'] ?? 0) < 1) {
    try {
        $threadCountStmt = $pdo->prepare("SELECT COUNT(*) FROM " . table('forum_thread') . " WHERE authorid = ? AND displayorder >= 0");
        $threadCountStmt->execute([$uid]);
        $stats['threads'] = intval($threadCountStmt->fetchColumn());
    } catch (Exception $e) {
        // ignore
    }
}

if (intval($stats['posts'] ?? 0) < 1) {
    try {
        $postCountStmt = $pdo->prepare("SELECT COUNT(*) FROM " . table('forum_post') . " WHERE authorid = ? AND invisible = 0");
        $postCountStmt->execute([$uid]);
        $stats['posts'] = intval($postCountStmt->fetchColumn());
    } catch (Exception $e) {
        // ignore
    }
}

// 用户组名称
$groupname = '普通会员';
try {
    $gStmt = $pdo->prepare("SELECT grouptitle FROM " . table('common_usergroup') . " WHERE groupid = ? LIMIT 1");
    $gStmt->execute([$member['groupid']]);
    $groupRow = $gStmt->fetch();
    if ($groupRow) {
        $groupname = $groupRow['grouptitle'];
    }
} catch (Exception $e) {
    // ignore
}

$mobileBound = false;
$mobileMasked = '';
// Phone status is private: only expose it to the authenticated account owner.
$owner = current_user();
if ($owner && (int) $owner['uid'] === $uid) {
    try {
        $phone = $pdo->prepare('SELECT tel FROM ' . table('comiis_sms_user') . ' WHERE uid = ? ORDER BY dateline DESC LIMIT 1');
        $phone->execute([$uid]);
        $mobile = (string) $phone->fetchColumn();
        $mobileBound = $mobile !== '';
        $mobileMasked = $mobileBound ? substr($mobile, 0, 3) . '****' . substr($mobile, -4) : '';
    } catch (Exception $e) { /* Plugin disabled. */ }
}
json_out('success', 'ok', [
    'mobile_bound' => $mobileBound,
    'mobile_masked' => $mobileMasked,
    'uid'       => intval($member['uid']),
    'username'  => $member['username'],
    'groupname' => $groupname,
    'regdate'   => intval($member['regdate']),
    'credits'   => intval($member['credits'] ?? 0),
    'count'     => [
        'threads' => intval($stats['threads'] ?? 0),
        'posts'   => intval($stats['posts'] ?? 0),
    ],
]);
