<?php
require_once __DIR__.'/common.php';require_once __DIR__.'/config_store.php';require_once __DIR__.'/admin_auth.php';require_once __DIR__.'/admin_actions.php';
header('Cache-Control: no-store');
try{$admin=desktop_admin_identity();if(!$admin)desktop_config_error('无权访问，请先登录论坛管理账号。',403);
$action=$_GET['action'] ?? '';if($action!==''){$method=$_SERVER['REQUEST_METHOD'] ?? 'GET';$reads=['get','get_overview','get_auth','get_features','get_navigation','get_theme','get_home_notices','get_floating'];if($method!==(in_array($action,$reads,true)?'GET':'POST'))desktop_config_error('请求方法不支持。',405);$input=$_POST;if(stripos($_SERVER['CONTENT_TYPE'] ?? '','application/json')===0){$raw=file_get_contents('php://input',false,null,0,65537);if(strlen($raw)>65536)desktop_config_error('提交内容过长。',413);$input=json_decode($raw,true);if(!is_array($input))desktop_config_error('请求格式不正确。');}if($method==='POST')desktop_admin_check_csrf($admin,$input['formhash'] ?? null);json_out('success','ok',desktop_admin_actions($action,$admin,$input));}
$formhash=desktop_admin_formhash($admin);if(!defined('FORMHASH'))define('FORMHASH',$formhash);if($_SERVER['REQUEST_METHOD']==='POST'){desktop_admin_check_csrf($admin,$_POST['formhash'] ?? null);desktop_config_install();}
}catch(Throwable $e){http_response_code(get_class($e)==='RuntimeException'?$e->getCode():503);json_out('error',get_class($e)==='RuntimeException'?$e->getMessage():'后台暂时不可用，请稍后重试。');}
header('Content-Type: text/html; charset=utf-8');
$file = __DIR__ . '/client_config.json';
$releaseDir = __DIR__ . '/../../download/desktop';
$defaults=desktop_config_defaults();try{$saved=desktop_config_read_db();}catch(Throwable $e){$saved=desktop_config_get();}$config=$saved;
$ok = $error = '';

