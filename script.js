// Clear previous content (in case of hot reload)

// Unique id generator for cards
let cardIdCounter = 1;
function createCard(template) {
  return {
    id: cardIdCounter++,
    name: template.name,
    attack: template.attack,
    hp: template.hp,
    maxHp: template.hp, // remember original health so we can restore between rounds
    tier: template.tier || 1, // placeholder for future
  };
}

const CARD_TEMPLATES = [
  { name: "Test Card", attack: 1, hp: 1, tier: 1 },
  { name: "Test 2", attack: 1, hp: 2, tier: 1 },
  { name: "Wall", attack: 1, hp: 4, tier: 1 },
  { name: "Glass Cannon", attack: 3, hp: 1, tier: 1 },
  { name: "Glass Cannon 2", attack: 3, hp: 1, tier: 1 },
  { name: "Brute", attack: 3, hp: 3, tier: 2 },
];

// Game constants
const GOLD_PER_CARD = 3;
// Gold increases by 1 per turn until it caps at 10
function goldForTurn(turn) {
  return Math.min(3 + (turn - 1), 10);
}
const STARTING_HEALTH = 30;
const BOARD_LIMIT = 7;
const TAVERN_MAX_TIER = 2;
const UPGRADE_BASE_COST = 5;
const MIN_UPGRADE_COST = 1;
let currentTurn = 1;
let phase = "buy"; // "buy" | "combat"

// Players array (index 0 -> Player1, 1 -> Player2)
const players = [1, 2].map((num) => ({
  id: num,
  gold: goldForTurn(currentTurn),
  health: STARTING_HEALTH,
  shop: [],
  hand: [],
  board: [],
  graveyard: [],
  tavernTier: 1,
  upgradeCost: UPGRADE_BASE_COST,
}));

// Cache DOM elements dynamically
function el(id) {
  return document.getElementById(id);
}

const actionBtn = el("combat-button");
const resultsEl = el("results");

// Attach per-player UI buttons once
players.forEach((p) => {
  el(`p${p.id}-refresh`).addEventListener("click", () => handleRefresh(p.id));
  el(`p${p.id}-upgrade`).addEventListener("click", () => handleUpgrade(p.id));
});

updateActionButton();
actionBtn.addEventListener("click", onActionButtonClick);

function render() {
  players.forEach((p) => {
    el(`p${p.id}-gold`).textContent = p.gold;
    el(`p${p.id}-health`).textContent = p.health;

    // Tavern display and button states
    el(`p${p.id}-tier`).textContent = p.tavernTier;

    const refreshBtn = el(`p${p.id}-refresh`);
    refreshBtn.disabled = phase !== "buy" || p.gold < 1;

    const upgradeBtn = el(`p${p.id}-upgrade`);
    upgradeBtn.textContent = `Upgrade (${p.upgradeCost}g)`;
    upgradeBtn.disabled =
      phase !== "buy" ||
      p.tavernTier >= TAVERN_MAX_TIER ||
      p.gold < p.upgradeCost;

    renderZone(el(`p${p.id}-shop`), p, "shop");
    renderZone(el(`p${p.id}-hand`), p, "hand");
    renderZone(el(`p${p.id}-board`), p, "board");
  });
}

function renderZone(container, player, zoneName) {
  container.innerHTML = "";
  player[zoneName].forEach((card) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.dataset.player = player.id;
    cardEl.dataset.zone = zoneName;
    cardEl.dataset.cardId = card.id;

    cardEl.innerHTML = `
      <div>${card.name}</div>
      <div class="stats">${card.attack}/${card.hp}</div>
    `;

    // Clicks allowed only during buy phase
    if (phase === "buy") {
      cardEl.addEventListener("click", onCardClick);
      if (zoneName === "hand" || zoneName === "board") {
        // Right-click to sell
        cardEl.addEventListener("contextmenu", onCardRightClick);
      }
    }

    container.appendChild(cardEl);
  });
}

function findCard(player, zone, cardId) {
  return player[zone].findIndex((c) => c.id === cardId);
}

function onCardClick(e) {
  const cardEl = e.currentTarget;
  const playerId = parseInt(cardEl.dataset.player, 10);
  const zone = cardEl.dataset.zone; // "shop" | "hand" | "board"
  const cardId = parseInt(cardEl.dataset.cardId, 10);
  const player = players[playerId - 1];

  if (zone === "shop") {
    if (player.gold < GOLD_PER_CARD) return;
    const idx = findCard(player, "shop", cardId);
    if (idx === -1) return;
    const [card] = player.shop.splice(idx, 1);
    player.hand.push(card);
    player.gold -= GOLD_PER_CARD;
  } else if (zone === "hand") {
    const idx = findCard(player, "hand", cardId);
    if (idx === -1) return;
    // Ensure board limit
    if (player.board.length >= BOARD_LIMIT) {
      // Cannot play more cards
      return;
    }
    const [card] = player.hand.splice(idx, 1);
    player.board.push(card);
  }

  render();
}

function onCardRightClick(e) {
  e.preventDefault();
  if (phase !== "buy") return; // only sell during buy

  const cardEl = e.currentTarget;
  const playerId = parseInt(cardEl.dataset.player, 10);
  const zone = cardEl.dataset.zone; // hand or board
  const cardId = parseInt(cardEl.dataset.cardId, 10);
  const player = players[playerId - 1];

  if (zone !== "hand" && zone !== "board") return;

  const confirmed = window.confirm("Sell this card for 1 gold?");
  if (!confirmed) return;

  const idx = findCard(player, zone, cardId);
  if (idx === -1) return;

  player[zone].splice(idx, 1);
  player.gold += 1;

  render();
}

