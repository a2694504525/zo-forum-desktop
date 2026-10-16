<?php
require_once __DIR__.'/config_contract.php';
require_once __DIR__.'/layout_config.php';
// One configuration source for the panel, public endpoint and API switches.
function desktop_config_defaults(){
    require_once __DIR__.'/config_v22.php';
    return array_replace_recursive(desktop_v22_defaults(),desktop_layout_defaults(),[
        'latest_version'=>'0.0.0','minimum_version'=>'2.0.0','client_enabled'=>true,'maintenance_message'=>'',
        'download_url'=>'https://www.z19m.com/','update_feed_url'=>'https://www.z19m.com/download/desktop',
        'force_update'=>false,'check_interval_minutes'=>180,'control_poll_seconds'=>2,'changelog'=>[],
        'auth'=>['login_enabled'=>true,'register_enabled'=>true,'qq_login_enabled'=>true,'disabled_message'=>''],
        'features'=>['search_enabled'=>true,'notifications_enabled'=>true,'posting_enabled'=>true],
        'announcement'=>['enabled'=>false,'id'=>'','title'=>'','content'=>'','button_text'=>'','link'=>'']
    ]);
}
function desktop_config_error($message,$code=400){throw new RuntimeException($message,$code);}
function desktop_config_url($value){
    if($value==='')return true;$u=parse_url($value);
    return is_array($u)&&($u['scheme'] ?? '')==='https'&&empty($u['user'])&&empty($u['pass'])&&empty($u['port'])&&preg_match('/^(?:[a-z0-9-]+\.)*zozse\.cn$/i',$u['host'] ?? '');
}
function desktop_release_url($value){if(desktop_config_url($value))return true;if(!is_string($value))return false;$u=parse_url($value);return $u&&($u['scheme'] ?? '')==='https'&&empty($u['user'])&&empty($u['pass'])&&empty($u['port'])&&in_array(strtolower($u['host'] ?? ''),['www.z19m.com','z19m.com'],true);}
function desktop_config_validate($value){
    if(!is_array($value)||strlen(json_encode($value,JSON_UNESCAPED_UNICODE))>60000)desktop_config_error('配置格式错误或内容超过 60 KB。');
    unset($value['_revision'],$value['_updated_at'],$value['preview'],$value['anniversary'],$value['i18n']);
    unset($value['features']['ai_search_enabled']);
    if(array_key_exists('game_info',$value)&&!is_array($value['game_info']))desktop_config_error('游戏信息配置必须是对象。');
    $defaults=desktop_config_defaults();foreach($value as $key=>$v)if(!array_key_exists($key,$defaults))desktop_config_error('未知配置项：'.$key);
    foreach(['auth','features','app','navigation','theme','run_state','update','announcement'] as $key)if(isset($value[$key])&&!is_array($value[$key]))desktop_config_error($key.' 必须为对象。');
    if(!isset($value['run_state'])&&isset($value['client_enabled'])&&!$value['client_enabled'])$value['run_state']=['mode'=>'disabled','can_run'=>false,'message'=>$value['maintenance_message'] ?? ''];
    $c=array_replace_recursive($defaults,$value);
    // Lists must replace, not recursively retain removed items.
    foreach(['announcements','home_notices','floating_notices','changelog','banners','home_tabs','forum_filters'] as $key)if(array_key_exists($key,$value))$c[$key]=$value[$key];
    foreach(['items','order'] as $key)if(isset($value['navigation'][$key]))$c['navigation'][$key]=$value['navigation'][$key];
    if(isset($value['theme']['available']))$c['theme']['available']=$value['theme']['available'];
    foreach(['latest_version','minimum_version'] as $key)if(!is_string($c[$key])||!preg_match('/^\d{1,3}\.\d{1,3}\.\d{1,3}$/',$c[$key]))desktop_config_error('版本号格式不正确。');
    foreach(['client_enabled','force_update'] as $key)if(!is_bool($c[$key]))desktop_config_error($key.' 必须为布尔值。');
    foreach(['auth','features'] as $section)foreach($c[$section] as $key=>$v){if(preg_match('/_enabled$|^bind_mobile_required$/',$key)&&!is_bool($v))desktop_config_error($section.'.'.$key.' 必须为布尔值。');if(is_string($v)&&strlen($v)>1000)desktop_config_error('配置文案过长。');}
    $r=$c['run_state'];if(!in_array($r['mode'],['normal','maintenance','disabled'],true)||!in_array($r['action'],['notice','lock','exit'],true)||!is_bool($r['can_run']))desktop_config_error('运行状态格式不正确。');
    foreach(['message','close_reason','resume_at','link'] as $key)if(!is_string($r[$key])||strlen($r[$key])>10000)desktop_config_error('运行状态文案格式不正确。');
    $r['check_interval']=max(2,min(86400,(int)$r['check_interval']));$c['run_state']=$r;
    if(!desktop_config_url($r['link']))desktop_config_error('公告链接仅允许论坛 HTTPS 地址。');
    foreach(['download_url','update_feed_url'] as $key)if(!is_string($c[$key])||!desktop_release_url($c[$key]))desktop_config_error('下载地址不正确。');
    foreach(['site_url','api_base','image_cdn','download_url'] as $key)if(isset($c['app'][$key])&&(!is_string($c['app'][$key])||!($key==='download_url'?desktop_release_url($c['app'][$key]):desktop_config_url($c['app'][$key]))))desktop_config_error('应用地址不正确。');
    $c['control_poll_seconds']=max(2,min(3,(int)$c['control_poll_seconds']));$c['check_interval_minutes']=max(15,min(1440,(int)$c['check_interval_minutes']));
    if(!is_array($c['changelog'])||count($c['changelog'])>100)desktop_config_error('更新说明格式不正确。');foreach($c['changelog'] as $v)if(!is_string($v)||strlen($v)>2000)desktop_config_error('更新说明过长。');
    if(!is_array($c['announcements'])||count($c['announcements'])>50)desktop_config_error('公告最多 50 条。');
    $seen=[];foreach($c['announcements'] as &$a){if(!is_array($a)||!is_string($a['id'] ?? null)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/',$a['id'])||isset($seen[$a['id']]))desktop_config_error('公告 ID 为空、重复或格式不正确。');$seen[$a['id']]=true;
        $a=array_replace(['title'=>'','content'=>'','button_text'=>'','link'=>'','level'=>'info','enabled'=>true,'start_at'=>'','end_at'=>''],$a);
        foreach(['title','content','button_text','link','start_at','end_at'] as $key)if(!is_string($a[$key])||strlen($a[$key])>10000)desktop_config_error('公告字段格式不正确。');
        if(!is_bool($a['enabled'])||!in_array($a['level'],['info','warning','critical'],true)||!desktop_config_url($a['link']))desktop_config_error('公告开关、等级或链接格式不正确。');
        foreach(['start_at','end_at'] as $key)if($a[$key]!==''&&strtotime($a[$key].'+08:00')===false)desktop_config_error('公告时间不正确。');
    }unset($a);
    $c['navigation']=desktop_navigation_contract($c['navigation']);
    foreach(['home_notices','floating_notices'] as $k)$c[$k]=desktop_notice_list($c[$k]);
    $colors=['blue','purple','green','orange'];if(!in_array($c['theme']['default'],$colors,true)||!is_array($c['theme']['available'])||!$c['theme']['available']||array_diff($c['theme']['available'],$colors)||!in_array($c['theme']['appearance'],['light','dark','system'],true)||!is_bool($c['theme']['allow_user_change']))desktop_config_error('主题配置不正确。');
    if($r['mode']==='disabled')$c['run_state']['can_run']=false;
    $c['client_enabled']=$c['run_state']['mode']!=='disabled'&&$c['run_state']['can_run'];
    $c['maintenance_message']=$r['mode']==='normal'&&$c['client_enabled']?'':($r['close_reason'] ?: $r['message']);
    if($c['announcements']){$c['announcement']=end($c['announcements']);$c['announcement']['enabled']=$c['announcement']['enabled']===true;}
    if(isset($value['game_info'])&&array_key_exists('fields',$value['game_info']))$c['game_info']['fields']=$value['game_info']['fields'];
    return desktop_layout_validate($c);
}
function desktop_config_file(){return __DIR__.'/client_config.json';}
function desktop_config_install(){
    $pdo=get_pdo();$pdo->exec('CREATE TABLE IF NOT EXISTS '.table('desktop_config').' (config_key VARCHAR(64) NOT NULL PRIMARY KEY,config_value TEXT NOT NULL,updated_at INT UNSIGNED NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    if((int)$pdo->query('SELECT COUNT(*) FROM '.table('desktop_config'))->fetchColumn()===0){
        $saved=is_file(desktop_config_file())?json_decode(file_get_contents(desktop_config_file()),true):[];
        if(!is_array($saved))$saved=[];if(empty($saved['run_state'])&&isset($saved['client_enabled'])&&!$saved['client_enabled'])$saved['run_state']=['mode'=>'disabled','can_run'=>false,'message'=>$saved['maintenance_message'] ?? ''];
        desktop_config_save($saved);
    }
}
function desktop_config_read_db(){
    $rows=get_pdo()->query('SELECT config_key,config_value,updated_at FROM '.table('desktop_config').' ORDER BY config_key')->fetchAll();$values=[];$meta=[];
    foreach($rows as $row){$decoded=json_decode($row['config_value'],true,64,JSON_THROW_ON_ERROR);if($row['config_key']==='__revision')$meta=$decoded;else $values[$row['config_key']]=$decoded;}
    if(!$rows)desktop_config_error('客户端配置尚未初始化。',503);
    $c=desktop_config_validate($values);$c['_revision']=$meta['revision'] ?? '';$c['_updated_at']=(int)($meta['updated_at'] ?? 0);return $c;
}
function desktop_config_invalidate(){@unlink(__DIR__.'/client_config.cache.php');}
function desktop_config_save($value,$expected=null){
    $c=desktop_config_validate($value);$pdo=get_pdo();$pdo->exec('SET NAMES utf8mb4');$pdo->beginTransaction();
    try{$q=$pdo->query('SELECT config_value FROM '.table('desktop_config')." WHERE config_key='__revision' FOR UPDATE");$old=json_decode((string)$q->fetchColumn(),true);
        if($expected!==null&&$expected!==($old['revision'] ?? ''))desktop_config_error('配置已被其他操作修改，请刷新后重试。',409);
        $pdo->exec('DELETE FROM '.table('desktop_config'));$stmt=$pdo->prepare('INSERT INTO '.table('desktop_config').' (config_key,config_value,updated_at) VALUES (?,?,?)');$now=time();
        foreach($c as $key=>$v)$stmt->execute([$key,json_encode($v,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$now]);
        $revision=bin2hex(random_bytes(12));$stmt->execute(['__revision',json_encode(['revision'=>$revision,'updated_at'=>$now]),$now]);$pdo->commit();
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    desktop_config_invalidate();$tmp=desktop_config_file().'.tmp';if(file_put_contents($tmp,json_encode($c,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX)!==false)@rename($tmp,desktop_config_file());
    $c['_revision']=$revision;$c['_updated_at']=$now;return $c;
}
function desktop_config_get(){
    $file=__DIR__.'/client_config.cache.php';if(is_file($file)&&filemtime($file)>time()-30){$raw=file_get_contents($file);$pos=strpos($raw,"\n");$c=$pos===false?null:json_decode(substr($raw,$pos+1),true);if(is_array($c))return $c;}
    try{$c=desktop_config_read_db();$tmp=$file.'.'.bin2hex(random_bytes(4)).'.tmp';if(file_put_contents($tmp,"<?php http_response_code(404);exit; ?>\n".json_encode($c,JSON_UNESCAPED_UNICODE),LOCK_EX)!==false)@rename($tmp,$file);return $c;}
    catch(Throwable $e){error_log('desktop config unavailable: '.get_class($e));$saved=is_file(desktop_config_file())?json_decode(file_get_contents(desktop_config_file()),true):[];try{return desktop_config_validate(is_array($saved)?$saved:[]);}catch(Throwable $ignored){return desktop_config_defaults();}}
}
