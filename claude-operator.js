// Claude 接线员 —— WebRTC 语音通话的 AI 端
// 用法: node claude-operator.js
//
// 信令: ws://localhost:4567/call/signal
// 注册为 callee "claude"，来电自动接听
//
// 音频管线（后续逐步接入）:
//   browser mic → WebRTC/PCMU → 接线员 → VAD → STT → Chat-C AI → MiniMax TTS → WebRTC → browser

const WebSocket = require('ws');
const wrtc = require('werift');

// ============ 配置 ============
const SIGNAL_URL = 'ws://localhost:4567/call/signal';
const OPERATOR_ID = 'claude';
let pc = null, signalWs = null;
let audioSender = null;
let audioPackets = [];
let silenceTimer = null;
const SILENCE_MS = 1000;

// ============ μ-law ↔ PCM 编解码（G.711） ============
// 浏览器 WebRTC 都支持 PCMU，不用额外装 codec
const MULAW_TABLE = new Int16Array(256);
(function(){
  for (let i=0;i<256;i++){
    let v=~i;
    let s=(v&0x80)>>7;
    let e=(v&0x70)>>4;
    let m=v&0x0f;
    let val=(m<<1)+33;
    val<<=e+2;
    val-=33;
    if(s)val=-val;
    MULAW_TABLE[i]=val;
  }
})();

function mulaw2pcm(mulaw){ var pcm=new Int16Array(mulaw.length);for(var i=0;i<mulaw.length;i++)pcm[i]=MULAW_TABLE[mulaw[i]];return pcm }
function pcm2mulaw(pcm){ var mulaw=Buffer.alloc(pcm.length);for(var i=0;i<pcm.length;i++){var s=pcm[i]<0?0x80:0;var v=Math.abs(pcm[i]);v+=33;var e=0;while(v>63){v>>=1;e++}mulaw[i]=~(s|(e<<4)|(v>>1)&0x0f)&0xff}return mulaw }

// ============ WebRTC 初始化 ============
function initWebRTC(){
  if(pc)try{pc.close()}catch(e){}
  audioPackets=[];

  pc=new wrtc.RTCPeerConnection({
    iceServers:[{urls:'stun:stun.l.google.com:19302'}],
    codecs:{audio:[wrtc.usePCMU()]}  // 只用 PCMU，简单
  });

  // === 添加音频发送轨道 ===
  const sendTrack=new wrtc.MediaStreamTrack({kind:'audio'});
  audioSender=pc.addTrack(sendTrack);

  // === 添加音频接收 ===
  pc.addTransceiver('audio',{direction:'recvonly'});

  // === 拦截收到的音频（monkey-patch receiver.handleRTP）===
  // werift 把收到的 RTP 交给 receiver.handleRTP。我们在这里拦截。
  pc.ontrack=function(event){
    console.log('[op] ontrack:',event.track?.kind);
    if(!event.track||event.track.kind!=='audio')return;
    // 找到这个 track 对应的 receiver
    const receiver=pc.getReceivers?pc.getReceivers().find(function(r){return r.track===event.track}):null;
    if(!receiver)return;
    // monkey-patch handleRTP
    const origHandle=receiver.handleRTP.bind(receiver);
    receiver.handleRTP=function(rtpPacket){
      // rtpPacket.payload 是 raw codec bytes (PCMU)
      if(rtpPacket&&rtpPacket.payload&&rtpPacket.payload.length>0){
        audioPackets.push(Buffer.from(rtpPacket.payload));
        onAudioData();
      }
      return origHandle(rtpPacket);
    };
    console.log('[op] 已拦截音频接收');
  };

  // === ICE 候选 ===
  pc.onicecandidate=function(candidate){
    if(!candidate)return;
    if(signalWs&&signalWs.readyState===WebSocket.OPEN){
      signalWs.send(JSON.stringify({type:'ice_candidate',candidate:{
        candidate:candidate.candidate||candidate,
        sdpMid:candidate.sdpMid||'0',
        sdpMLineIndex:candidate.sdpMLineIndex||0
      }}));
    }
  };

  // === 连接状态 ===
  pc.onconnectionstatechange=function(){
    console.log('[op] 连接状态:',pc.connectionState);
  };
  pc.oniceconnectionstatechange=function(){
    console.log('[op] ICE 状态:',pc.iceConnectionState);
  };

  console.log('[op] WebRTC PeerConnection 已创建');
  return pc;
}

