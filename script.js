const games = [
  {
    id: "werewolf",
    icon: "🐺",
    name: "Werewolf",
    players: "6–12 Players",
    min: 6,
    max: 12,
    genre: "Social Deduction",
    description: "Find the wolves before they take over the village.",
    short: "Social deduction. Trust no one.",
    glow: "rgba(124,92,255,.15)"
  },
  {
    id: "impostor",
    icon: "👽",
    name: "Impostor",
    players: "6–10 Players",
    min: 6,
    max: 10,
    genre: "Task & Deduction",
    description: "Complete tasks, spot the impostor, and survive.",
    short: "Complete tasks. Find the impostor.",
    glow: "rgba(57,217,255,.12)"
  },
  {
    id: "music",
    icon: "🎵",
    name: "Music Battle",
    players: "2 Players",
    min: 2,
    max: 2,
    genre: "Rhythm Battle",
    description: "Compete head-to-head through rhythm and timing.",
    short: "Rhythm, timing, and a little chaos.",
    glow: "rgba(255,92,168,.12)"
  },
  {
    id: "chaos",
    icon: "🏃",
    name: "Chaos Run",
    players: "2–10 Players",
    min: 2,
    max: 10,
    genre: "Party Race",
    description: "Race, dodge, and survive the chaos to the finish.",
    short: "Run fast. Dodge everything.",
    glow: "rgba(255,173,92,.12)"
  }
];


/* =========================================================
   MABOO V2 — SUPABASE ROOM SYSTEM
   Paste your own values below. Never use a service_role/secret key.
   ========================================================= */

const SUPABASE_URL = "https://ifycirqpsmutclxrihnj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4cWoql0Ys6k4CmfsyqKYwg_hDI04G06";

const supabaseClient =
  SUPABASE_URL.startsWith("http") &&
  !SUPABASE_URL.includes("PASTE_") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")
    ? supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;


/* =========================================================
   ANONYMOUS AUTH
   ========================================================= */

async function ensureAuth() {
  if (!supabaseClient) throw new Error("Supabase is not configured.");

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session) return session.user;

  const { data, error } = await supabaseClient.auth.signInAnonymously();

  if (error) {
    console.error("Anonymous auth error:", error);
    throw error;
  }

  return data.user;
}


const state = {
  currentScreen: "home",
  playerName: "",
  selectedGame: "werewolf",
  roomCode: "",
  roomName: "",
  host: false,
  ready: false,
  players: [],
  roomId: null,
  playerId: null,
  roomChannel: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function getGame(id = state.selectedGame) {
  return games.find(game => game.id === id) || games[0];
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 5 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function renderGameCards(container) {
  if (!container) return;

  container.innerHTML = games.map(game => `
    <article class="game-card" data-game="${game.id}" style="--card-glow:${game.glow}">
      <div class="game-icon">${game.icon}</div>
      <h3>${game.name}</h3>
      <div class="game-meta">${game.players} · ${game.genre}</div>
      <p>${game.description}</p>
      <div class="card-arrow">→</div>
    </article>
  `).join("");

  container.querySelectorAll(".game-card").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedGame = card.dataset.game;
      showScreen("create");
      renderCreateGameSelect();
    });
  });
}

function renderCreateGameSelect() {
  renderMiniGames($("#createGameSelect"), state.selectedGame);
}

function renderMiniGames(container, selectedId) {
  if (!container) return;

  container.innerHTML = games.map(game => `
    <button type="button" class="mini-game ${game.id === selectedId ? "selected" : ""}" data-game="${game.id}">
      <span class="mini-game-icon">${game.icon}</span>
      <span>
        <strong>${game.name}</strong>
        <span>${game.players}</span>
      </span>
    </button>
  `).join("");

  container.querySelectorAll(".mini-game").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedGame = button.dataset.game;
      renderMiniGames(container, state.selectedGame);
    });
  });
}

