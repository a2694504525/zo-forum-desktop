<?php
function desktop_admin_identity(){
    // Validate the salted native auth cookie first; never trust a UID cookie.
    $u=desktop_discuz_user();$pdo=get_pdo();
    if(!$u){$pre=cookie_pre();$sid=$_COOKIE[$pre.'sid'] ?? '';$uid=$_COOKIE[$pre.'uid'] ?? '';
        if(is_string($sid)&&preg_match('/^[a-zA-Z0-9]{6}$/',$sid)&&is_scalar($uid)){$q=$pdo->prepare('SELECT uid,username FROM '.table('common_session').' WHERE sid=? AND uid=? AND ip=? AND lastactivity>?');$q->execute([$sid,(int)$uid,$_SERVER['REMOTE_ADDR'] ?? '',time()-900]);$u=$q->fetch();}}
    if(!$u)return null;$has=table_has_column($pdo,table('common_member'),'allowadmincp');
    $q=$pdo->prepare('SELECT uid,username,adminid,groupid,freeze'.($has?',allowadmincp':'').' FROM '.table('common_member').' WHERE uid=?');$q->execute([(int)$u['uid']]);$m=$q->fetch();
    if(!$m||$m['freeze']||in_array((int)$m['groupid'],[4,5,6,7,8],true))return null;
    $id=(int)$m['adminid'];if($id!==1&&!(in_array($id,[2,3],true)&&!empty($m['allowadmincp'])))return null;
    // A special activity group alone is not an administrator role.
    return ['uid'=>(int)$m['uid'],'username'=>$m['username'],'adminid'=>$id];
}
function desktop_admin_formhash($u){
    if(!defined('IN_ADMINCP'))define('IN_ADMINCP',true);if(!defined('IN_DISCUZ'))define('IN_DISCUZ',true);
    require_once __DIR__.'/../../source/function/function_core.php';$config=$GLOBALS['_config'];$cookie=$config['cookie'];$path=$cookie['cookiepath'] ?: '/';if($path[0]!=='/')$path='/'.$path;
    $pre=$cookie['cookiepre'].substr(md5($path.'|'.$cookie['cookiedomain']),0,4).'_';$salt=$_COOKIE[$pre.'saltkey'] ?? ($_COOKIE[$cookie['cookiepre'].'saltkey'] ?? '');
    $secret=$config['security']['authkey'] ?: md5($cookie['cookiepre'].$config['db'][1]['dbname']);
    $GLOBALS['_G']=['timestamp'=>time(),'username'=>$u['username'],'uid'=>$u['uid'],'authkey'=>md5($secret.$salt)];return formhash();
}
function desktop_admin_check_csrf($u,$value){
    if(!is_string($value)||!hash_equals(desktop_admin_formhash($u),$value))desktop_config_error('请求校验失败，请刷新后重试。',403);
    $origin=$_SERVER['HTTP_ORIGIN'] ?? '';if($origin!==''&&!in_array($origin,['https://www.zozse.cn','https://zozse.cn'],true))desktop_config_error('请求来源不允许。',403);
}
function desktop_admin_preview_path($token){if(!is_string($token)||!preg_match('/^[a-f0-9]{32}$/',$token))desktop_config_error('验收令牌格式错误。');return __DIR__.'/../../data/desktop-preview-'.$token.'.php';}
function desktop_admin_preview_read($token,$u){$path=desktop_admin_preview_path($token);$raw=is_file($path)?file_get_contents($path):'';$pos=strpos($raw,"\n");$v=$pos===false?null:json_decode(substr($raw,$pos+1),true);if(!$v||$v['uid']!==$u['uid']||$v['expires']<time())desktop_config_error('验收配置已过期。',403);return $v;}
function desktop_admin_preview_save($token,$u,$config){$path=desktop_admin_preview_path($token);$v=['uid'=>$u['uid'],'expires'=>time()+900,'config'=>desktop_config_validate($config)];$v['config']['_revision']=bin2hex(random_bytes(12));$v['config']['_updated_at']=time();$v['config']['preview']=true;$tmp=$path.'.tmp';if(file_put_contents($tmp,"<?php http_response_code(404);exit; ?>\n".json_encode($v,JSON_UNESCAPED_UNICODE),LOCK_EX)===false||!rename($tmp,$path))desktop_config_error('验收配置保存失败。',503);return $v['config'];}
