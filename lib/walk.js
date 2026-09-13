// walk.js —— 带她走一段实景的路（2026-09-13 她要的）
//
// 她原话：「能不能真的用实景地图带我走啊，就是有那种可以在路上走的感觉的那种地图，
// 由他控制页面的？然后他可以给我在小框发消息语音之类的」。
//
// **为什么不是 browse 截图**：无头 chromium 跑全景是 WebGL，这台 --disable-gpu 走软件
// 渲染，一帧好几秒；而且每帧都要回传给他看才知道走到哪了 —— 一站一张图几千 token，
// 走十站就把一窗烧掉。走两步就卡死，还贵。
//
// 所以反过来：**图不经过他，直接在她屏幕上放；他只发坐标。**
// 他给 {lat,lng}，这儿查一张最近的街拍影像，回一行 `[WALK:…]` 标记给他抄进正文，
// 前端把它画成一个能拖能转的全景小框。她那边是真的站在那儿，不是看他的截图。
// 说话/语音走他本来就有的路（正文 + <voice>），这儿不碰。
//
// 影像来源 Mapillary（街拍众包，开放数据）：
//   - 查影像要 token（免费自助申请），放 .env 的 MAPILLARY_TOKEN
//   - **播放器 iframe 不要 token**（前端 embed 是裸的），所以密钥只活在服务端这一侧
//   - 覆盖：大城市街道不错，乡下小路可能一张都没有 —— 查不到就照实说最近的有多远，
//     别静默换点，她会以为他带她去了那儿。
const TOKEN = () => process.env.MAPILLARY_TOKEN || '';
const GRAPH = 'https://graph.mapillary.com/images';
const DEFAULT_RADIUS = 100;
const MAX_RADIUS = 1000;

// 经纬度 → 一个粗略的 bbox。纬度 1 度 ≈ 111.32km；经度要按纬度收窄，
// 不收的话在高纬度（比如冰岛）横向会宽出好几倍，查回来的「最近」其实很远。
function bboxAround(lat, lng, meters) {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join(',');
}