function showScreen(screen) {
  const validScreens = ["home", "games", "play", "create", "join", "room"];
  if (!validScreens.includes(screen)) screen = "home";

  state.currentScreen = screen;
  $$(".screen").forEach(section => section.classList.remove("active"));
  $(`#screen-${screen}`).classList.add("active");

  $$(".nav-link").forEach(link => {
    link.classList.toggle(
      "active",
      link.dataset.screen === (screen === "games" ? "games" : "home")
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const container = $("#toastContainer");
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  container.appendChild(item);

  setTimeout(() => {
    item.classList.add("out");
    setTimeout(() => item.remove(), 250);
  }, 2400);
}

function openModal(id) {
  const modal = $(`#${id}`);
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = $(`#${id}`);
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function avatarForPlayer(player, index = 0) {
  if (player.id === state.playerId) return "✦";
  const avatars = ["🦊", "🐸", "🐼", "🐙", "🦄", "🐯", "🐵", "🐨", "🐱", "🐰", "🐻"];
  return avatars[index % avatars.length];
}

function renderLobby() {
  const game = getGame();

  $("#roomTitle").textContent = `ROOM ${state.roomCode}`;
  $("#roomCodeDisplay").textContent = state.roomCode;
  $("#roomGameLabel").textContent = `${game.name} · ${game.players}`;
  $("#roomGameIcon").textContent = game.icon;
  $("#roomGameName").textContent = game.name;
  $("#roomGameDescription").textContent = game.short;
  $("#yourName").textContent = state.playerName || "Player";
  $("#yourAvatar").textContent = "✦";
  $("#yourStatusText").textContent = state.ready ? "READY" : "NOT READY";
  $("#readyBtn").textContent = state.ready ? "UNREADY" : "READY";
  $("#startGameBtn").style.display = state.host ? "inline-flex" : "none";

  const grid = $("#playerGrid");
  grid.innerHTML = state.players.map((player, index) => `
    <div class="player-card">
      <div class="player-avatar">${avatarForPlayer(player, index)}</div>
      <div class="player-info">
        <strong>${escapeHtml(player.name)}${player.id === state.playerId ? " (You)" : ""}</strong>
        <small>
          <i class="status-dot ${player.ready ? "ready" : ""}"></i>
          ${player.ready ? "READY" : "NOT READY"}
          ${player.host ? `<span class="host-badge">HOST</span>` : ""}
        </small>
      </div>
    </div>
  `).join("");

  $("#playerCount").textContent = `${state.players.length} / ${game.max} Players`;
}

async function fetchPlayers() {
  if (!supabaseClient || !state.roomId) return;

  const { data, error } = await supabaseClient
    .from("players")
    .select("id, player_name, is_host, is_ready, joined_at")
    .eq("room_id", state.roomId)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("fetchPlayers:", error);
    toast("Couldn't load players.");
    return;
  }

  state.players = (data || []).map(player => ({
    id: player.id,
    name: player.player_name,
    ready: player.is_ready,
    host: player.is_host
  }));

  const me = state.players.find(player => player.id === state.playerId);
  if (me) {
    state.ready = me.ready;
    state.host = me.host;
  }

  renderLobby();
}

async function subscribeToRoom() {
  if (!supabaseClient || !state.roomId) return;

  if (state.roomChannel) {
    await supabaseClient.removeChannel(state.roomChannel);
    state.roomChannel = null;
  }

  state.roomChannel = supabaseClient
    .channel(`room-db-${state.roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: `room_id=eq.${state.roomId}`
      },
      () => fetchPlayers()
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${state.roomId}`
      },
      async (payload) => {
        const newRoom = payload.new;
        if (!newRoom) return;

        state.selectedGame = newRoom.game || state.selectedGame;
        state.roomName = newRoom.room_name || state.roomName;
        renderLobby();
      }
    )
    .subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        console.log("MABOO realtime connected.");
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Realtime:", status, error);
        toast("Realtime connection failed.");
      }
    });
}

