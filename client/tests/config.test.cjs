const test = require('node:test'); const assert=require('node:assert/strict');
const {normalizeConfig}=require('../config-schema');
test('malformed remote sections fall back without a startup crash',()=>{
  const c=normalizeConfig({auth:'bad',features:null,run_state:[],app:7,theme:false});
  assert.deepEqual(c.auth,{}); assert.equal(c.run_state.mode,'normal'); assert.equal(c.run_state.can_run,true);
});
test('remote config cannot introduce untrusted update URLs or excessive polling',()=>{
  const c=normalizeConfig({update_feed_url:'https://evil.test/updates',app:{site_url:'https://evil.zozse.cn.evil.test'},run_state:{mode:'disabled',can_run:false,action:'lock',check_interval:1},auth:{sms_enabled:'false'}});
  assert.equal(c.update_feed_url,'https://www.z19m.com/download/desktop'); assert(!c.app.site_url); assert.equal(c.run_state.check_interval,2); assert.equal(c.auth.sms_enabled,undefined); assert.equal(c.run_state.action,'lock');
});

test('malformed navigation records cannot crash config consumers',()=>{const c=normalizeConfig({navigation:{items:[null,{},[],{id:'home',label:{html:'bad'}},{id:'admin',label:'bad'}],order:[null,'home','home','admin']}});assert.deepEqual(c.navigation.order,['home']);assert.equal(c.navigation.items.length,1);assert.equal(c.navigation.items[0].label,undefined);});

test('release host migration preserves the forum API trust boundary',()=>{const c=normalizeConfig({update_feed_url:'https://desk.zozse.cn/download/desktop',download_url:'https://desk.zozse.cn/download/desktop/a.exe',app:{site_url:'https://www.zozse.cn',api_base:'https://www.z19m.com/api/desktop',download_url:'https://www.z19m.com/download/desktop/a.exe'}});assert.equal(c.update_feed_url,'https://www.z19m.com/download/desktop');assert.equal(c.download_url,'https://www.z19m.com/download/desktop/a.exe');assert.equal(c.app.site_url,'https://www.zozse.cn');assert.equal(c.app.api_base,undefined);assert.equal(c.app.download_url,'https://www.z19m.com/download/desktop/a.exe');});
test('new release feed rejects lookalike hosts and credentials',()=>{for(const url of ['https://www.z19m.com.evil.test/feed','https://evil@www.z19m.com/feed','http://www.z19m.com/feed'])assert.equal(normalizeConfig({update_feed_url:url}).update_feed_url,'https://www.z19m.com/download/desktop');});

test('Linux uses its own manifest and manual package updates',()=>{const {releasePolicy}=require('../config-schema');assert.deepEqual(releasePolicy('linux'),{manifest:'latest-linux.yml',manual:true});assert.deepEqual(releasePolicy('win32'),{manifest:'latest.yml',manual:false});});
