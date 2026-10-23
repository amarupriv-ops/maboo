/* MABOO Werewolf page. Never select or render other players' roles. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://ifycirqpsmutclxrihnj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4cWoql0Ys6k4CmfsyqKYwg_hDI04G06";
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = id => document.getElementById(id);
  const roleInfo = {
    werewolf:{icon:"🐺",name:"Werewolf",faction:"Faksi Werewolf",description:"Cari dan habisi Village. Kamu mengetahui sesama Werewolf, tetapi tidak mengetahui sumber serangan atau perlindungan."},
    alpha_wolf:{icon:"🦊",name:"Alpha Wolf",faction:"Faksi Alpha",description:"Faksi terpisah dari Werewolf. Kamu dapat menyerang siapa pun, termasuk Werewolf."},
    villager:{icon:"👤",name:"Villager",faction:"Faksi Village",description:"Tidak punya aksi malam khusus. Gunakan informasi, pengamatan, dan voting untuk menemukan ancaman."},
    seer:{icon:"🔮",name:"Seer",faction:"Faksi Village",description:"Setiap malam kamu dapat memeriksa satu pemain dan mengetahui role aslinya."},
    doctor:{icon:"💊",name:"Doctor",faction:"Faksi Village",description:"Memiliki 2 penggunaan heal. Setiap malam dapat menyembuhkan satu pemain lain."},
    bodyguard:{icon:"🛡️",name:"Bodyguard",faction:"Faksi Village",description:"Memiliki HP maksimum 150 dan dapat melindungi pemain dari serangan sesuai aturan Guard."},
    hunter:{icon:"🏹",name:"Hunter",faction:"Faksi Village",description:"Jika mati karena voting atau serangan malam, kamu mendapat Final Shot sebelum kematian diumumkan."},
    witch:{icon:"🧙",name:"Witch",faction:"Faksi Village",description:"Memiliki satu heal dan satu poison yang dapat digunakan masing-masing sekali dalam satu game."},
    jester:{icon:"🎭",name:"Jester",faction:"Faksi Jester",description:"Kamu menang sendiri jika berhasil dieliminasi melalui voting."}
  };
  let session = null;
  let currentUser = null;
  let roomChannel = null;
  let ownPlayer = null;
  let latestRoom = null;
  let revealed = false;
  let phaseTimer = null;
  let countdownTimer = null;
  let advancingPhase = false;

  function toast(message) {
    const container = $("toastContainer");
    const item = document.createElement("div"); item.className = "toast"; item.textContent = message;
    container.appendChild(item); setTimeout(() => { item.classList.add("out"); setTimeout(() => item.remove(),250); },2400);
  }
  function showError(message) { $("loadingPanel").hidden=true; $("rolePanel").hidden=true; $("phasePanel").hidden=true; $("errorText").textContent=message; $("errorPanel").hidden=false; }
  function showRole() {
    const info=roleInfo[ownPlayer.role] || {icon:"❔",name:ownPlayer.role || "Role belum tersedia",faction:"Belum diketahui",description:"Role belum tersedia di database."};
    $("roleIcon").textContent=info.icon; $("roleName").textContent=info.name; $("roleFaction").textContent=info.faction; $("roleDescription").textContent=info.description;
    $("playerHp").textContent=`${ownPlayer.hp} / ${ownPlayer.max_hp}`; $("playerAlive").textContent=ownPlayer.is_alive?"HIDUP":"GUGUR"; $("roundNumber").textContent=String(ownPlayer.round || 0);
    $("loadingPanel").hidden=true; $("errorPanel").hidden=true; $("phasePanel").hidden=true; $("rolePanel").hidden=false;
  }
  function ensureCountdownElement() {
    let element = $("phaseCountdown");
    if (element) return element;
    element = document.createElement("div");
    element.id = "phaseCountdown";
    element.setAttribute("role", "timer");
    element.style.cssText = "margin:18px auto 0;padding:12px 18px;max-width:260px;border:1px solid rgba(167,139,250,.35);border-radius:14px;background:rgba(124,58,237,.12);color:#c4b5fd;text-align:center;font-size:16px;font-weight:700;letter-spacing:.3px;";
    const status = $("phaseStatus");
    if (status?.parentNode) status.parentNode.insertBefore(element, status.nextSibling);
    return element;
  }

  function updateCountdown(room = latestRoom) {
    const element = ensureCountdownElement();
    const timedPhases = ["role_distribution", "night", "discussion", "voting", "hunter_shot", "morning", "vote_result"];
    if (!room || !timedPhases.includes(room.game_phase) || !room.phase_deadline) {
      element.textContent = "⏱ Waktu: —";
      element.hidden = room?.game_phase === "game_over" || room?.game_status !== "playing";
      return;
    }
    element.hidden = false;
    const deadline = new Date(room.phase_deadline).getTime();
    if (!Number.isFinite(deadline)) {
      element.textContent = "⏱ Waktu: menunggu server";
      return;
    }
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secondsText = String(seconds % 60).padStart(2, "0");
    element.textContent = `⏱ Sisa waktu: ${minutesText}:${secondsText}`;
  }

  function showPhase(room) {
    $("loadingPanel").hidden=true; $("errorPanel").hidden=true; $("rolePanel").hidden=true; $("phasePanel").hidden=false;
    const phase=room.game_phase || "role_distribution";
    const labels={role_distribution:["🎭","PEMBAGIAN ROLE","Role sudah dibagikan","Role pemain lain tetap rahasia."],night:["🌙","FASE MALAM","Malam telah tiba","Antarmuka untuk mengirim aksi malam belum tersedia."],morning:["☀️","PAGI","Malam berakhir","Menunggu hasil resolusi malam dari server."],voting:["🗳️","VOTING","Waktu berdiskusi","Antarmuka voting belum tersedia."],vote_result:["⚖️","HASIL VOTING","Hasil pemungutan suara","Menunggu hasil final dari server."],game_over:["🏆","GAME SELESAI","Permainan berakhir","Hasil kemenangan menunggu status resmi server."]};
    const label=labels[phase] || ["🎮","GAME IN PROGRESS","Game sedang berjalan","Status game diperbarui dari server."];
    $("phaseIcon").textContent=label[0]; $("phaseKicker").textContent=label[1]; $("phaseTitle").textContent=label[2]; $("phaseDescription").textContent=label[3];
    $("phaseStatus").textContent=`Status: ${room.game_status || "playing"} · Fase: ${phase}`;
    updateCountdown(room);
    if (phase === "role_distribution" && ownPlayer?.role && !revealed) { showRole(); return; }
  }
  async function loadState() {
    if (!client || !session || !currentUser) throw new Error("Supabase atau sesi login tidak tersedia. Buka room dari halaman utama MABOO.");
    const {data:room,error:roomError}=await client.from("rooms").select("id,room_code,game,game_status,game_phase,game_round,phase_deadline").eq("id",session.roomId).maybeSingle();
    if (roomError) throw roomError; if (!room) throw new Error("Room tidak ditemukan atau tidak dapat diakses.");
    if (room.game !== "werewolf") throw new Error("Room ini bukan room Werewolf.");
    latestRoom = room;
    const {data:player,error:playerError}=await client.from("players").select("id,user_id,player_name,role,hp,max_hp,is_alive,is_host,room_id").eq("id",session.playerId).eq("room_id",room.id).eq("user_id",currentUser.id).maybeSingle();
    if (playerError) throw playerError; if (!player) throw new Error("Identitas pemain tidak cocok dengan akun login ini. Kembali ke lobby dan masuk ulang.");
    ownPlayer={...player,round:room.game_round || 0};
    $("roomCode").textContent=`ROOM ${room.room_code}`;
    const {data:players,error:playersError}=await client.from("players").select("id,player_name,is_alive,is_host").eq("room_id",room.id).order("joined_at",{ascending:true});
    if (playersError) throw playersError;
    $("playersList").innerHTML=(players||[]).map((p,i)=>`<div class="ww-player-row"><div class="ww-player-avatar">${p.is_alive?"👤":"💀"}</div><div class="ww-player-name">${escapeHtml(p.player_name)}${p.id===ownPlayer.id?" (Kamu)":""}</div><span class="ww-player-badge ${p.id===ownPlayer.id?"you":""}">${p.is_host?"HOST · ":""}${p.is_alive?"HIDUP":"GUGUR"}</span></div>`).join("");
    if (room.game_phase === "role_distribution" && ownPlayer.role && !revealed) showRole(); else showPhase(room);
    return room;
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
  async function advancePhaseIfNeeded() {
    if (advancingPhase || !client || !session || !ownPlayer?.is_host || latestRoom?.game_status !== "playing") {
      return;
    }

    advancingPhase = true;
    try {
      const { data, error } = await client.rpc("advance_werewolf_phase", {
        p_room_id: session.roomId
      });
      if (error) throw error;

      if (data && data !== "PHASE_NOT_EXPIRED" && data !== "GAME_NOT_PLAYING") {
        console.log("MABOO Werewolf phase advanced:", data);
        await loadState();
      }
    } catch (error) {
      console.error("Advance Werewolf phase:", error);
    } finally {
      advancingPhase = false;
    }
  }

  async function init() {
    try {
      const raw=sessionStorage.getItem("mabooGameSession");
      if (!raw) throw new Error("Sesi game tidak ditemukan. Buka Werewolf dari lobby MABOO.");
      session=JSON.parse(raw);
      const {data:{session:authSession},error:authError}=await client.auth.getSession();
      if (authError) throw authError;
      if (!authSession) throw new Error("Sesi login sudah tidak tersedia. Kembali ke MABOO dan join room lagi.");
      currentUser=authSession.user;
      await loadState();
      roomChannel=client.channel(`werewolf-room-${session.roomId}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"rooms",filter:`id=eq.${session.roomId}`},()=>loadState().catch(e=>console.error(e))).on("postgres_changes",{event:"UPDATE",schema:"public",table:"players",filter:`room_id=eq.${session.roomId}`},()=>loadState().catch(e=>console.error(e))).subscribe();
      if (phaseTimer) clearInterval(phaseTimer);
      phaseTimer = window.setInterval(advancePhaseIfNeeded, 2000);
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = window.setInterval(() => updateCountdown(), 1000);
    } catch (error) { console.error("Werewolf init:",error); showError(error.message || "Gagal membuka game."); }
  }
  $("revealContinue").addEventListener("click",async()=>{revealed=true;$("rolePanel").hidden=true;try{const room=await loadState();showPhase(room);}catch(e){toast(e.message||"Gagal memperbarui status.");}});
  $("refreshGame").addEventListener("click",async()=>{const button=$("refreshGame");button.disabled=true;try{await loadState();toast("Status diperbarui.");}catch(e){toast(e.message||"Gagal memperbarui status.");}finally{button.disabled=false;}});
  window.addEventListener("pagehide",()=>{if(phaseTimer)clearInterval(phaseTimer);if(countdownTimer)clearInterval(countdownTimer);if(roomChannel&&client)client.removeChannel(roomChannel);});
  init();
})();

