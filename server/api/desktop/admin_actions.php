<?php
function desktop_admin_actions($action,$u,$input){
    $groups=['auth'=>'auth','features'=>'features','navigation'=>'navigation','theme'=>'theme','home_notices'=>'home_notices','floating'=>'floating_notices'];
    if($action==='get_overview')$action='get';
    if(strpos($action,'get_')===0&&isset($groups[substr($action,4)])){$group=$groups[substr($action,4)];$c=desktop_config_get();return ['config'=>$c[$group],'formhash'=>desktop_admin_formhash($u),'revision'=>$c['_revision'] ?? ''];}
    if($action==='get'){try{$c=desktop_config_read_db();$required=false;}catch(Throwable $e){$c=desktop_config_get();$required=true;}return ['config'=>$c,'formhash'=>desktop_admin_formhash($u),'initialization_required'=>$required,'game_info_defaults'=>desktop_game_info_defaults(),'forum_tree'=>get_pdo()->query('SELECT fid,fup,type,name FROM '.table('forum_forum')." WHERE status IN (1,3) ORDER BY fup,displayorder,fid")->fetchAll()];}
    desktop_config_install();$preview=$input['preview_token'] ?? ($_GET['preview_token'] ?? null);
    if($action==='refresh_cache'){desktop_config_invalidate();return ['refreshed'=>true];}
    if($action==='install')return ['config'=>desktop_config_read_db(),'installed'=>true];
    if($action==='test_start'){$token=bin2hex(random_bytes(16));$c=desktop_admin_preview_save($token,$u,desktop_config_read_db());return ['config'=>$c,'preview_token'=>$token,'formhash'=>desktop_admin_formhash($u)];}
    if($action==='test_end'){desktop_admin_preview_read($preview,$u);@unlink(desktop_admin_preview_path($preview));return ['ended'=>true];}
    $c=$preview?desktop_admin_preview_read($preview,$u)['config']:desktop_config_read_db();
    $previous=$c;
    if($action==='set_forum_order'){
        if($preview)desktop_config_error('验收环境不修改论坛板块。');
        $pdo=get_pdo();$before=$pdo->query('SELECT fid,simple FROM '.table('forum_forum')." WHERE type IN ('forum','sub')")->fetchAll();
        $pdo->exec('UPDATE '.table('forum_forum')." SET simple=((simple & ~224) | 64) WHERE type IN ('forum','sub')");
        $column=$pdo->query('SHOW COLUMNS FROM '.table('forum_forum')." LIKE 'simple'")->fetch();
        if((int)$column['Default']!==64)$pdo->exec('ALTER TABLE '.table('forum_forum').' ALTER COLUMN simple SET DEFAULT 64');
        // Refresh through the native Discuz cache builder, preserving all permissions.
        $preserved=[];foreach($GLOBALS as $key=>$v)if($key!=='GLOBALS'&&$key!=='_G')$preserved[$key]=$v;
        require_once __DIR__.'/../../source/class/class_core.php';$app=C::app();foreach($preserved as $key=>$v){$GLOBALS[$key]=$v;$app->superglobal[$key]=1;}$app->init_cron=false;$app->init();require_once libfile('function/cache');updatecache('forums');
        return ['forums'=>count($before),'previous'=>$before,'default_simple'=>64,'cache_refreshed'=>true];
    }
    if($action==='test_sort_rollback'){
        if($preview)desktop_config_error('排序回滚测试不使用配置预览。');
        $pdo=get_pdo();$table=table('forum_thread');$pdo->beginTransaction();
        try{$row=$pdo->query("SELECT tid,fid,dateline,lastpost FROM {$table} WHERE displayorder=0 ORDER BY lastpost ASC LIMIT 1 FOR UPDATE")->fetch();if(!$row)desktop_config_error('没有普通帖子。');$changed=max(time(),(int)$pdo->query("SELECT MAX(lastpost) FROM {$table}")->fetchColumn())+3600;$q=$pdo->prepare("UPDATE {$table} SET lastpost=? WHERE tid=?");$q->execute([$changed,$row['tid']]);$home=(int)$pdo->query("SELECT tid FROM {$table} WHERE displayorder>=0 ORDER BY lastpost DESC,tid DESC LIMIT 1")->fetchColumn();$forum=(int)$pdo->query("SELECT tid FROM {$table} WHERE fid=".(int)$row['fid']." AND displayorder=0 ORDER BY lastpost DESC,tid DESC LIMIT 1")->fetchColumn();$pdo->rollBack();$q=$pdo->prepare("SELECT lastpost FROM {$table} WHERE tid=?");$q->execute([$row['tid']]);$restored=(int)$q->fetchColumn()===(int)$row['lastpost'];if(!$restored||$home!==(int)$row['tid']||$forum!==(int)$row['tid'])desktop_config_error('最后回复排序验收失败。',503);return ['home_promoted'=>true,'forum_promoted'=>true,'rolled_back'=>true,'original_lastpost_restored'=>$restored];
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    if(strpos($action,'save_')===0&&isset($groups[substr($action,5)])){$group=$groups[substr($action,5)];$v=$input['config'] ?? $input[$group] ?? null;if(!is_array($v))desktop_config_error('请提供分组配置。');$c[$group]=$v;$action='save';$input['config']=$c;}
    if($action==='save'){$c=$input['config'] ?? null;if(!is_array($c))desktop_config_error('请提供配置对象。');}
    elseif($action==='set_run_state'){$r=$input['run_state'] ?? null;if(!is_array($r))desktop_config_error('请提供运行状态。');$c['run_state']=array_replace(desktop_config_defaults()['run_state'],$r);}
    elseif($action==='add_announcement'){$a=$input['announcement'] ?? null;if(!is_array($a))desktop_config_error('公告格式不正确。');$c['announcements'][]=$a;}
    elseif($action==='del_announcement'){$id=$input['id'] ?? '';$c['announcements']=array_values(array_filter($c['announcements'],function($a)use($id){return $a['id']!==$id;}));if(($c['announcement']['id'] ?? '')===$id)$c['announcement']['enabled']=false;}
    else desktop_config_error('操作不存在。',400);
    foreach(['home_notices','floating_notices'] as $group)if(isset($c[$group]))$c[$group]=desktop_stamp_notices($c[$group],$previous[$group] ?? []);
    $result=$preview?desktop_admin_preview_save($preview,$u,$c):desktop_config_save($c,$input['expected_revision'] ?? null);
    return ['config'=>$result,'formhash'=>desktop_admin_formhash($u)];
}
