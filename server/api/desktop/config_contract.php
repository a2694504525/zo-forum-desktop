<?php
function desktop_stamp_notices($list,$previous){
    if(!is_array($list))return $list;$old=[];foreach($previous as $n)$old[$n['id']]=$n;
    foreach($list as &$n){if(!is_array($n))continue;$p=$old[$n['id'] ?? ''] ?? null;$compare=$n;unset($compare['updated_at']);$before=$p;if(is_array($before))unset($before['updated_at']);
        if(!$p||json_encode($compare)!==json_encode($before))$n['updated_at']=max(time(),(int)($p['updated_at'] ?? 0)+1);else $n['updated_at']=$p['updated_at'];
    }unset($n);return $list;
}
function desktop_external_url($value){
    if($value==='')return true;if(!is_string($value)||strlen($value)>2048)return false;
    $u=parse_url($value);return is_array($u)&&in_array(strtolower($u['scheme'] ?? ''),['http','https'],true)&&!empty($u['host'])&&empty($u['user'])&&empty($u['pass']);
}
function desktop_notice_list($list){
    if(!is_array($list)||count($list)>50)desktop_config_error('公告列表最多 50 条。');$out=[];$seen=[];
    foreach($list as $a){if(!is_array($a)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/',$a['id'] ?? '')||isset($seen[$a['id']]))desktop_config_error('公告 ID 无效或重复。');$seen[$a['id']]=true;
        $a=array_replace(['title'=>'','content'=>'','icon'=>'','link'=>'','button_text'=>'','bg_color'=>'','text_color'=>'','enabled'=>true,'start_at'=>'','end_at'=>'','updated_at'=>time(),'dismissible'=>true,'auto_hide'=>0,'position'=>'bottom-right'],$a);
        foreach(['title','content','icon','link','button_text','start_at','end_at','bg_color','text_color'] as $k)if(!is_string($a[$k])||strlen($a[$k])>10000)desktop_config_error('公告字段格式不正确。');
        if(trim($a['content'])===''||!is_bool($a['enabled'])||!is_bool($a['dismissible'])||!desktop_external_url($a['link']))desktop_config_error('公告内容、开关或链接不正确。');
        foreach(['bg_color','text_color'] as $k)if($a[$k]!==''&&!preg_match('/^#[a-fA-F0-9]{6}$/',$a[$k]))desktop_config_error('颜色请使用 #RRGGBB。');
        foreach(['start_at','end_at'] as $k)if($a[$k]!==''&&strtotime($a[$k])===false)desktop_config_error('公告时间不正确。');
        if($a['start_at']!==''&&$a['end_at']!==''&&strtotime($a['start_at'])>=strtotime($a['end_at']))desktop_config_error('结束时间必须晚于开始时间。');
        if(!is_numeric($a['updated_at'])||(int)$a['updated_at']<0||!is_numeric($a['auto_hide'])||(int)$a['auto_hide']<0||(int)$a['auto_hide']>86400||$a['position']!=='bottom-right')desktop_config_error('公告时间戳或位置不正确。');
        $a['updated_at']=(int)$a['updated_at'];$a['auto_hide']=(int)$a['auto_hide'];$out[]=$a;
    }return $out;
}
function desktop_navigation_contract($nav){
    $pages=['home','forums','search','notifications','profile','medals','tasks','settings'];
    $nav['items']=array_values(array_filter($nav['items'] ?? [],function($n){return is_array($n)&&!in_array($n['id'] ?? '',['anniversary','ai-search'],true);}));
    $nav['order']=array_values(array_filter($nav['order'] ?? [],function($id){return !in_array($id,['anniversary','ai-search'],true);}));
    if(count($nav['items'])>20||!is_array($nav['order']))desktop_config_error('导航格式不正确。');$seen=[];
    foreach($nav['items'] as &$n){$id=$n['id'] ?? '';if(!is_string($id)||!preg_match('/^[a-zA-Z0-9_-]{1,40}$/',$id)||isset($seen[$id]))desktop_config_error('导航 ID 无效或重复。');$seen[$id]=true;
        $n=array_replace(['label'=>$id,'enabled'=>true,'page'=>$id,'url'=>''],$n);
        if(!is_string($n['label'])||strlen($n['label'])>150||!is_bool($n['enabled'])||!desktop_external_url($n['url'])||($n['url']===''&&!in_array($n['page'],$pages,true)))desktop_config_error('导航页面、链接或标签不正确。');
    }unset($n);foreach($nav['order'] as $id)if(!is_string($id)||!in_array($id,array_merge($pages,array_keys($seen)),true))desktop_config_error('导航顺序含未知页面。');return $nav;
}