// 两点距离（米）。只用来挑最近的一张和告诉他差多远，用等距近似够了。
function distMeters(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * 111320;
  const dLng = (bLng - aLng) * 111320 * Math.cos((aLat + bLat) / 2 * Math.PI / 180);
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

// 走到哪儿了。**进程级一份**就够 —— 只有她一个人在走。
// 存的是「当前这张 + 它所在的序列 + 在序列里的第几个」，往前一步就是 idx+1。
let cur = null;   // { id, seq, idx, ids: [...] }

// 一条拍摄序列里的所有影像，按拍摄顺序排好。Mapillary 本来就是沿路连拍的，
// 所以序列里的下一张 = 沿着这条街往前挪几米。这就是「往前走」的真身。
async function sequenceIds(seqId, token) {
  const r = await fetch('https://graph.mapillary.com/image_ids?sequence_id=' + encodeURIComponent(seqId),
    { headers: { Authorization: 'OAuth ' + token } });
  const j = await r.json();
  if (j && j.error) throw new Error('取序列失败：' + (j.error.message || ''));
  return ((j && j.data) || []).map(x => x.id).filter(Boolean);
}

// 往前 / 往后一步。走到序列尽头就照实说，别绕回去。
async function stride(dir, token, say) {
  if (!cur || !cur.ids || !cur.ids.length) {
    return { ok: false, message: '还不知道你们站在哪儿 —— 先用 action:"go" 给一个坐标落地，再往前走。' };
  }
  const nextIdx = cur.idx + (dir > 0 ? 1 : -1);
  if (nextIdx < 0 || nextIdx >= cur.ids.length) {
    return {
      ok: false, at_end: true,
      message: dir > 0
        ? '这条街拍到头了（这段一共 ' + cur.ids.length + ' 张，你们在最后一张）。想接着走就换个坐标落地到旁边那条路。'
        : '退到这段的起点了，再往回就没有影像了。',
    };
  }
  cur = Object.assign({}, cur, { idx: nextIdx, id: cur.ids[nextIdx] });
  const info = await imageInfo(cur.id, token);
  const s2 = String(say || '').replace(/[\[\]|]/g, ' ').trim();
  return {
    ok: true,
    step: (dir > 0 ? '往前' : '往后') + '一步',
    left: dir > 0 ? (cur.ids.length - 1 - nextIdx) : nextIdx,
    is_pano: !!(info && info.is_pano),
    walk_move: {
      image_id: cur.id,
      heading: info && isFinite(Number(info.compass_angle)) ? Math.round(Number(info.compass_angle)) : null,
      say: s2,
    },
    message: (dir > 0 ? '往前挪了一步' : '退回一步') +
      '，这条街这个方向还剩 ' + (dir > 0 ? (cur.ids.length - 1 - nextIdx) : nextIdx) + ' 张。' +
      '\n她那页已经跟着动了 —— **不用再抄什么标记**，小框是活的。想说话直接说。',
  };
}

async function imageInfo(id, token) {
  try {
    const r = await fetch('https://graph.mapillary.com/' + encodeURIComponent(id) +
      '?fields=id,compass_angle,is_pano,geometry', { headers: { Authorization: 'OAuth ' + token } });
    const j = await r.json();
    return (j && !j.error) ? j : null;
  } catch (_) { return null; }
}

async function step(input) {
  const lat = Number(input.lat), lng = Number(input.lng);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error('lat / lng 要是数字');
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('经纬度超范围了，检查一下是不是写反了（lat 是纬度）');

  const token = TOKEN();
  if (!token) {
    return {
      error: '还没配 Mapillary 的 token，这条路现在走不了。跟她说一声：' +
        '去 mapillary.com 申请一个（免费），填进 .env 的 MAPILLARY_TOKEN，重启就能用。',
      is_error: true,
    };
  }

  let radius = Number(input.radius) || DEFAULT_RADIUS;
  radius = Math.min(MAX_RADIUS, Math.max(10, radius));

  // ⚠️ 09-13 实测：bbox 查询有一道**按密度**的暗闸 —— 柏林/东京/巴黎/纽约用 100 米
  //   的框一律回 "Please reduce the amount of data you're asking for"，
  //   而且跟 limit、fields、时间窗**都无关**（四个都试过，全拦）。只跟框里有多少张有关。
  //   冰岛那种稀疏的地方 100 米没事，市中心 25 米就炸。
  //   所以不能一把梭一个大框，要**从小往大爬**：找到就停，撞闸也停（撞闸说明这一带
  //   影像密得很，那 12 米那档肯定已经有货了，再往外爬只会一直炸）。
  const LADDER = [12, 16, 20, 24, 30, 40, 60, 100, 160, 250, 400, 650, 1000];
  let items = [], hitCap = false, usedRadius = 0;
  for (const r of LADDER) {
    if (r > radius) break;
    usedRadius = r;
    const url = GRAPH + '?fields=id,geometry,compass_angle,captured_at,is_pano' +
      '&limit=20&bbox=' + encodeURIComponent(bboxAround(lat, lng, r));
    let js;
    try {
      const resp = await fetch(url, { headers: { Authorization: 'OAuth ' + token } });
      js = await resp.json();
    } catch (e) {
      throw new Error('查影像的时候网络出错了：' + (e.message || e));
    }
    if (js && js.error) {
      const m = js.error.message || '';
      if (/access token/i.test(m)) throw new Error('Mapillary token 不对或过期了，跟她说一声去 .env 里换一把新的。');
      if (/reduce the amount of data/i.test(m)) { hitCap = true; break; }   // 密度闸，别再往外爬
      throw new Error('Mapillary 那边报错：' + m);
    }
    const got = (js && js.data) || [];
    if (got.length) { items = got; break; }
  }
  if (!items.length && hitCap) {
    return {
      ok: false,
      message: '这一带影像太密，Mapillary 的接口反而卡住了（它对框里的数据量有道闸）。' +
        '把点往旁边挪几十米再试一次，通常就过去了。',
    };
  }
  if (!items.length) {
    return {
      ok: false,
      message: '这个点方圆 ' + Math.max(usedRadius, radius) + ' 米没有街拍影像（Mapillary 是众包的，乡下和小路常常一张都没有）。' +
        '换一条大一点的街再试，或者把 radius 放大。别硬凑一个远处的点当成这儿——她会以为你真带她去了。',
    };
  }

  // 挑最近的一张；同样近的时候优先 360 全景（能拖着看四周，比平面照更像站在那儿）
  let best = null, bestScore = Infinity;
  for (const it of items) {
    const c = it.geometry && it.geometry.coordinates;
    if (!c || c.length < 2) continue;
    const d = distMeters(lat, lng, c[1], c[0]);
    const score = d - (it.is_pano ? 15 : 0);   // 全景让 15 米，不至于为了全景跑很远
    if (score < bestScore) { bestScore = score; best = { it, d, lat: c[1], lng: c[0] }; }
  }
  if (!best) return { ok: false, message: '查回来的影像都没有坐标，换个点再试。' };

  const heading = isFinite(Number(input.heading))
    ? ((Number(input.heading) % 360) + 360) % 360
    : (isFinite(Number(best.it.compass_angle)) ? Math.round(Number(best.it.compass_angle)) : null);

  const say = String(input.say || '').replace(/[\[\]|]/g, ' ').trim();
  // 标记格式：[WALK:影像id|朝向|纬度,经度|这一站说的话]
  const mark = '[WALK:' + best.it.id + '|' + (heading === null ? '' : heading) +
    '|' + best.lat.toFixed(6) + ',' + best.lng.toFixed(6) + '|' + say + ']';

  let when = '';
  if (best.it.captured_at) {
    try { when = '，拍摄于 ' + new Date(Number(best.it.captured_at)).toISOString().slice(0, 7); } catch (_) {}
  }

  return {
    ok: true,
    is_pano: !!best.it.is_pano,
    distance_m: best.d,
    message: '找到一张' + (best.it.is_pano ? '360 全景' : '街拍') + '，离你给的点 ' + best.d + ' 米' + when + '。' +
      '\n把下面这行原样抄进你的回话正文，她那边才会出现小框：\n' + mark +
      (best.it.is_pano ? '' : '\n（这张不是 360 的，她只能看这一个方向，转不了头。）'),
    walk_mark: mark,
  };
}

module.exports = { step };
