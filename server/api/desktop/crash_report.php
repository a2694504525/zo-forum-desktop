<?php
// Accept only coarse diagnostic categories, never stack traces or account data.
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
function desktop_crash_reply($code,$message){http_response_code($code);echo json_encode(['status'=>$code===200?'success':'error','message'=>$message]);exit;}
if(($_SERVER['REQUEST_METHOD'] ?? '')!=='POST')desktop_crash_reply(405,'method');
$raw=file_get_contents('php://input',false,null,0,1025);$v=json_decode($raw,true);
if(strlen($raw)>1024||!is_array($v)||array_diff(array_keys($v),['version','source','reason','kind'])||!preg_match('/^\d{1,3}\.\d{1,3}\.\d{1,3}$/',$v['version'] ?? '')||!in_array($v['source'] ?? '',['main','renderer'],true)||!in_array($v['reason'] ?? '',['exception','rejection','crashed','killed','oom','launch-failed','test'],true)||!in_array($v['kind'] ?? '',['Error','TypeError','RangeError','SyntaxError','Other'],true))desktop_crash_reply(400,'format');
$path=__DIR__.'/../../data/desktop-crash.php';$f=fopen($path,'c+b');if(!$f||!flock($f,LOCK_EX))desktop_crash_reply(503,'busy');
$guard="<?php http_response_code(404);exit; ?>\n";$old=stream_get_contents($f);$pos=strpos($old,"\n");$state=$pos===false?['rate'=>[],'events'=>[]]:json_decode(substr($old,$pos+1),true);if(!is_array($state))$state=['rate'=>[],'events'=>[]];
$now=time();$ip=hash('sha256',($_SERVER['REMOTE_ADDR'] ?? '').__FILE__);$rate=array_filter($state['rate'],function($stamp)use($now){return $stamp>$now-60;});
if(isset($rate[$ip])||count($rate)>1000){flock($f,LOCK_UN);fclose($f);desktop_crash_reply(429,'rate');}
$rate[$ip]=$now;$events=array_slice($state['events'],-499);$v['time']=$now;$events[]=$v;$payload=$guard.json_encode(['rate'=>$rate,'events'=>$events],JSON_UNESCAPED_UNICODE);rewind($f);$ok=fwrite($f,$payload)===strlen($payload);ftruncate($f,strlen($payload));fflush($f);flock($f,LOCK_UN);fclose($f);desktop_crash_reply($ok?200:503,$ok?'accepted':'storage');
