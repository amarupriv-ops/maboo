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
  let roomPlayers = [];
  let submittingNightAction = false;

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

  function ensureNightActionPanel() {
    let panel = $("nightActionPanel");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "nightActionPanel";
    panel.style.cssText = "margin:22px 0;padding:18px;border:1px solid rgba(167,139,250,.25);border-radius:18px;background:rgba(124,58,237,.07);text-align:left;";
    const description = $("phaseDescription");
    if (description?.parentNode) description.parentNode.insertBefore(panel, description.nextSibling);
    return panel;
  }

  function getNightActionOptions(role) {
    const options = {
      werewolf: [{ value: "attack", label: "🐺 Serang target" }],
      alpha_wolf: [{ value: "attack", label: "🦊 Serang target" }],
      seer: [{ value: "inspect", label: "🔮 Periksa role target" }],
      doctor: [{ value: "heal", label: "💊 Sembuhkan target" }],
      bodyguard: [{ value: "protect", label: "🛡️ Lindungi target" }],
      witch: [
        { value: "heal", label: "🧪 Gunakan heal" },
        { value: "poison", label: "☠️ Gunakan poison" }
      ]
    };
    return options[role] || [];
  }

  function renderNightActionPanel(room) {
    const panel = ensureNightActionPanel();
    const options = getNightActionOptions(ownPlayer?.role);
    const canAct = room?.game_status === "playing" && room?.game_phase === "night" && ownPlayer?.is_alive;
    if (!canAct || options.length === 0) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    panel.hidden = false;
    const targets = roomPlayers.filter(p => p.is_alive && p.id !== ownPlayer.id);
    if (!targets.length) {
      panel.innerHTML = '<strong>🌙 Aksi malam</strong><p>Belum ada target yang tersedia.</p>';
      return;
    }
    panel.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:18px;">🌙 Aksi malam</h3>
      <p style="margin:0 0 14px;color:#a6abc3;font-size:14px;">Pilih aksi dan target. Server tetap memvalidasi aturan role.</p>
      ${options.length > 1 ? `<label for="nightActionType" style="display:block;margin:0 0 6px;font-size:13px;">Aksi</label><select id="nightActionType" style="width:100%;padding:12px;margin-bottom:12px;border-radius:10px;background:#171a2d;color:#fff;border:1px solid #343750;">${options.map(o=>`<option value="${o.value}">${o.label}</option>`).join("")}</select>` : `<input type="hidden" id="nightActionType" value="${options[0].value}">`}
      <label for="nightTarget" style="display:block;margin:0 0 6px;font-size:13px;">Target pemain</label>
      <select id="nightTarget" style="width:100%;padding:12px;margin-bottom:14px;border-radius:10px;background:#171a2d;color:#fff;border:1px solid #343750;">${targets.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.player_name)}</option>`).join("")}</select>
      <button type="button" id="submitNightAction" style="width:100%;padding:13px;border:0;border-radius:12px;background:#7c5cff;color:white;font-weight:800;">Kirim aksi</button>
      <p id="nightActionFeedback" aria-live="polite" style="margin:10px 0 0;color:#b9bde0;font-size:13px;"></p>
    `;
    $("submitNightAction").addEventListener("click", submitNightAction);
  }

  async function submitNightAction() {
    if (submittingNightAction || !client || !session || !ownPlayer?.is_alive || latestRoom?.game_phase !== "night") return;
    const actionType = $("nightActionType")?.value;
    const targetId = $("nightTarget")?.value;
    const feedback = $("nightActionFeedback");
    const button = $("submitNightAction");
    if (!actionType || !targetId) {
      if (feedback) feedback.textContent = "Pilih aksi dan target terlebih dahulu.";
      return;
    }
    submittingNightAction = true;
    if (button) { button.disabled = true; button.textContent = "Mengirim…"; }
    if (feedback) feedback.textContent = "Mengirim aksi ke server…";
    try {
      const { data, error } = await client.rpc("submit_night_action", {
        p_room_id: session.roomId,
        p_target_player_id: targetId,
        p_action_type: actionType
      });
      if (error) throw error;
      if (feedback) feedback.textContent = typeof data === "string" ? data : "Aksi berhasil dikirim.";
      toast("Aksi malam dikirim.");
      await loadState();
    } catch (error) {
      console.error("Submit Werewolf night action:", error);
      const message = error?.message || "Aksi gagal dikirim.";
      if (feedback) feedback.textContent = `Gagal: ${message}`;
      toast(message);
    } finally {
      submittingNightAction = false;
      const currentButton = $("submitNightAction");
      if (currentButton) { currentButton.disabled = false; currentButton.textContent = "Kirim aksi"; }
    }
  }

  function showPhase(room) {
    $("loadingPanel").hidden=true; $("errorPanel").hidden=true; $("rolePanel").hidden=true; $("phasePanel").hidden=false;
    const phase=room.game_phase || "role_distribution";
    const labels={role_distribution:["🎭","PEMBAGIAN ROLE","Role sudah dibagikan","Role pemain lain tetap rahasia."],night:["🌙","FASE MALAM","Malam telah tiba","Pilih aksi sesuai role dan tentukan target sebelum waktu malam habis."],morning:["☀️","PAGI","Malam berakhir","Menunggu hasil resolusi malam dari server."],voting:["🗳️","VOTING","Waktu berdiskusi","Antarmuka voting belum tersedia."],vote_result:["⚖️","HASIL VOTING","Hasil pemungutan suara","Menunggu hasil final dari server."],game_over:["🏆","GAME SELESAI","Permainan berakhir","Hasil kemenangan menunggu status resmi server."]};
    const label=labels[phase] || ["🎮","GAME IN PROGRESS","Game sedang berjalan","Status game diperbarui dari server."];
    $("phaseIcon").textContent=label[0]; $("phaseKicker").textContent=label[1]; $("phaseTitle").textContent=label[2]; $("phaseDescription").textContent=label[3];
    $("phaseStatus").textContent=`Status: ${room.game_status || "playing"} · Fase: ${phase}`;
    updateCountdown(room);
    renderNightActionPanel(room);
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
    roomPlayers = players || [];
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
