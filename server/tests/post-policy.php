<?php
// Exercise the production endpoint's pre-database guard without a live database.
$source=file_get_contents(__DIR__.'/../api/desktop/post.php');
$start=strpos($source,'$clientAction=');$end=strpos($source,"header('Content-Type: application/json",$start);
if($start===false||$end===false)throw new RuntimeException('Post guard not found');
$guard=substr($source,$start,$end-$start);
function desktop_client_control_config(){return $GLOBALS['fixture'];}
function desktop_client_control_enabled($section,$key){return $GLOBALS['fixture'][$section][$key] ?? true;}
function json_out($status,$message){throw new RuntimeException($message,(int)http_response_code());}
$cases=[
    ['reply',true,false,'normal',403],
    ['new',false,true,'normal',403],
    ['reply',false,true,'normal',200],
    ['new',true,false,'normal',200],
    ['reply',true,true,'maintenance',403],
    ['new',true,true,'maintenance',403],
    ['invalid',true,true,'normal',400]
];
foreach($cases as $case){list($action,$posting,$reply,$mode,$expected)=$case;$_POST=['action'=>$action];$GLOBALS['fixture']=['features'=>['posting_enabled'=>$posting,'reply_enabled'=>$reply],'run_state'=>['mode'=>$mode,'can_run'=>true,'action'=>'lock']];http_response_code(200);
    try{eval($guard);$actual=200;}catch(RuntimeException $e){$actual=$e->getCode();}
    if($actual!==$expected)throw new RuntimeException('Policy case failed: '.$action.' '.$mode);
}
echo count($cases)." post policy checks passed; no database or public writes.\n";