async function createRoom() {
  if (!supabaseClient) {
    toast("Add your Supabase URL and publishable key first.");
    return;
  }

  const name = $("#createName").value.trim();
  if (!name) {
    toast("Enter your player name first.");
    $("#createName").focus();
    return;
  }

  const game = getGame(state.selectedGame);
  const roomName = $("#roomName").value.trim();

  $("#createRoomBtn").disabled = true;
  $("#createRoomBtn").textContent = "CREATING...";

  try {
    const user = await ensureAuth();

    let room = null;

    // Retry a few times in case a generated 5-character code already exists.
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomCode = randomRoomCode();

      const { data, error } = await supabaseClient
        .from("rooms")
        .insert({
          room_code: roomCode,
          game: game.id
        })
        .select("id, room_code, game")
        .single();

      if (!error) {
        room = data;
        break;
      }

      if (error.code !== "23505") throw error;
    }

    if (!room) throw new Error("Could not generate a unique room code.");

    const { data: player, error: playerError } = await supabaseClient
      .from("players")
      .insert({
        room_id: room.id,
        player_name: name,
        is_host: true,
        is_ready: false,
        user_id: user.id
      })
      .select("id, player_name, is_host, is_ready")
      .single();

    if (playerError) {
      await supabaseClient.from("rooms").delete().eq("id", room.id);
      throw playerError;
    }

    const { error: hostError } = await supabaseClient
      .from("rooms")
      .update({ host_id: player.id })
      .eq("id", room.id);

    if (hostError) throw hostError;

    state.playerName = name;
    state.roomName = roomName;
    state.roomCode = room.room_code;
    state.roomId = room.id;
    state.playerId = player.id;
    state.selectedGame = room.game;
    state.host = true;
    state.ready = false;

    await fetchPlayers();
    await subscribeToRoom();
    showScreen("room");
    toast("Room created online!");
  } catch (error) {
    console.error("createRoom:", error);
    toast(error.message || "Failed to create room.");
  } finally {
    $("#createRoomBtn").disabled = false;
    $("#createRoomBtn").innerHTML = 'CREATE ROOM <span>→</span>';
  }
}

async function joinRoom() {
  if (!supabaseClient) {
    toast("Add your Supabase URL and publishable key first.");
    return;
  }

  const name = $("#joinName").value.trim();
  const code = $("#roomCodeInput").value.trim().toUpperCase();

  if (!name) {
    toast("Enter your player name first.");
    $("#joinName").focus();
    return;
  }

  if (!/^[A-Z0-9]{5}$/.test(code)) {
    toast("Room code is invalid.");
    $("#roomCodeInput").focus();
    return;
  }

  $("#joinRoomBtn").disabled = true;
  $("#joinRoomBtn").textContent = "JOINING...";

  try {
    const user = await ensureAuth();

    const { data: room, error: roomError } = await supabaseClient
      .from("rooms")
      .select("id, room_code, game")
      .eq("room_code", code)
      .maybeSingle();

    if (roomError) throw roomError;

    if (!room) {
      toast("Room not found.");
      return;
    }

    const game = getGame(room.game);

    const { count, error: countError } = await supabaseClient
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room.id);

    if (countError) throw countError;

    if (count >= game.max) {
      toast("Room is full.");
      return;
    }

    const { data: player, error: playerError } = await supabaseClient
      .from("players")
      .insert({
        room_id: room.id,
        player_name: name,
        is_host: false,
        is_ready: false,
        user_id: user.id
      })
      .select("id, player_name, is_host, is_ready")
      .single();

    if (playerError) throw playerError;

    state.playerName = name;
    state.roomCode = room.room_code;
    state.roomId = room.id;
    state.playerId = player.id;
    state.selectedGame = room.game;
    state.host = false;
    state.ready = false;

    await fetchPlayers();
    await subscribeToRoom();
    showScreen("room");
    toast("Joined room online!");
  } catch (error) {
    console.error("joinRoom:", error);
    toast(error.message || "Failed to join room.");
  } finally {
    $("#joinRoomBtn").disabled = false;
    $("#joinRoomBtn").innerHTML = 'JOIN ROOM <span>→</span>';
  }
}

async function copyRoomCode() {
  if (!state.roomCode) return;

  try {
    await navigator.clipboard.writeText(state.roomCode);
    toast("Room code copied!");
  } catch {
    const helper = document.createElement("textarea");
    helper.value = state.roomCode;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
    toast("Room code copied!");
  }
}

