function safeLink(value) { try { const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password; } catch{return false;} }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function normalizeConfig(input) {
  const config = {...record(input)}; delete config.anniversary; delete config.i18n;
  for (const key of ['auth','features','app','navigation','theme','update','run_state','announcement']) config[key] = {...record(config[key])};
  for (const section of ['auth','features']) {
    for (const key of Object.keys(config[section])) if ((key.endsWith('_enabled') || key === 'bind_mobile_required') && typeof config[section][key] !== 'boolean') delete config[section][key];
  }
  for (const key of ['home_notices','floating_notices']) config[key] = Array.isArray(config[key]) ? config[key].filter(x=>x && typeof x === 'object' && !Array.isArray(x)).slice(0,50) : [];
  delete config.features.ai_search_enabled;
  const state = config.run_state;
  state.mode = ['normal','maintenance','disabled'].includes(state.mode) ? state.mode : 'normal';
  state.action = ['notice','lock','exit'].includes(state.action) ? state.action : 'notice';
  state.can_run = typeof state.can_run === 'boolean' ? state.can_run : true;
  state.check_interval = Math.max(2, Math.min(86400, Number(state.check_interval) || 600));
  for (const key of ['message','close_reason','resume_at','link']) state[key] = typeof state[key] === 'string' ? state[key].slice(0,10000) : '';
  config.announcements = Array.isArray(config.announcements) ? config.announcements.filter(x => x && typeof x === 'object' && !Array.isArray(x)).slice(0,50) : [];
  const pageIds = ['home','forums','search','notifications','profile','medals','tasks','settings'];
  config.navigation.items = Array.isArray(config.navigation.items) ? config.navigation.items.filter(x => x && typeof x === 'object' && (pageIds.includes(x.page || x.id) || safeLink(x.url))).slice(0,20).map(x => ({id:x.id,page:x.page || x.id,url:safeLink(x.url)?x.url:'',enabled:x.enabled !== false,label:typeof x.label === 'string' ? x.label.slice(0,50) : undefined})) : [];
  config.navigation.order = Array.isArray(config.navigation.order) ? [...new Set(config.navigation.order.filter(x => (pageIds.includes(x) || config.navigation.items.some(n=>n.id===x))))] : [];
  const allowed = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (u.hostname === 'zozse.cn' || u.hostname.endsWith('.zozse.cn')); } catch { return false; } };
  const releaseAllowed = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (['www.z19m.com','z19m.com'].includes(u.hostname) || allowed(value) && u.hostname !== 'desk.zozse.cn'); } catch { return false; } };
  const migrateRelease = value => { try { const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='desk.zozse.cn'&&!u.username&&!u.password&&!u.port){u.hostname='www.z19m.com';return u.href;} }catch{}return value; };
  for (const key of ['site_url','api_base','image_cdn']) if (!allowed(config.app[key])) delete config.app[key];
  config.app.download_url=migrateRelease(config.app.download_url);if(!releaseAllowed(config.app.download_url))delete config.app.download_url;
  config.download_url=migrateRelease(config.download_url);
  config.update_feed_url=migrateRelease(config.update_feed_url);
  if (!releaseAllowed(config.update_feed_url)) config.update_feed_url = 'https://www.z19m.com/download/desktop';
  if (Number.isFinite(config.update.check_interval)) config.check_interval_minutes = Math.max(15, config.update.check_interval / 60);
  if (typeof config.update.force_min_version === 'string' && /^\d+(?:\.\d+){2}$/.test(config.update.force_min_version)) {
    const version = value => String(value || '0').split('.').reduce((total,part,index) => total + (Number(part) || 0) * 1000 ** (2-index),0);
    if (version(config.update.force_min_version) > version(config.minimum_version)) config.minimum_version = config.update.force_min_version;
  }
  return config;
}
function releasePolicy(platform){return platform==='linux'?{manifest:'latest-linux.yml',manual:true}:{manifest:'latest.yml',manual:false};}
module.exports = {normalizeConfig,releasePolicy};