function onActionButtonClick() {
  if (phase === "buy") {
    startCombatPhase();
  } else {
    nextTurn();
  }
}

function startCombatPhase() {
  phase = "combat";
  resultsEl.textContent = "";

  const combatLog = simulateCombat();
  render(); // show survivors only

  resultsEl.innerHTML = combatLog.join("<br/>");

  // After combat, check for lethal
  checkGameOver();

  updateActionButton();
}

function nextTurn() {
  currentTurn++;
  // No hard cap on turns, but we keep gold capped at 10

  players.forEach((p) => {
    // Restore health for surviving minions
    p.board.forEach((c) => {
      c.hp = c.maxHp;
    });

    // Resurrect minions that died last combat
    p.graveyard.forEach((c) => {
      c.hp = c.maxHp;
      p.board.push(c);
    });
    p.graveyard = [];

    // Grant gold for the new turn
    p.gold = goldForTurn(currentTurn);

    // Decrease upgrade cost if not at max tier
    if (p.tavernTier < TAVERN_MAX_TIER) {
      p.upgradeCost = Math.max(p.upgradeCost - 1, MIN_UPGRADE_COST);
    }

    // Refresh shop
    refreshShop(p);
  });

  phase = "buy";
  resultsEl.textContent = "";
  updateActionButton();
  render();
}

function updateActionButton() {
  if (phase === "buy") {
    actionBtn.textContent = "Start Combat";
  } else {
    actionBtn.textContent = "Next Turn";
  }
}

// Core combat simulation (extremely simplified)
function simulateCombat() {
  const log = ["Combat begins!"];

  // Randomly decide who attacks first (0 or 1 index)
  let current = Math.random() < 0.5 ? 0 : 1;
  log.push(`Player ${players[current].id} attacks first.`);

  const opponentIdx = () => (current === 0 ? 1 : 0);

  while (players[0].board.length && players[1].board.length) {
    const attackerPlayer = players[current];
    const defenderPlayer = players[opponentIdx()];

    const attacker = attackerPlayer.board[0]; // leftmost
    const targetIndex = Math.floor(Math.random() * defenderPlayer.board.length);
    const defender = defenderPlayer.board[targetIndex];

    log.push(
      `Player ${attackerPlayer.id}'s ${attacker.name} (${attacker.attack}/${attacker.hp}) attacks Player ${defenderPlayer.id}'s ${defender.name} (${defender.attack}/${defender.hp}).`
    );

    // Exchange damage
    defender.hp -= attacker.attack;
    attacker.hp -= defender.attack;

    if (defender.hp <= 0) {
      log.push(`→ ${defender.name} dies.`);
      defenderPlayer.board.splice(targetIndex, 1);
      defenderPlayer.graveyard.push(defender);
    }
    if (attacker.hp <= 0) {
      log.push(`→ ${attacker.name} dies.`);
      attackerPlayer.board.splice(0, 1); // attacker is always index 0
      attackerPlayer.graveyard.push(attacker);
    }

    // Switch turns
    current = opponentIdx();
  }

  // Determine winner
  let winnerIdx;
  if (players[0].board.length === 0 && players[1].board.length === 0) {
    log.push("It's a tie! No hero damage dealt.");
    winnerIdx = -1;
  } else if (players[0].board.length > 0) {
    winnerIdx = 0;
  } else {
    winnerIdx = 1;
  }

  if (winnerIdx !== -1) {
    const loserIdx = winnerIdx === 0 ? 1 : 0;
    const damage = computeHeroDamage(players[winnerIdx]);
    players[loserIdx].health -= damage;

    log.push(
      `Player ${players[winnerIdx].id} wins the round! Player ${players[loserIdx].id} takes ${damage} damage.`
    );
  }

  return log;
}

function computeHeroDamage(winningPlayer) {
  // Placeholder: independent of surviving minions for now
  return 2; // Placeholder value, actual implementation needed
}

// Utility: get a random element from array
function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Refresh shop for a player with 3 random cards
function refreshShop(player) {
  const templates = CARD_TEMPLATES.filter((t) => t.tier <= player.tavernTier);
  player.shop = Array.from({ length: 3 }, () => createCard(rand(templates)));
}

// Initial shop refresh
players.forEach(refreshShop);

function checkGameOver() {
  const defeated = players.find((p) => p.health <= 0);
  if (defeated) {
    const winner = players.find((p) => p.health > 0);
    resultsEl.innerHTML += `<br/><strong>Player ${winner.id} wins the game!</strong>`;
    actionBtn.disabled = true;
    actionBtn.textContent = "Game Over";
  }
}

function handleRefresh(playerId) {
  const player = players[playerId - 1];
  if (phase !== "buy" || player.gold < 1) return;
  player.gold -= 1;
  refreshShop(player);
  render();
}

function handleUpgrade(playerId) {
  const player = players[playerId - 1];
  if (
    phase !== "buy" ||
    player.tavernTier >= TAVERN_MAX_TIER ||
    player.gold < player.upgradeCost
  )
    return;

  player.gold -= player.upgradeCost;
  player.tavernTier += 1;

  // After upgrading, disable future upgrades (only 2 tiers currently)
  player.upgradeCost = 0;

  // Automatically refresh shop to show new tier options
  refreshShop(player);

  render();
}

// Initial render
render(); 
