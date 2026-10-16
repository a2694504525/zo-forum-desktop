<?php
/**
 * 桌面端会员同步辅助
 * 用于在仅调用 UCenter 接口时，补齐 Discuz 论坛侧的用户主表和附属资料表。
 */

function desktop_get_pdo() {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    global $_config;
    $dbConfig = $_config['db']['1'];
    $dsn = "mysql:host={$dbConfig['dbhost']};dbname={$dbConfig['dbname']};charset={$dbConfig['dbcharset']}";
    $pdo = new PDO($dsn, $dbConfig['dbuser'], $dbConfig['dbpw'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

function desktop_table($name) {
    global $_config;
    return $_config['db']['1']['tablepre'] . $name;
}

function desktop_get_columns($pdo, $tableName) {
    static $cache = [];
    if (isset($cache[$tableName])) {
        return $cache[$tableName];
    }

    $columns = [];
    $stmt = $pdo->query("SHOW COLUMNS FROM {$tableName}");
    while ($row = $stmt->fetch()) {
        $columns[$row['Field']] = $row;
    }
    $cache[$tableName] = $columns;
    return $columns;
}

function desktop_insert_filtered($pdo, $tableName, array $data) {
    $columns = desktop_get_columns($pdo, $tableName);
    $filtered = [];
    foreach ($data as $column => $value) {
        if (isset($columns[$column])) {
            $filtered[$column] = $value;
        }
    }
    // 兼容开启严格模式的 Discuz 数据库：部分会员附属表存在无默认值的必填列。
    foreach ($columns as $column => $meta) {
        if (array_key_exists($column, $filtered)) continue;
        $isRequired = ($meta['Null'] ?? 'YES') === 'NO' && ($meta['Default'] ?? null) === null;
        $isAutoIncrement = stripos((string) ($meta['Extra'] ?? ''), 'auto_increment') !== false;
        if (!$isRequired || $isAutoIncrement) continue;
        $type = strtolower((string) ($meta['Type'] ?? ''));
        $filtered[$column] = preg_match('/int|decimal|float|double|bit/', $type) ? 0 : '';
    }
    if (!$filtered) {
        return false;
    }

    $keys = array_keys($filtered);
    $placeholders = implode(', ', array_fill(0, count($keys), '?'));
    $sql = "INSERT INTO {$tableName} (" . implode(', ', $keys) . ") VALUES ({$placeholders})";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_values($filtered));
    return true;
}

function desktop_update_filtered($pdo, $tableName, array $data, $uid) {
    $columns = desktop_get_columns($pdo, $tableName);
    $filtered = [];
    foreach ($data as $column => $value) {
        if ($column !== 'uid' && isset($columns[$column])) {
            $filtered[$column] = $value;
        }
    }
    if (!$filtered) {
        return false;
    }

    $assignments = [];
    foreach (array_keys($filtered) as $column) {
        $assignments[] = "{$column} = ?";
    }
    $sql = "UPDATE {$tableName} SET " . implode(', ', $assignments) . " WHERE uid = ?";
    $stmt = $pdo->prepare($sql);
    $params = array_values($filtered);
    $params[] = $uid;
    $stmt->execute($params);
    return true;
}

function desktop_fetch_member($pdo, $uid) {
    $stmt = $pdo->prepare("SELECT uid, username, password, email, groupid, adminid, regdate FROM " . desktop_table('common_member') . " WHERE uid = ? LIMIT 1");
    $stmt->execute([$uid]);
    return $stmt->fetch();
}

function desktop_row_exists($pdo, $tableName, $uid) {
    $stmt = $pdo->prepare("SELECT uid FROM {$tableName} WHERE uid = ? LIMIT 1");
    $stmt->execute([$uid]);
    return (bool) $stmt->fetchColumn();
}

function desktop_resolve_default_groupid($pdo) {
    $usergroupTable = desktop_table('common_usergroup');
    try {
        $stmt = $pdo->query("SELECT groupid FROM {$usergroupTable} WHERE type = 'member' AND creditshigher = 0 ORDER BY groupid ASC LIMIT 1");
        $groupid = intval($stmt->fetchColumn());
        if ($groupid > 0) {
            return $groupid;
        }
    } catch (Exception $e) {
        // ignore
    }

    try {
        $stmt = $pdo->query("SELECT groupid FROM {$usergroupTable} WHERE groupid = 10 LIMIT 1");
        $groupid = intval($stmt->fetchColumn());
        if ($groupid > 0) {
            return $groupid;
        }
    } catch (Exception $e) {
        // ignore
    }

    return 10;
}

function desktop_ensure_member_synced($pdo, $uid, $username, $password, $email, $ip = '0.0.0.0', $port = 0) {
    $uid = intval($uid);
    if ($uid < 1) {
        throw new InvalidArgumentException('无效的 uid');
    }

    $memberTable = desktop_table('common_member');
    $statusTable = desktop_table('common_member_status');
    $countTable = desktop_table('common_member_count');
    $profileTable = desktop_table('common_member_profile');
    $fieldForumTable = desktop_table('common_member_field_forum');
    $fieldHomeTable = desktop_table('common_member_field_home');

    $member = desktop_fetch_member($pdo, $uid);
    $groupid = intval($member['groupid'] ?? 0) ?: desktop_resolve_default_groupid($pdo);
    $adminid = intval($member['adminid'] ?? 0);
    $timestamp = time();

    $pdo->beginTransaction();
    try {
        if (!$member) {
            desktop_insert_filtered($pdo, $memberTable, [
                'uid' => $uid,
                'username' => (string) $username,
                'password' => (string) $password,
                'email' => (string) $email,
                'adminid' => $adminid,
                'groupid' => $groupid,
                'regdate' => $timestamp,
                'credits' => 0,
                'timeoffset' => 9999,
                'emailstatus' => 0,
            ]);
        } else {
            desktop_update_filtered($pdo, $memberTable, [
                'username' => (string) $username,
                'password' => (string) $password,
                'email' => (string) $email,
                'groupid' => $groupid ?: 10,
            ], $uid);
        }

        if (!desktop_row_exists($pdo, $statusTable, $uid)) {
            desktop_insert_filtered($pdo, $statusTable, [
                'uid' => $uid,
                'regip' => (string) $ip,
                'lastip' => (string) $ip,
                'port' => (string) $port,
                'regport' => (string) $port,
                'lastvisit' => $timestamp,
                'lastactivity' => $timestamp,
                'lastpost' => 0,
                'lastsendmail' => 0,
            ]);
        }

        if (!desktop_row_exists($pdo, $countTable, $uid)) {
            desktop_insert_filtered($pdo, $countTable, [
                'uid' => $uid,
                'extcredits1' => 0,
                'extcredits2' => 0,
                'extcredits3' => 0,
                'extcredits4' => 0,
                'extcredits5' => 0,
                'extcredits6' => 0,
                'extcredits7' => 0,
                'extcredits8' => 0,
            ]);
        }

        if (!desktop_row_exists($pdo, $profileTable, $uid)) {
            desktop_insert_filtered($pdo, $profileTable, [
                'uid' => $uid,
            ]);
        }

        if (!desktop_row_exists($pdo, $fieldForumTable, $uid)) {
            desktop_insert_filtered($pdo, $fieldForumTable, [
                'uid' => $uid,
            ]);
        }

        if (!desktop_row_exists($pdo, $fieldHomeTable, $uid)) {
            desktop_insert_filtered($pdo, $fieldHomeTable, [
                'uid' => $uid,
            ]);
        }

        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $member = desktop_fetch_member($pdo, $uid);
    if (!$member) {
        throw new RuntimeException('论坛用户同步失败');
    }
    return $member;
}

function desktop_create_session($pdo, $uid, $username, $groupid, $ip = '0.0.0.0') {
    $sessionTable = desktop_table('common_session');
    $alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $sid = '';
    for ($index = 0; $index < 6; $index++) {
        $sid .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    $timestamp = time();

    $pdo->prepare("DELETE FROM {$sessionTable} WHERE uid = ? OR sid = ?")
        ->execute([$uid, $sid]);

    $pdo->prepare("INSERT INTO {$sessionTable}
        (sid, ip, uid, username, groupid, invisible, action, lastactivity, lastolupdate, fid, tid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        ->execute([
            $sid,
            $ip,
            intval($uid),
            (string) $username,
            intval($groupid),
            0,
            0,
            $timestamp,
            0,
            0,
            0,
        ]);

    return [
        'sid' => $sid,
        'timestamp' => $timestamp,
    ];
}

function desktop_set_auth_cookies($sid, $uid, $expires) {
    global $_config;
    $cookiepre = $_config['cookie']['cookiepre'] ?? '';
    $cookiedomain = $_config['cookie']['cookiedomain'] ?? '';
    $cookiepath = $_config['cookie']['cookiepath'] ?? '/';
    $options = [
        'expires' => $expires,
        'path' => $cookiepath,
        'domain' => $cookiedomain,
        'secure' => true,
        'httponly' => true,
        'samesite' => 'None',
    ];
    setcookie($cookiepre . 'sid', (string) $sid, $options);
    setcookie($cookiepre . 'uid', (string) $uid, $options);
}