async function toggleReady() {
  if (!supabaseClient || !state.playerId) return;

  const nextReady = !state.ready;

  const { error } = await supabaseClient
    .from("players")
    .update({ is_ready: nextReady })
    .eq("id", state.playerId);

  if (error) {
    console.error("toggleReady:", error);
    toast("Couldn't update ready status.");
    return;
  }

  state.ready = nextReady;
  await fetchPlayers();
  toast(state.ready ? "You're ready!" : "You're not ready.");
}

async function leaveRoom() {
  if (supabaseClient && state.playerId) {
    const { error } = await supabaseClient
      .from("players")
      .delete()
      .eq("id", state.playerId);

    if (error) console.error("leaveRoom:", error);
  }

  if (supabaseClient && state.roomChannel) {
    await supabaseClient.removeChannel(state.roomChannel);
  }

  state.roomChannel = null;
  state.roomId = null;
  state.playerId = null;
  state.roomCode = "";
  state.roomName = "";
  state.host = false;
  state.ready = false;
  state.players = [];

  showScreen("home");
  toast("You left the room.");
}

function openChangeGame() {
  if (!state.host) {
    toast("Only the host can change the game.");
    return;
  }

  renderMiniGames($("#roomGameSelect"), state.selectedGame);
  openModal("gameModal");
}

async function confirmGameChange() {
  if (!supabaseClient || !state.roomId || !state.host) return;

  const game = getGame(state.selectedGame);

  const { error } = await supabaseClient
    .from("rooms")
    .update({ game: game.id })
    .eq("id", state.roomId);

  if (error) {
    console.error("confirmGameChange:", error);
    toast("Couldn't change game.");
    return;
  }

  closeModal("gameModal");
  await fetchPlayers();
  toast(`${game.name} selected!`);
}

function startGame() {
  if (!state.host) return;

  if (!state.ready) {
    toast("Ready up before starting.");
    return;
  }

  toast("Game start system comes in the next milestone.");
}


/* Global navigation */

$$("[data-screen]").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});

$("#brandHome").addEventListener("click", () => showScreen("home"));
$("#playNowBtn").addEventListener("click", () => showScreen("play"));
$("#howToPlayBtn").addEventListener("click", () => openModal("howToModal"));

$("#createModeBtn").addEventListener("click", () => {
  state.selectedGame = "werewolf";
  renderCreateGameSelect();
  showScreen("create");
});

$("#joinModeBtn").addEventListener("click", () => showScreen("join"));
$("#createRoomBtn").addEventListener("click", createRoom);
$("#joinRoomBtn").addEventListener("click", joinRoom);
$("#copyCodeBtn").addEventListener("click", copyRoomCode);
$("#readyBtn").addEventListener("click", toggleReady);
$("#leaveRoomBtn").addEventListener("click", leaveRoom);
$("#leaveRoomTop").addEventListener("click", leaveRoom);
$("#changeGameBtn").addEventListener("click", openChangeGame);
$("#confirmGameBtn").addEventListener("click", confirmGameChange);
$("#startGameBtn").addEventListener("click", startGame);

$("#closeHowTo").addEventListener("click", () => closeModal("howToModal"));
$("#closeGameModal").addEventListener("click", () => closeModal("gameModal"));

$$(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) closeModal(backdrop.id);
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeModal("howToModal");
    closeModal("gameModal");
  }
});

$("#roomCodeInput").addEventListener("input", event => {
  event.target.value = event.target.value
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 5)
    .toUpperCase();
});

$("#createName").addEventListener("keydown", event => {
  if (event.key === "Enter") createRoom();
});

$("#joinName").addEventListener("keydown", event => {
  if (event.key === "Enter") $("#roomCodeInput").focus();
});

$("#roomCodeInput").addEventListener("keydown", event => {
  if (event.key === "Enter") joinRoom();
});


/* Initial render */

renderGameCards($("#homeGameGrid"));
renderGameCards($("#gamesGrid"));
renderCreateGameSelect();

if (!supabaseClient) {
  console.warn(
    "MABOO: Supabase is not configured. Add your Project URL and Publishable key in script.js."
  );
}