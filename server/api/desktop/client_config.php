<?php
require_once __DIR__.'/common.php';
require_once __DIR__.'/config_store.php';
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');header('Pragma: no-cache');
if(isset($_GET['preview'])){require_once __DIR__.'/admin_auth.php';try{$u=desktop_admin_identity();if(!$u)desktop_config_error('无权访问验收配置。',403);$v=desktop_admin_preview_read($_GET['preview'],$u);json_out('success','ok',$v['config']);}catch(Throwable $e){http_response_code($e instanceof RuntimeException?$e->getCode():503);json_out('error',$e instanceof RuntimeException?$e->getMessage():'配置暂时不可用。');}}
$config=desktop_config_get();$config['forum_stats']=desktop_forum_stats();json_out('success','ok',$config);