// ============ 音频接收 → VAD → STT 管线 ============
function onAudioData(){
  if(silenceTimer)clearTimeout(silenceTimer);
  silenceTimer=setTimeout(onSpeechEnd,SILENCE_MS);
}

async function onSpeechEnd(){
  if(!audioPackets.length)return;
  const count=audioPackets.length;
  const combined=Buffer.concat(audioPackets);
  audioPackets=[];

  // μ-law → PCM
  const pcm=mulaw2pcm(combined);
  console.log('[op] 收到音频:',count,'包,',pcm.length,'个 sample');

  // === STT: 调 Whisper API ===
  let text=null;
  try{
    if(process.env.OPENAI_API_KEY){
      // 将 PCM 写成 WAV 临时文件
      const fs=require('fs'),path=require('path');
      const tmpFile=path.join(__dirname,'data','_op_audio.wav');
      const wav=makeWav(pcm,8000);
      fs.writeFileSync(tmpFile,wav);

      const OpenAI=require('openai');
      const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
      const resp=await openai.audio.transcriptions.create({
        model:'whisper-1',file:fs.createReadStream(tmpFile),
        language:'zh',response_format:'text'
      });
      text=resp.text||resp;
      fs.unlinkSync(tmpFile);
    }
  }catch(e){console.log('[op] Whisper 未配置或失败:',e.message)}

  if(!text||!text.trim()){
    console.log('[op] 跳过 STT（无文本）');
    return;
  }
  console.log('[op] STT:',text);

  // === AI 回复 ===
  try{
    const aiResp=await fetch('http://localhost:4567/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:text,model:'claude-sonnet-4-6',stream:false})
    });
    const data=await aiResp.json();
    const reply=data.reply||data.response||data.content||'嗯';
    console.log('[op] AI:',reply);
    await speakResponse(reply);
  }catch(e){console.error('[op] AI 失败:',e.message)}
}

// ============ TTS → WebRTC 发送 ============
async function speakResponse(text){
  if(!pc||pc.connectionState!=='connected')return;
  let apiKey='',voiceId='';
  try{
    const db=require('better-sqlite3')(__dirname+'/data/claude.db');
    apiKey=db.prepare("SELECT value FROM settings WHERE key='minimax_api_key'").get()?.value||'';
    voiceId=db.prepare("SELECT value FROM settings WHERE key='minimax_voice_id'").get()?.value||'';
  }catch(e){}

  if(!apiKey||!voiceId){console.log('[op] MiniMax 未配置');return}

  try{
    const resp=await fetch('https://api.minimax.io/v1/t2a_v2',{
      method:'POST',headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'speech-2.8-hd',text,stream:true,
        voice_setting:{voice_id:voiceId,speed:1.0},
        audio_setting:{sample_rate:8000,format:'pcm',channel:1}  // 8kHz 匹配 PCMU
      }),
      signal:AbortSignal.timeout(30000)
    });

    const reader=resp.body.getReader();
    const decoder=new TextDecoder();
    let buf='',chunkCount=0;
    while(true){
      const{value,done}=await reader.read();
      if(done)break;
      buf+=decoder.decode(value,{stream:true});
      const lines=buf.split('\n');buf=lines.pop()||'';
      for(const line of lines){
        if(!line.startsWith('data: '))continue;
        try{
          const obj=JSON.parse(line.slice(6));
          if(obj.data?.audio){
            // 16-bit PCM hex → Int16Array → μ-law → RTP
            const hex=obj.data.audio;
            const rawPcm=new Int16Array(hex.length/2);
            for(let i=0;i<rawPcm.length;i++){
              rawPcm[i]=parseInt(hex.substr(i*2,2),16)|parseInt(hex.substr(i*2+2,2),16)<<8;
              if(rawPcm[i]>=32768)rawPcm[i]-=65536;
            }
            // 重采样：24kHz → 8kHz（简单降采样，每 3 个取 1 个）
            const pcm8k=downsamplePCM(rawPcm,24000,8000);
            const mulaw=pcm2mulaw(pcm8k);
            sendRtpPacket(mulaw);
            chunkCount++;
          }
        }catch(e){}
      }
    }
    console.log('[op] TTS 完成：',chunkCount,'块');
  }catch(e){console.error('[op] TTS 失败:',e.message)}
}