function h($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'upload_release') {
    if (($_POST['formhash'] ?? '') !== FORMHASH) {
        $error = '请求校验失败，请刷新后重试。';
    } else {
        $releaseVersion = trim((string) ($_POST['release_version'] ?? ''));
        $upload = $_FILES['installer'] ?? null;
        if (!preg_match('/^\d+(?:\.\d+){1,3}$/', $releaseVersion)) {
            $error = '发布版本格式不正确，例如 2.0.7。';
        } elseif (!$upload || ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $code = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
            $error = $code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE
                ? '安装包超过服务器上传限制，请确认 .user.ini 已生效。'
                : '请选择有效的 EXE 安装包。上传错误代码：' . $code;
        } elseif (strtolower(pathinfo($upload['name'], PATHINFO_EXTENSION)) !== 'exe') {
            $error = '仅允许上传 Windows EXE 安装包。';
        } else {
            if (!is_dir($releaseDir)) @mkdir($releaseDir, 0755, true);
            $releaseName = 'ZO论坛盒子 Setup ' . $releaseVersion . '.exe';
            $releasePath = $releaseDir . '/' . $releaseName;
            if (!is_dir($releaseDir) || !move_uploaded_file($upload['tmp_name'], $releasePath)) {
                $error = '安装包保存失败，请检查 download/desktop 目录权限。';
            } else {
                $sha512 = base64_encode(hash_file('sha512', $releasePath, true));
                $size = filesize($releasePath);
                $yamlName = str_replace(['\\', '"'], ['', '\\"'], $releaseName);
                $yaml = "version: {$releaseVersion}\nfiles:\n"
                    . "  - url: \"{$yamlName}\"\n    sha512: {$sha512}\n    size: {$size}\n"
                    . "path: \"{$yamlName}\"\nsha512: {$sha512}\nreleaseDate: '" . gmdate('c') . "'\n";
                $manifestTemp = $releaseDir . '/latest.yml.tmp';
                $manifestPath = $releaseDir . '/latest.yml';
                $notes = preg_split('/\r\n|\r|\n/', (string) ($_POST['release_notes'] ?? ''));
                $config['latest_version'] = $releaseVersion;
                $config['changelog'] = array_values(array_filter(array_map('trim', $notes)));
                $configJson = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
                if (file_put_contents($manifestTemp, $yaml, LOCK_EX) === false
                    || !rename($manifestTemp, $manifestPath)
                    || !desktop_config_save($config)) {
                    @unlink($manifestTemp);
                    $error = '安装包已上传，但发布清单生成失败，请检查目录权限。';
                } else {
                    $ok = "V{$releaseVersion} 已发布，客户端现在可以检测并下载更新。";
                }
            }
        }
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (($_POST['formhash'] ?? '') !== FORMHASH) {
        $error = '请求校验失败，请刷新后重试。';
    } elseif (!preg_match('/^\d+(?:\.\d+){1,3}$/', trim($_POST['latest_version'] ?? ''))
        || !preg_match('/^\d+(?:\.\d+){1,3}$/', trim($_POST['minimum_version'] ?? ''))) {
        $error = '版本号格式不正确，例如 3.0.0。';
    } else {
        $previousConfig = $config;
        $notes = preg_split('/\r\n|\r|\n/', (string) ($_POST['changelog'] ?? ''));
        $config = [
            'latest_version' => trim($_POST['latest_version']),
            'minimum_version' => trim($_POST['minimum_version']),
            'client_enabled' => isset($_POST['client_enabled']),
            'maintenance_message' => trim($_POST['maintenance_message'] ?? ''),
            'download_url' => trim($_POST['download_url'] ?? ''),
            'update_feed_url' => rtrim(trim($_POST['update_feed_url'] ?? ''), '/'),
            'force_update' => isset($_POST['force_update']),
            'check_interval_minutes' => max(15, min(1440, (int) ($_POST['check_interval_minutes'] ?? 180))),
            'auth' => [
                'login_enabled' => isset($_POST['login_enabled']),
                'register_enabled' => isset($_POST['register_enabled']),
                'qq_login_enabled' => isset($_POST['qq_login_enabled']),
                'disabled_message' => trim($_POST['auth_disabled_message'] ?? ''),
            ],
            'features' => [
                'search_enabled' => isset($_POST['search_enabled']),
                'ai_search_enabled' => isset($_POST['ai_search_enabled']),
                'notifications_enabled' => isset($_POST['notifications_enabled']),
                'posting_enabled' => isset($_POST['posting_enabled']),
            ],
            'changelog' => array_values(array_filter(array_map('trim', $notes))),
            'announcement' => [
                'enabled' => isset($_POST['announcement_enabled']),
                'id' => trim($_POST['announcement_id'] ?? ''),
                'title' => trim($_POST['announcement_title'] ?? ''),
                'content' => trim($_POST['announcement_content'] ?? ''),
                'button_text' => trim($_POST['announcement_button_text'] ?? ''),
                'link' => trim($_POST['announcement_link'] ?? ''),
            ],
        ];
        $config = array_replace_recursive($previousConfig, $config);
        if (isset($_POST['v22_config'])) {
            $advanced = json_decode((string) $_POST['v22_config'], true);
            if (!is_array($advanced)) { http_response_code(400); exit('v2.2 配置 JSON 格式错误，请返回修正。'); }
            require_once __DIR__ . '/config_v22.php';
            $config = array_replace_recursive($config, array_intersect_key($advanced, desktop_v22_defaults()));
        }
        if(!isset($_POST['client_enabled'])&&$config['run_state']['mode']==='normal')$config['run_state']=['mode'=>'disabled','can_run'=>false,'action'=>'notice','message'=>$config['maintenance_message']];
        try{$config=desktop_config_save($config);$ok='客户端配置已保存并立即生效。';}catch(Throwable $e){$error=$e instanceof RuntimeException?$e->getMessage():'保存失败，请稍后重试。';}
    }
}
?>
<?php require __DIR__ . '/admin_dashboard.php'; ?>
