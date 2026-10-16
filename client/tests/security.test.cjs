const test = require('node:test');
const assert = require('node:assert/strict');
const {permittedRequest, safeHeaders} = require('../security');
const permitted = (path, method='GET', config={}) => permittedRequest(new URL(path, 'https://www.zozse.cn'), method, config);
test('request bridge denies admin, unknown API, another host and credentials', () => {
    for (const path of ['/admin.php','/api/desktop/admin.php','/api/desktop/debug.php','https://evil.zozse.cn/api/desktop/login.php','https://attacker@www.zozse.cn/api/desktop/login.php']) assert.equal(permitted(path,'POST'), false, path);
});
test('read operations and approved form submissions retain compatibility', () => {
    for (const path of ['/','/forum.php','/forum.php?mod=guide','/thread-42-1-1.html','/home.php?mod=medal','/home.php?mod=task','/api/desktop/user.php']) assert.equal(permitted(path),true,path);
    assert.equal(permitted('/api/desktop/user.php','POST'),false);
    assert.equal(permitted('/api/desktop/sms_send.php','POST'),true);
});
test('sensitive headers are never forwarded', () => {
    const headers = safeHeaders({Cookie:'secret',Authorization:'secret',Host:'attacker',Origin:'attacker','X-Token':'secret','Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'});
    assert.deepEqual(Object.keys(headers).sort(),['Accept','Content-Type','Referer']);
});
test('maintenance denies writes; lock permits configuration refresh', () => {
    assert.equal(permitted('/api/desktop/post.php','POST',{run_state:{mode:'maintenance'}}),false);
    assert.equal(permitted('/api/desktop/user.php','GET',{run_state:{mode:'disabled',action:'lock'}}),false);
    assert.equal(permitted('/api/desktop/client_config.php','GET',{run_state:{can_run:false,action:'lock'}}),true);
});

test('removed activity endpoints remain denied',()=>{assert.equal(permitted('/anniversary/api.php?act=config','GET',{}),false);});

test('remote auth switches are enforced by the main request bridge',()=>{assert.equal(permitted('/api/desktop/login.php','POST',{auth:{login_enabled:false}}),false);assert.equal(permitted('/api/desktop/sms_login.php','POST',{auth:{sms_login_enabled:false}}),false);assert.equal(permitted('/api/desktop/sms_config.php','GET',{auth:{sms_enabled:false}}),true);assert.equal(permitted('/plugin.php?id=dsu_paulsign:sign','POST',{features:{signin_enabled:false}}),false);});