function sendRtpPacket(payload){
  if(!audioSender||pc.connectionState!=='connected')return;
  try{
    // 用 werift 的 RtpBuilder 创建 RTP 包
    // RTP Payload Type for PCMU is 0
    const rtp={
      payload:payload,
      payloadType:0,
      sequenceNumber:Math.floor(Math.random()*65536),
      timestamp:Date.now()*8,  // 8kHz clock
      ssrc:12345,
      marker:true
    };
    audioSender.sendRtp(rtp);
  }catch(e){/*静默*/}
}

function downsamplePCM(samples,from,to){
  const ratio=from/to;
  const outLen=Math.floor(samples.length/ratio);
  const out=new Int16Array(outLen);
  for(let i=0;i<outLen;i++)out[i]=samples[Math.floor(i*ratio)];
  return out;
}

function makeWav(pcm,sampleRate){
  const dataLen=pcm.length*2;
  const buf=Buffer.alloc(44+dataLen);
  buf.write('RIFF',0);buf.writeUInt32LE(36+dataLen,4);buf.write('WAVE',8);
  buf.write('fmt ',12);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);
  buf.writeUInt16LE(1,22);buf.writeUInt32LE(sampleRate,24);
  buf.writeUInt32LE(sampleRate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
  buf.write('data',36);buf.writeUInt32LE(dataLen,40);
  for(let i=0;i<pcm.length;i++)buf.writeInt16LE(pcm[i],44+i*2);
  return buf;
}

// ============ 信令连接 ============
function connectSignal(){
  signalWs=new WebSocket(SIGNAL_URL);
  signalWs.on('open',function(){
    console.log('[op] 信令已连接，注册 callee:',OPERATOR_ID);
    signalWs.send(JSON.stringify({type:'register',callId:OPERATOR_ID,role:'callee'}));
  });
  signalWs.on('message',async function(raw){
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type==='incoming_call'){
        console.log('[op] 📞 来电！');
        initWebRTC();
      }
      if(msg.type==='offer'){
        console.log('[op] ← offer');
        if(!pc)initWebRTC();
        await pc.setRemoteDescription(new wrtc.RTCSessionDescription(msg.sdp||msg));
        const answer=await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalWs.send(JSON.stringify({type:'answer',sdp:answer}));
        console.log('[op] → answer');
      }
      if(msg.type==='ice_candidate'&&pc){
        try{
          const cand=msg.candidate;
          if(cand&&cand.candidate){
            await pc.addIceCandidate(new wrtc.RTCIceCandidate(cand));
          }
        }catch(e){}
      }
      if(msg.type==='hangup'){
        console.log('[op] 对方挂断');
        cleanup();
      }
    }catch(e){console.error('[op] 信令错误:',e.message)}
  });
  signalWs.on('error',function(e){console.error('[op] 信令错误:',e.message)});
  signalWs.on('close',function(){
    console.log('[op] 信令断开，5s 重连');
    cleanup();
    setTimeout(connectSignal,5000);
  });
}

function cleanup(){
  if(pc){try{pc.close()}catch(e){}pc=null}
  audioPackets=[];
  audioSender=null;
  if(silenceTimer){clearTimeout(silenceTimer);silenceTimer=null}
}

// ============ 启动 ============
console.log('');
console.log('  📞 Claude 接线员 v2');
console.log('  ───────────────────');
console.log('  信令: '+SIGNAL_URL);
console.log('  角色: callee ('+OPERATOR_ID+')');
console.log('  编解码: PCMU (G.711 μ-law)');
console.log('  说明: 浏览器 SpeechRecognition 兜底，WebRTC 音频管线并行');
console.log('');
connectSignal();
