/* MABOO Werewolf — UI aksi malam
 * Aksi dikirim ke server melalui submit_night_action.
 * Role pemain lain tidak pernah dimuat/ditampilkan.
 */
(() => {
  "use strict";

  const SUPABASE_URL = "https://ifycirqpsmutclxrihnj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4cWoql0Ys6k4CmfsyqKYwg_hDI04G06";
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const $ = id => document.getElementById(id);

  const roleInfo = {
    werewolf:{icon:"🐺",name:"Werewolf",faction:"Faksi Werewolf",description:"Pilih target serangan malam bersama faksi Werewolf."},
    alpha_wolf:{icon:"🦊",name:"Alpha Wolf",faction:"Faksi Alpha",description:"Pilih target serangan Alpha."},
    villager:{icon:"👤",name:"Villager",faction:"Faksi Village",description:"Tidak memiliki aksi malam khusus. Gunakan pengamatan dan voting."},
    seer:{icon:"🔮",name:"Seer",faction:"Faksi Village",description:"Periksa satu pemain untuk mengetahui role aslinya."},
    doctor:{icon:"💊",name:"Doctor",faction:"Faksi Village",description:"Pilih satu pemain untuk disembuhkan."},
    bodyguard:{icon:"🛡️",name:"Bodyguard",faction:"Faksi Village",description:"Pilih satu pemain untuk dilindungi."},
    hunter:{icon:"🏹",name:"Hunter",faction:"Faksi Village",description:"Kemampuan Final Shot berlaku saat kondisi pemicunya terjadi."},
    witch:{icon:"🧙",name:"Witch",faction:"Faksi Village",description:"Pilih heal atau poison, sesuai kemampuan yang masih tersedia."},
    jester:{icon:"🎭",name:"Jester",faction:"Faksi Jester",description:"Menang sendiri jika dieliminasi melalui voting."}
  };

  let session = null, currentUser = null, roomChannel = null, ownPlayer = null;
  let players = [], revealed = false, submittingAction = false, actionNotice = "";

  function toast(message) {
    const container = $("toastContainer");
    if (!container) { alert(message); return; }
    const item = document.createElement("div");
    item.className = "toast"; item.textContent = message; container.appendChild(item);
    setTimeout(() => { item.classList.add("out"); setTimeout(() => item.remove(), 250); }, 2400);
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }
  function showError(message) {
    $("loadingPanel").hidden = true; $("rolePanel").hidden = true; $("phasePanel").hidden = true;
    $("errorText").textContent = message; $("errorPanel").hidden = false;
  }
  function showRole() {
    const info = roleInfo[ownPlayer.role] || {icon:"❔",name:ownPlayer.role || "Role belum tersedia",faction:"Belum diketahui",description:"Role belum tersedia di database."};
    $("roleIcon").textContent = info.icon; $("roleName").textContent = info.name;
    $("roleFaction").textContent = info.faction; $("roleDescription").textContent = info.description;
    $("playerHp").textContent = `${ownPlayer.hp ?? "—"} / ${ownPlayer.max_hp ?? "—"}`;
    $("playerAlive").textContent = ownPlayer.is_alive ? "HIDUP" : "GUGUR";
    $("roundNumber").textContent = String(ownPlayer.round || 0);
    $("loadingPanel").hidden = true; $("errorPanel").hidden = true; $("phasePanel").hidden = true; $("rolePanel").hidden = false;
  }

  function actionConfig(role) {
    const configs = {
      werewolf: [{type:"werewolf_attack",label:"Serang target",title:"Serangan Werewolf"}],
      alpha_wolf: [{type:"alpha_attack",label:"Serang target",title:"Serangan Alpha"}],
      seer: [{type:"seer_check",label:"Periksa role",title:"Pemeriksaan Seer"}],
      doctor: [{type:"doctor_heal",label:"Sembuhkan target",title:"Heal Doctor"}],
      bodyguard: [{type:"bodyguard_guard",label:"Lindungi target",title:"Perlindungan Bodyguard"}],
      witch: [
        {type:"witch_heal",label:"Gunakan heal",title:"Heal Witch"},
        {type:"witch_poison",label:"Gunakan poison",title:"Poison Witch"}
      ]
    };
    return configs[role] || [];
  }

  function renderNightActions(room) {
    const old = $("nightActions");
    if (old) old.remove();
    if (room.game_phase !== "night" || !ownPlayer?.is_alive) return;

    const configs = actionConfig(ownPlayer.role);
    const panel = document.createElement("section");
    panel.id = "nightActions";
    panel.style.cssText = "margin:22px 0;padding:18px;border:1px solid rgba(167,139,250,.28);border-radius:18px;background:rgba(124,58,237,.08);color:inherit";
    if (!configs.length) {
      panel.innerHTML = `<h3 style="margin:0 0 8px">Aksi malam</h3><p style="margin:0;opacity:.8">${ownPlayer.role === "villager" ? "Role lu tidak punya aksi malam khusus. Tunggu sampai pagi." : "Tidak ada aksi malam untuk role ini pada tampilan ini."}</p>`;
      $("phasePanel").appendChild(panel); return;
    }

    const eligible = players.filter(p => p.is_alive && p.id !== ownPlayer.id);
    const targetOptions = eligible.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.player_name)}${p.is_host ? " · HOST" : ""}</option>`).join("");
    panel.innerHTML = `
      <h3 style="margin:0 0 8px">Aksi malam · ${escapeHtml((roleInfo[ownPlayer.role] || {}).name || ownPlayer.role)}</h3>
      <p style="margin:0 0 14px;opacity:.8">Pilih target lalu kirim aksi. Role pemain lain tetap dirahasiakan.</p>
      <label for="nightTarget" style="display:block;margin-bottom:7px">Target</label>
      <select id="nightTarget" style="box-sizing:border-box;width:100%;padding:12px;border-radius:10px;margin-bottom:12px;background:#171a2a;color:inherit;border:1px solid #373b52">
        <option value="">Pilih pemain…</option>${targetOptions}
      </select>
      <div id="nightActionButtons" style="display:flex;flex-wrap:wrap;gap:8px"></div>
      <p id="nightActionNotice" role="status" style="margin:12px 0 0;opacity:.85">${escapeHtml(actionNotice || "Aksi akan divalidasi oleh server.")}</p>`;
    $("phasePanel").appendChild(panel);

    const buttons = $("nightActionButtons");
    configs.forEach(config => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = config.label;
      button.style.cssText = "padding:11px 14px;border:0;border-radius:10px;background:#8b5cf6;color:white;font-weight:700";
      button.addEventListener("click", () => submitNightAction(config.type, config.title));
      buttons.appendChild(button);
    });
  }

  async function submitNightAction(actionType, title) {
    if (submittingAction) return;
    const targetId = $("nightTarget")?.value;
    if (!targetId) { toast("Pilih target dulu, bro."); return; }
    submittingAction = true;
    const buttons = $("nightActionButtons")?.querySelectorAll("button") || [];
    buttons.forEach(b => b.disabled = true);
    try {
      const { data, error } = await client.rpc("submit_night_action", {
        p_room_id: session.roomId,
        p_target_player_id: targetId,
        p_action_type: actionType
      });
      if (error) throw error;
      actionNotice = typeof data === "string" ? data : `${title}: aksi terkirim ke server.`;
      toast("Aksi malam berhasil dikirim.");
      await loadState();
    } catch (error) {
      console.error("submit_night_action:", error);
      actionNotice = error.message || "Aksi gagal dikirim.";
      toast(actionNotice);
      const notice = $("nightActionNotice");
      if (notice) notice.textContent = actionNotice;
    } finally {
      submittingAction = false;
      $("nightActionButtons")?.querySelectorAll("button").forEach(b => b.disabled = false);
    }
  }

  function showPhase(room) {
    $("loadingPanel").hidden = true; $("errorPanel").hidden = true; $("rolePanel").hidden = true; $("phasePanel").hidden = false;
    const phase = room.game_phase || "role_distribution";
    const labels = {
      role_distribution:["🎭","PEMBAGIAN ROLE","Role sudah dibagikan","Role pemain lain tetap rahasia."],
      night:["🌙","FASE MALAM","Malam telah tiba","Pilih aksi sesuai role lu. Aksi akan diperiksa oleh server."],
      morning:["☀️","PAGI","Malam berakhir","Menunggu hasil resolusi malam dari server."],
      discussion:["💬","DISKUSI","Diskusikan temuan","Gunakan informasi yang tersedia untuk menentukan pilihan."],
      voting:["🗳️","VOTING","Waktu voting","Antarmuka voting belum dipasang."],
      vote_result:["⚖️","HASIL VOTING","Hasil pemungutan suara","Menunggu hasil final dari server."],
      hunter_shot:["🏹","FINAL SHOT","Giliran Hunter","Aksi Hunter menunggu dukungan antarmuka."],
      game_over:["🏆","GAME SELESAI","Permainan berakhir","Hasil kemenangan menunggu status resmi server."]
    };
    const label = labels[phase] || ["🎮","GAME IN PROGRESS","Game sedang berjalan","Status game diperbarui dari server."];
    $("phaseIcon").textContent = label[0]; $("phaseKicker").textContent = label[1];
    $("phaseTitle").textContent = label[2]; $("phaseDescription").textContent = label[3];
    $("phaseStatus").textContent = `Status: ${room.game_status || "playing"} · Fase: ${phase}`;
    if (phase === "role_distribution" && ownPlayer?.role && !revealed) { showRole(); return; }
    renderNightActions(room);
  }

  async function loadState() {
    if (!client || !session || !currentUser) throw new Error("Supabase atau sesi login tidak tersedia. Buka room dari halaman utama MABOO.");
    const {data:room,error:roomError} = await client.from("rooms")
      .select("id,room_code,game,game_status,game_phase,game_round,phase_deadline")
      .eq("id",session.roomId).maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new Error("Room tidak ditemukan atau tidak dapat diakses.");
    if (room.game !== "werewolf") throw new Error("Room ini bukan room Werewolf.");

    const {data:player,error:playerError} = await client.from("players")
      .select("id,user_id,player_name,role,hp,max_hp,is_alive,room_id,doctor_uses,witch_heal_used,witch_poison_used")
      .eq("id",session.playerId).eq("room_id",room.id).eq("user_id",currentUser.id).maybeSingle();
    if (playerError) throw playerError;
    if (!player) throw new Error("Identitas pemain tidak cocok dengan akun login ini. Kembali ke lobby dan masuk ulang.");
    ownPlayer = {...player,round:room.game_round || 0};

    $("roomCode").textContent = `ROOM ${room.room_code}`;
    const {data:playerRows,error:playersError} = await client.from("players")
      .select("id,player_name,is_alive,is_host").eq("room_id",room.id).order("joined_at",{ascending:true});
    if (playersError) throw playersError;
    players = playerRows || [];
    $("playersList").innerHTML = players.map(p =>
      `<div class="ww-player-row"><div class="ww-player-avatar">${p.is_alive ? "👤" : "💀"}</div><div class="ww-player-name">${escapeHtml(p.player_name)}${p.id === ownPlayer.id ? " (Kamu)" : ""}</div><span class="ww-player-badge ${p.id === ownPlayer.id ? "you" : ""}">${p.is_host ? "HOST · " : ""}${p.is_alive ? "HIDUP" : "GUGUR"}</span></div>`
    ).join("");
    if (room.game_phase === "role_distribution" && ownPlayer.role && !revealed) showRole();
    else showPhase(room);
    return room;
  }

  async function init() {
    try {
      if (!client) throw new Error("Library Supabase tidak termuat.");
      const raw = sessionStorage.getItem("mabooGameSession");
      if (!raw) throw new Error("Sesi game tidak ditemukan. Buka Werewolf dari lobby MABOO.");
      session = JSON.parse(raw);
      const {data:{session:authSession},error:authError} = await client.auth.getSession();
      if (authError) throw authError;
      if (!authSession) throw new Error("Sesi login sudah tidak tersedia. Kembali ke MABOO dan join room lagi.");
      currentUser = authSession.user;
      await loadState();
      roomChannel = client.channel(`werewolf-room-${session.roomId}`)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"rooms",filter:`id=eq.${session.roomId}`},() => loadState().catch(e => console.error(e)))
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"players",filter:`room_id=eq.${session.roomId}`},() => loadState().catch(e => console.error(e)))
        .subscribe();
    } catch (error) {
      console.error("Werewolf init:",error);
      showError(error.message || "Gagal membuka game.");
    }
  }

  $("revealContinue").addEventListener("click",async() => {
    revealed = true; $("rolePanel").hidden = true;
    try { const room = await loadState(); showPhase(room); }
    catch (e) { toast(e.message || "Gagal memperbarui status."); }
  });
  $("refreshGame").addEventListener("click",async() => {
    const button = $("refreshGame"); button.disabled = true;
    try { await loadState(); toast("Status diperbarui."); }
    catch (e) { toast(e.message || "Gagal memperbarui status."); }
    finally { button.disabled = false; }
  });
  window.addEventListener("pagehide",() => { if (roomChannel && client) client.removeChannel(roomChannel); });
  init();
})();
