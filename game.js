const colors = ["red", "blue", "green", "gold"];
const colorNames = {
  red: "vermelho",
  blue: "azul",
  green: "verde",
  gold: "amarelo",
};

const actionLabels = {
  skip: "X",
  reverse: "R",
  draw2: "+2",
  wild: "*",
  wild4: "+4",
};

const players = [
  { name: "Voce", hand: [], isHuman: true },
  { name: "Lia", hand: [] },
  { name: "Ruy", hand: [] },
  { name: "Jade", hand: [] },
];

let deck = [];
let discard = [];
let currentPlayer = 0;
let direction = 1;
let activeColor = null;
let pendingWild = null;
let pendingDraw2 = 0;
let pendingDraw4 = 0;
let gameOver = false;
let gameStarted = false;
let busy = false;
let handScrollSpeed = 0;
let handScrollFrame = null;
let recentHandInsert = null;
let jumpState = null;
let audioContext = null;
let effectTimeout = null;

const handEl = document.querySelector("#hand");
const playersEl = document.querySelector("#players");
const discardEl = document.querySelector("#discard");
const deckEl = document.querySelector("#deck");
const statusEl = document.querySelector("#status");
const directionEl = document.querySelector("#direction");
const colorPickerEl = document.querySelector("#colorPicker");
const newGameBtn = document.querySelector("#newGameBtn");
const menuEl = document.querySelector("#menu");
const gameMenuEl = document.querySelector("#gameMenu");
const startBtn = document.querySelector("#startBtn");
const menuBtn = document.querySelector("#menuBtn");
const resumeBtn = document.querySelector("#resumeBtn");
const restartBtn = document.querySelector("#restartBtn");
const homeBtn = document.querySelector("#homeBtn");
const tableEl = document.querySelector(".table");

const flyingLayer = document.createElement("div");
flyingLayer.className = "flying-layer";
document.body.appendChild(flyingLayer);

function makeDeck() {
  const cards = [];

  for (const color of colors) {
    cards.push({ color, type: "number", value: 0 });
    for (let value = 1; value <= 9; value += 1) {
      cards.push({ color, type: "number", value });
      cards.push({ color, type: "number", value });
    }
    for (const type of ["skip", "reverse", "draw2"]) {
      cards.push({ color, type });
      cards.push({ color, type });
    }
  }

  for (let i = 0; i < 4; i += 1) {
    cards.push({ color: "wild", type: "wild" });
    cards.push({ color: "wild", type: "wild4" });
  }

  return shuffle(cards);
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function startGame() {
  deck = makeDeck();
  discard = [];
  currentPlayer = 0;
  direction = 1;
  activeColor = null;
  pendingWild = null;
  pendingDraw2 = 0;
  pendingDraw4 = 0;
  gameOver = false;
  gameStarted = true;
  busy = true;
  recentHandInsert = null;
  jumpState = null;
  colorPickerEl.hidden = true;
  gameMenuEl.hidden = true;
  tableEl.classList.remove("won");
  removeEffectBadge();
  if (effectTimeout) {
    window.clearTimeout(effectTimeout);
    effectTimeout = null;
  }

  for (const player of players) {
    player.hand = [];
  }

  setStatus("Distribuindo cartas...");
  render();
  await dealInitialHands();

  let first = drawCard();
  while (first.color === "wild" || first.type !== "number") {
    deck.unshift(first);
    deck = shuffle(deck);
    first = drawCard();
  }
  discard.push(first);
  first.playedBy = null;
  first.landing = { x: 0, y: 0, rot: 7 };
  activeColor = first.color;
  render();
  await animateOpeningDiscard(first);
  setStatus("Sua vez. Jogue uma carta.");
  busy = false;
  render();
}

function drawCard() {
  if (deck.length === 0) {
    const top = discard.pop();
    deck = shuffle(discard);
    discard = [top];
  }
  return deck.pop();
}

function topCard() {
  return discard[discard.length - 1];
}

function canPlay(card, playerIndex = null) {
  const top = topCard();
  if (!card || !top) return false;

  if (pendingDraw2 > 0) {
    return card.type === "draw2";
  }

  if (pendingDraw4 > 0) {
    return card.type === "wild4";
  }

  if (card.type === "wild") return true;

  if (card.type === "wild4") {
    return playerIndex === null || !playerHasColor(playerIndex, activeColor);
  }

  if (card.color === activeColor) return true;

  if (card.type === "number" && top.type === "number") {
    return card.value === top.value;
  }

  return isAction(card) && card.type === top.type;
}

function playerHasPlayable(playerIndex) {
  return players[playerIndex].hand.some((card) => canPlay(card, playerIndex));
}

function playerHasColor(playerIndex, color) {
  return players[playerIndex].hand.some((card) => card.color === color);
}

function playerHasStackableWild4(playerIndex) {
  return players[playerIndex].hand.some((card) => card.type === "wild4");
}

function playerHasStackableDraw2(playerIndex) {
  return players[playerIndex].hand.some((card) => card.type === "draw2");
}

function isAction(card) {
  return card.type === "skip" || card.type === "reverse" || card.type === "draw2";
}

async function playCard(playerIndex, cardIndex, chosenColor = null, sourceEl = null, options = {}) {
  if ((busy && !options.ignoreBusy) || gameOver || (!options.allowOutOfTurn && playerIndex !== currentPlayer)) return false;
  const player = players[playerIndex];
  const card = player.hand[cardIndex];
  if (!card || (!options.isJump && !canPlay(card, playerIndex))) return false;

  busy = true;
  if (options.jumpStack) {
    card.jumpStack = options.jumpStack;
  } else {
    card.jumpStack = card.jumpStack || 1;
  }
  const actualSourceEl = sourceEl || sourceForPlayer(playerIndex) || document.querySelector(".table");
  if (actualSourceEl?.classList?.contains("card")) {
    actualSourceEl.classList.add("leaving");
  }
  const landing = makeDiscardLanding(playerIndex);
  const sourceRect = actualSourceEl.getBoundingClientRect();
  card.playedBy = playerIndex;
  card.landing = landing;
  player.hand.splice(cardIndex, 1);
  discard.push(card);
  activeColor = card.color === "wild" ? chosenColor : card.color;
  render();
  const playedCardEl = discardEl.querySelector(".top-card");
  await animatePlay(sourceRect, playedCardEl, landing);
  if (options.isJump) {
    showJumpBurst(playerIndex);
  }

  if (player.hand.length === 1) {
    setStatus(`${player.name} esta com uma carta!`);
  }

  if (player.hand.length === 0) {
    gameOver = true;
    busy = false;
    setStatus(`${player.name} venceu a rodada!`);
    document.querySelector(".table").classList.add("won");
    render();
    return true;
  }

  const jumped = await waitForJumpOpportunity(card, playerIndex);
  if (jumped) {
    return true;
  }

  currentPlayer = playerIndex;
  await applyEffect(card);
  busy = false;
  render();
  scheduleBots();
  return true;
}

async function applyEffect(card) {
  if (card.type !== "number") {
    showEffectBadge(effectLabel(card));
    await wait(320);
  }

  if (card.type === "reverse") {
    pulseTable("action-burst");
    direction *= -1;
    if (players.length === 2) {
      advanceTurn();
    }
  }

  if (card.type === "skip") {
    pulseTable("action-burst");
    advanceTurn();
  }

  if (card.type === "draw2") {
    pendingDraw2 += 2 * (card.jumpStack || 1);
    pulseTable("action-burst");
    advanceTurn();
    setStatus(`${players[currentPlayer].name} precisa jogar +2 ou comprar ${pendingDraw2}.`);
    return;
  } else if (card.type === "wild4") {
    pendingDraw4 += 4 * (card.jumpStack || 1);
    pulseTable("plus4-impact");
    advanceTurn();
    setStatus(`${players[currentPlayer].name} precisa jogar +4 ou comprar ${pendingDraw4}.`);
    return;
  } else if (card.type === "wild") {
    pulseTable("wild-shift");
  }

  advanceTurn();
  announceTurn();
}

function advanceTurn() {
  currentPlayer = (currentPlayer + direction + players.length) % players.length;
}

async function drawForCurrent(amount) {
  for (let i = 0; i < amount; i += 1) {
    const card = drawCard();
    await animateDraw(card, destinationForPlayer(currentPlayer));
    players[currentPlayer].hand.push(card);
    markHandInsert(currentPlayer, players[currentPlayer].hand.length - 1);
    render();
  }
  setStatus(`${players[currentPlayer].name} comprou ${amount} cartas.`);
}

async function drawOneForHuman() {
  if (busy || gameOver || currentPlayer !== 0 || pendingWild || !gameMenuEl.hidden) return;

  if (pendingDraw2 > 0) {
    if (playerHasStackableDraw2(0)) {
      setStatus("Voce tem +2 para acumular. Jogue o +2 ou compre.");
      return;
    }
    await resolvePendingDraw2();
    return;
  }

  if (pendingDraw4 > 0) {
    if (playerHasStackableWild4(0)) {
      setStatus("Voce tem +4 para acumular. Jogue o +4 ou escolha uma cor.");
      return;
    }
    await resolvePendingDraw4();
    return;
  }

  if (playerHasPlayable(0)) {
    setStatus("Voce ainda tem carta para jogar. Compra bloqueada.");
    return;
  }

  busy = true;
  const card = drawCard();
  await animateDraw(card, destinationForPlayer(0));
  players[0].hand.push(card);
  markHandInsert(0, players[0].hand.length - 1);
  busy = false;
  render();

  if (canPlay(card, 0)) {
    setStatus("Voce comprou uma carta jogavel.");
    return;
  }

  setStatus("Voce comprou. Passando a vez.");
  window.setTimeout(() => {
    advanceTurn();
    render();
    scheduleBots();
  }, 500);
}

async function botTurn() {
  if (busy || gameOver || players[currentPlayer].isHuman || !gameMenuEl.hidden) return;
  const player = players[currentPlayer];

  if (pendingDraw2 > 0) {
    const stackIndex = player.hand.findIndex((card) => card.type === "draw2");
    if (stackIndex >= 0) {
      setStatus(`${player.name} acumulou +2.`);
      await playCard(currentPlayer, stackIndex, null);
      return;
    }

    await resolvePendingDraw2();
    return;
  }

  if (pendingDraw4 > 0) {
    const stackIndex = player.hand.findIndex((card) => card.type === "wild4");
    if (stackIndex >= 0) {
      const chosenColor = favoriteColor(player);
      setStatus(`${player.name} acumulou +4 e escolheu ${colorNames[chosenColor]}.`);
      await playCard(currentPlayer, stackIndex, chosenColor);
      return;
    }

    await resolvePendingDraw4();
    return;
  }

  const playableIndex = chooseBotCard(player, currentPlayer);

  if (playableIndex >= 0) {
    const card = player.hand[playableIndex];
    const chosenColor = card.color === "wild" ? favoriteColor(player) : null;
    setStatus(`${player.name} jogou ${labelFor(card)}${chosenColor ? ` e escolheu ${colorNames[chosenColor]}` : ""}.`);
    await playCard(currentPlayer, playableIndex, chosenColor);
    return;
  }

  busy = true;
  const drawnCard = drawCard();
  setStatus(`${player.name} comprou uma carta.`);
  await animateDraw(drawnCard, destinationForPlayer(currentPlayer));
  player.hand.push(drawnCard);
  markHandInsert(currentPlayer, player.hand.length - 1);
  busy = false;
  render();

  if (canPlay(drawnCard, currentPlayer)) {
    window.setTimeout(async () => {
      const newIndex = player.hand.length - 1;
      const chosenColor = drawnCard.color === "wild" ? favoriteColor(player) : null;
      setStatus(`${player.name} jogou a carta comprada.`);
      await playCard(currentPlayer, newIndex, chosenColor);
    }, 600);
    return;
  }

  window.setTimeout(() => {
    advanceTurn();
    render();
    scheduleBots();
  }, 650);
}

function chooseBotCard(player, playerIndex) {
  const playable = player.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => canPlay(card, playerIndex));

  if (playable.length === 0) return -1;

  playable.sort((a, b) => scoreBotCard(b.card, player) - scoreBotCard(a.card, player));
  return playable[0].index;
}

function scoreBotCard(card, player) {
  let score = card.color === favoriteColor(player) ? 3 : 0;
  if (card.type === "draw2" || card.type === "wild4") score += 4;
  if (card.type === "skip" || card.type === "reverse") score += 2;
  if (card.color === "wild") score += 1;
  return score;
}

function favoriteColor(player) {
  const counts = Object.fromEntries(colors.map((color) => [color, 0]));
  for (const card of player.hand) {
    if (counts[card.color] !== undefined) counts[card.color] += 1;
  }
  return colors.reduce((best, color) => (counts[color] > counts[best] ? color : best), colors[0]);
}

function scheduleBots() {
  if (!gameOver && !busy && !players[currentPlayer].isHuman && gameMenuEl.hidden) {
    window.setTimeout(botTurn, 850);
  }
}

function announceTurn() {
  if (gameOver) return;
  if (pendingDraw2 > 0) {
    setStatus(`${players[currentPlayer].name} precisa jogar +2 ou comprar ${pendingDraw2}.`);
    return;
  }
  if (pendingDraw4 > 0) {
    setStatus(`${players[currentPlayer].name} precisa jogar +4 ou comprar ${pendingDraw4}.`);
    return;
  }
  setStatus(players[currentPlayer].isHuman ? "Sua vez." : `Vez de ${players[currentPlayer].name}.`);
}

function markHandInsert(playerIndex, index) {
  const token = `${playerIndex}-${index}-${Date.now()}`;
  recentHandInsert = { playerIndex, index, token };
  window.setTimeout(() => {
    if (recentHandInsert?.token !== token) return;
    recentHandInsert = null;
    render();
  }, 430);
}

function isExactJumpMatch(card, target) {
  if (!card || !target) return false;
  if (card.color !== target.color || card.type !== target.type) return false;
  return card.type !== "number" || card.value === target.value;
}

function findJumpCandidates(targetCard, sourcePlayerIndex) {
  return players
    .map((player, playerIndex) => {
      if (playerIndex === sourcePlayerIndex) return null;
      const cardIndex = player.hand.findIndex((card) => isExactJumpMatch(card, targetCard));
      return cardIndex >= 0 ? { playerIndex, cardIndex } : null;
    })
    .filter(Boolean);
}

function waitForJumpOpportunity(card, sourcePlayerIndex) {
  const candidates = findJumpCandidates(card, sourcePlayerIndex);
  if (candidates.length === 0 || gameOver) return Promise.resolve(false);

  const humanCandidate = candidates.find((candidate) => candidate.playerIndex === 0);
  const botCandidates = candidates
    .filter((candidate) => candidate.playerIndex !== 0)
    .filter((candidate) => shouldBotJump(candidate, card));

  if (!humanCandidate && botCandidates.length === 0) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    jumpState = {
      card,
      sourcePlayerIndex,
      resolve,
      timer: null,
    };

    render();

    if (humanCandidate) {
      setStatus("JUMP! Voce tem uma carta igual.");
    } else {
      setStatus("JUMP!");
    }

    const botDelay = humanCandidate ? 1250 : 520;
    if (botCandidates.length > 0) {
      window.setTimeout(() => {
        if (!jumpState || jumpState.card !== card || jumpState.waitingForColor) return;
        const chosen = chooseJumpCandidate(botCandidates);
        performJump(chosen.playerIndex, chosen.cardIndex, null, sourceForPlayer(chosen.playerIndex));
      }, botDelay);
    }

    jumpState.timer = window.setTimeout(() => {
      if (!jumpState || jumpState.card !== card) return;
      closeJumpWindow(false);
    }, humanCandidate ? 1700 : 920);
  });
}

function shouldBotJump(candidate, card) {
  const player = players[candidate.playerIndex];
  if (card.type === "draw2" || card.type === "wild4") return true;
  if (player.hand.length <= 2) return true;
  return Math.random() < 0.58;
}

function chooseJumpCandidate(candidates) {
  const ordered = [...candidates].sort((a, b) => {
    const distanceA = turnDistance(currentPlayer, a.playerIndex);
    const distanceB = turnDistance(currentPlayer, b.playerIndex);
    return distanceA - distanceB;
  });
  return ordered[0];
}

function turnDistance(fromPlayer, toPlayer) {
  const total = players.length;
  const distance = direction > 0
    ? (toPlayer - fromPlayer + total) % total
    : (fromPlayer - toPlayer + total) % total;
  return distance || total;
}

function closeJumpWindow(didJump) {
  if (!jumpState) return;
  const { resolve, timer } = jumpState;
  window.clearTimeout(timer);
  jumpState = null;
  render();
  resolve(didJump);
}

async function performJump(playerIndex, cardIndex, chosenColor = null, sourceEl = null) {
  if (!jumpState) return false;
  const state = jumpState;
  const card = players[playerIndex].hand[cardIndex];
  if (!isExactJumpMatch(card, state.card)) return false;

  window.clearTimeout(state.timer);
  jumpState = null;
  pendingWild = null;
  colorPickerEl.hidden = true;

  const color = card.color === "wild" ? (chosenColor || favoriteColor(players[playerIndex])) : null;
  const jumpStack = (state.card.jumpStack || 1) + 1;
  setStatus(`${players[playerIndex].name} deu JUMP!`);
  const played = await playCard(playerIndex, cardIndex, color, sourceEl, {
    allowOutOfTurn: true,
    ignoreBusy: true,
    isJump: true,
    jumpStack,
  });
  state.resolve(Boolean(played));
  return Boolean(played);
}

function showJumpBurst(playerIndex) {
  const tableEl = document.querySelector(".table");
  const anchor = playerIndex === 0
    ? document.querySelector(".you-label")
    : document.querySelector(`[data-player="${playerIndex}"] .avatar`);
  if (!tableEl || !anchor) return;

  const tableRect = tableEl.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "jump-burst";
  burst.textContent = "JUMP!";
  burst.style.left = `${rect.left - tableRect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top - tableRect.top + rect.height / 2}px`;
  tableEl.appendChild(burst);
  window.setTimeout(() => burst.remove(), 900);
}

function makeDiscardLanding(playerIndex) {
  const profiles = [
    { x: 0, y: 18, rot: 5 },
    { x: 18, y: 1, rot: -10 },
    { x: 0, y: -18, rot: -4 },
    { x: -18, y: 1, rot: 10 },
  ];
  const base = profiles[playerIndex] || { x: 0, y: 0, rot: 7 };
  return {
    x: base.x + randomBetween(-4, 4),
    y: base.y + randomBetween(-4, 4),
    rot: base.rot + randomBetween(-3, 3),
  };
}

function randomBetween(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

async function resolvePendingDraw4() {
  if (pendingDraw4 <= 0 || busy || gameOver) return;

  const amount = pendingDraw4;
  pendingDraw4 = 0;
  busy = true;
  setStatus(`${players[currentPlayer].name} comprou ${amount} cartas.`);
  render();
  await drawForCurrent(amount);
  busy = false;
  advanceTurn();
  render();
  announceTurn();
  scheduleBots();
}

async function resolvePendingDraw2() {
  if (pendingDraw2 <= 0 || busy || gameOver) return;

  const amount = pendingDraw2;
  pendingDraw2 = 0;
  busy = true;
  setStatus(`${players[currentPlayer].name} comprou ${amount} cartas.`);
  render();
  await drawForCurrent(amount);
  busy = false;
  advanceTurn();
  render();
  announceTurn();
  scheduleBots();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function pendingDrawAmount() {
  return pendingDraw2 || pendingDraw4;
}

function playerHasStackablePenalty(playerIndex) {
  if (pendingDraw2 > 0) return playerHasStackableDraw2(playerIndex);
  if (pendingDraw4 > 0) return playerHasStackableWild4(playerIndex);
  return false;
}

function render() {
  renderPlayers();
  renderHand();
  renderDiscard();
  renderDirection();
  renderTableTone();
  const pendingAmount = pendingDrawAmount();
  deckEl.querySelector("span").textContent = pendingAmount > 0 ? `+${pendingAmount}` : "Comprar";
  deckEl.disabled = !gameStarted
    || busy
    || gameOver
    || !gameMenuEl.hidden
    || currentPlayer !== 0
    || Boolean(pendingWild)
    || (pendingAmount > 0 ? playerHasStackablePenalty(0) : playerHasPlayable(0));
}

function renderDirection() {
  const movingRight = direction > 0;
  directionEl.classList.toggle("reversed", !movingRight);
  directionEl.innerHTML = `
    <span class="direction-arrow">${movingRight ? ">>" : "<<"}</span>
    <span class="direction-label">${movingRight ? "Direita" : "Esquerda"}</span>
  `;
}

function renderPlayers() {
  const positions = ["bottom", "right", "top", "left"];
  playersEl.innerHTML = players
    .slice(1)
    .map((player, index) => {
      const realIndex = index + 1;
      const fan = Array.from({ length: Math.min(player.hand.length, 7) }, (_, cardIndex) => {
        const tilt = `${(cardIndex - 3) * 8}deg`;
        const entering = recentHandInsert?.playerIndex === realIndex && cardIndex === Math.min(player.hand.length, 7) - 1 ? "draw-enter" : "";
        return `<span class="back-card ${entering}" style="--tilt:${tilt}"></span>`;
      }).join("");

      return `
        <div class="opponent ${positions[realIndex]} ${currentPlayer === realIndex ? "active" : ""}" data-player="${realIndex}">
          <div class="avatar">${player.name[0]}</div>
          <div class="opponent-name">${player.name}</div>
          <div class="mini-fan">${fan}</div>
          <div class="card-count">${player.hand.length}</div>
        </div>
      `;
    })
    .join("");
}

function renderHand() {
  const previousScrollLeft = handEl.scrollLeft;
  handEl.innerHTML = players[0].hand
    .map((card, index) => {
      const jumpable = Boolean(jumpState && isExactJumpMatch(card, jumpState.card));
      return cardHtml(card, {
        button: true,
        playable: currentPlayer === 0 && canPlay(card, 0) && !pendingWild && !gameOver && !busy,
        jumpable,
        entering: recentHandInsert?.playerIndex === 0 && recentHandInsert.index === index,
        index,
      });
    })
    .join("");

  window.requestAnimationFrame(() => {
    const maxScroll = Math.max(0, handEl.scrollWidth - handEl.clientWidth);
    handEl.scrollLeft = Math.min(previousScrollLeft, maxScroll);
  });

  handEl.querySelectorAll(".card").forEach((cardEl) => {
    cardEl.addEventListener("click", async () => {
      const index = Number(cardEl.dataset.index);
      const card = players[0].hand[index];

      if (jumpState && isExactJumpMatch(card, jumpState.card)) {
        if (card.color === "wild") {
          window.clearTimeout(jumpState.timer);
          jumpState.waitingForColor = true;
          pendingWild = { index, isJump: true };
          colorPickerEl.hidden = false;
          setStatus("Escolha uma cor para o JUMP.");
          render();
          return;
        }

        await performJump(0, index, null, cardEl);
        return;
      }

      if (!card || !canPlay(card, 0) || currentPlayer !== 0 || pendingWild || busy || !gameMenuEl.hidden) return;

      if (card.color === "wild") {
        pendingWild = { index, isJump: false };
        colorPickerEl.hidden = false;
        setStatus("Escolha uma cor.");
        render();
        return;
      }

      await playCard(0, index, null, cardEl);
    });
  });
}

function renderDiscard() {
  const visibleCards = discard.slice(-10);
  const firstVisibleIndex = discard.length - visibleCards.length;

  discardEl.innerHTML = visibleCards
    .map((card, index) => {
      const absoluteIndex = firstVisibleIndex + index;
      const isTop = absoluteIndex === discard.length - 1;
      const offset = index - visibleCards.length + 1;
      const landing = card.landing || { x: offset * -3, y: offset * -4, rot: offset * -7 };
      const x = `${landing.x + offset * -2}px`;
      const y = `${landing.y + offset * -3}px`;
      const rot = `${landing.rot + offset * -2}deg`;
      const opacity = isTop ? 1 : 0.82;
      return cardHtml(card, {
        pile: true,
        top: isTop,
        x,
        y,
        rot,
        topX: `${landing.x}px`,
        topY: `${landing.y}px`,
        topRot: `${landing.rot}deg`,
        opacity,
        z: index + 1,
      });
    })
    .join("");
}

function cardHtml(card, options = {}) {
  const value = labelFor(card);
  const colorClass = card.color === "wild" ? "wild" : card.color;
  const playable = options.playable ? "playable" : "";
  const jumpable = options.jumpable ? "jumpable" : "";
  const topClass = options.top ? "top-card" : "";
  const entering = options.entering ? (options.pile ? "table-enter" : "draw-enter") : "";
  const tag = options.button ? "button" : "div";
  const style = options.pile
    ? `style="--x:${options.x};--y:${options.y};--rot:${options.rot};--top-x:${options.topX || options.x};--top-y:${options.topY || options.y};--top-rot:${options.topRot || options.rot};--opacity:${options.opacity};--z:${options.z}"`
    : "";
  const attrs = options.button
    ? `type="button" data-index="${options.index}" ${options.playable || options.jumpable ? "" : "disabled"}`
    : "";

  return `
    <${tag} class="card ${colorClass} ${playable} ${jumpable} ${topClass} ${entering}" ${attrs} ${style}>
      <span class="corner top-left">${value}</span>
      <span class="card-value">${value}</span>
      <span class="corner bottom-right">${value}</span>
    </${tag}>
  `;
}

function labelFor(card) {
  if (card.type === "number") return String(card.value);
  return actionLabels[card.type];
}

function effectLabel(card) {
  switch (card.type) {
    case "skip":
      return "BLOQUEIO";
    case "reverse":
      return "REVERSO";
    case "draw2":
      return "+2";
    case "wild":
      return "TROCA DE COR";
    case "wild4":
      return "+4";
    default:
      return "";
  }
}

function rectCenter(rect) {
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

function sourceForPlayer(playerIndex) {
  if (playerIndex === 0) {
    return handEl.querySelector(".card.playable") || handEl;
  }
  return document.querySelector(`[data-player="${playerIndex}"] .mini-fan`) || document.querySelector(`[data-player="${playerIndex}"]`);
}

function destinationForPlayer(playerIndex) {
  if (playerIndex === 0) return handEl;
  return document.querySelector(`[data-player="${playerIndex}"] .mini-fan`) || document.querySelector(`[data-player="${playerIndex}"]`);
}

function discardTargetRect(landing = { x: 0, y: 0 }) {
  const rect = discardEl.getBoundingClientRect();
  return {
    left: rect.left + rect.width / 2 - 41 + landing.x,
    top: rect.top + rect.height / 2 - 56 + landing.y,
    width: 82,
    height: 112,
  };
}

async function animatePlay(sourceRect, targetEl, landing) {
  if (!targetEl) return;
  window.setTimeout(() => playCardSound("play"), 610);
  await animateTableCardFromSource(sourceRect, targetEl, landing);
}

function animateTableCardFromSource(sourceRect, targetEl, landing = { rot: 7 }) {
  targetEl.style.visibility = "hidden";
  const targetRect = targetEl.getBoundingClientRect();
  const start = rectCenter(sourceRect);
  const end = rectCenter(targetRect);
  const dx = start.left - end.left;
  const dy = start.top - end.top;
  const side = dx >= 0 ? 1 : -1;
  const arc = Math.min(150, Math.max(72, Math.abs(dx) * 0.18 + Math.abs(dy) * 0.14));
  const finalTransform = getComputedStyle(targetEl).transform === "none"
    ? "translate(-50%, -50%)"
    : getComputedStyle(targetEl).transform;
  const startScale = Math.max(0.78, Math.min(1.18, sourceRect.width / Math.max(targetRect.width, 1)));

  targetEl.style.visibility = "visible";
  targetEl.style.willChange = "transform, filter, opacity";

  const animation = targetEl.animate([
    {
      transform: `translate3d(${dx}px, ${dy}px, 0) rotateX(8deg) rotateY(0deg) rotateZ(${-6 * side}deg) scale(${startScale}) ${finalTransform}`,
      filter: "drop-shadow(0 10px 12px rgba(0,0,0,.25))",
      opacity: 1,
      offset: 0,
    },
    {
      transform: `translate3d(${dx * 0.48}px, ${dy * 0.48 - arc}px, 90px) rotateX(64deg) rotateY(${-24 * side}deg) rotateZ(${24 * side}deg) scale(1.12) ${finalTransform}`,
      filter: "drop-shadow(0 28px 26px rgba(0,0,0,.28))",
      opacity: 1,
      offset: 0.42,
    },
    {
      transform: `translate3d(${dx * 0.16}px, ${dy * 0.16 - arc * 0.24}px, 32px) rotateX(34deg) rotateY(${12 * side}deg) rotateZ(${(landing.rot || 7) - 4}deg) scale(1.06) ${finalTransform}`,
      filter: "drop-shadow(0 18px 18px rgba(0,0,0,.24))",
      opacity: 1,
      offset: 0.78,
    },
    {
      transform: finalTransform,
      filter: "drop-shadow(0 8px 12px rgba(0,0,0,.22))",
      opacity: 1,
      offset: 1,
    },
  ], {
    duration: 880,
    easing: "cubic-bezier(.18,.84,.2,1)",
  });

  return animation.finished.finally(() => {
    targetEl.style.visibility = "";
    targetEl.style.willChange = "";
  });
}

async function animateDraw(card, targetEl) {
  animateDeckPulse();
  playCardSound("draw");
  const sourceRect = deckEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  await animateFloatingCard(card, sourceRect, targetRect, { faceDown: true, mode: "draw" });
}

function animateDeckPulse() {
  deckEl.classList.remove("draw-flash");
  void deckEl.offsetWidth;
  deckEl.classList.add("draw-flash");
}

function popTopDiscard() {
  const top = discardEl.querySelector(".top-card");
  if (!top) return;
  top.classList.remove("drop-pop");
  void top.offsetWidth;
  top.classList.add("drop-pop");
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function dealInitialHands() {
  for (let round = 0; round < 7; round += 1) {
    const draws = [];
    const animations = [];
    for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
      const card = drawCard();
      draws.push({ card, playerIndex });
      const targetEl = destinationForPlayer(playerIndex) || tableEl;
      const sourceRect = deckEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      animations.push(animateFloatingCard(card, sourceRect, targetRect, {
        faceDown: playerIndex !== 0,
        mode: "draw",
        duration: 320,
      }));
    }

    for (const draw of draws) {
      players[draw.playerIndex].hand.push(draw.card);
    }
    render();
    await Promise.all(animations);
  }
}

async function animateOpeningDiscard(card) {
  const sourceRect = deckEl.getBoundingClientRect();
  await animateFloatingCard(card, sourceRect, discardTargetRect(card.landing), {
    mode: "play",
    duration: 520,
    landRot: card.landing.rot,
  });
  popTopDiscard();
}

function removeEffectBadge() {
  const existing = tableEl.querySelector(".effect-badge");
  if (existing) existing.remove();
}

function showEffectBadge(text) {
  if (!text) return;
  removeEffectBadge();
  const badge = document.createElement("div");
  badge.className = "effect-badge";
  badge.textContent = text;
  tableEl.appendChild(badge);
  if (effectTimeout) {
    window.clearTimeout(effectTimeout);
  }
  effectTimeout = window.setTimeout(() => removeEffectBadge(), 820);
}

function pulseTable(className) {
  tableEl.classList.remove(className);
  void tableEl.offsetWidth;
  tableEl.classList.add(className);
  window.setTimeout(() => tableEl.classList.remove(className), 760);
}

function renderTableTone() {
  tableEl.classList.remove("tone-red", "tone-blue", "tone-green", "tone-gold");
  if (!activeColor || activeColor === "wild") return;
  tableEl.classList.add(`tone-${activeColor}`);
}

function openGameMenu() {
  if (!gameStarted || !menuEl.classList.contains("hidden")) return;
  gameMenuEl.hidden = false;
  setStatus("Jogo pausado.");
  render();
}

function closeGameMenu() {
  if (gameMenuEl.hidden) return;
  gameMenuEl.hidden = true;
  announceTurn();
  render();
  scheduleBots();
}

function getAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) {
    audioContext = new AudioCtor();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playCardSound(kind) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = kind === "play" ? 0.12 : 0.16;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(kind === "play" ? 1150 : 780, now);
  filter.Q.setValueAtTime(kind === "play" ? 1.2 : 0.9, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "play" ? 0.12 : 0.09, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);

  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = "triangle";
  click.frequency.setValueAtTime(kind === "play" ? 210 : 150, now);
  click.frequency.exponentialRampToValueAtTime(kind === "play" ? 90 : 70, now + 0.055);
  clickGain.gain.setValueAtTime(0.0001, now);
  clickGain.gain.exponentialRampToValueAtTime(kind === "play" ? 0.08 : 0.045, now + 0.006);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  click.connect(clickGain);
  clickGain.connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.08);
}

function animateFloatingCard(card, sourceRect, targetRect, options = {}) {
  const faceDown = Boolean(options.faceDown);
  const isDraw = options.mode === "draw";
  const start = rectCenter(sourceRect);
  const end = rectCenter(targetRect);
  const width = Math.min(sourceRect.width || 82, 82);
  const height = Math.min(sourceRect.height || 112, 112);
  const fly = document.createElement("div");
  fly.className = "fly-card";
  fly.style.left = `${start.left - width / 2}px`;
  fly.style.top = `${start.top - height / 2}px`;
  fly.style.width = `${width}px`;
  fly.style.height = `${height}px`;
  fly.innerHTML = faceDown ? `<div class="card-back"></div>` : cardHtml(card);
  flyingLayer.appendChild(fly);

  const dx = end.left - start.left;
  const dy = end.top - start.top;
  const arc = Math.min(150, Math.max(70, Math.abs(dx) * 0.18 + Math.abs(dy) * 0.12));
  const side = dx >= 0 ? 1 : -1;
  const firstTilt = isDraw ? 54 : 68;
  const secondTilt = isDraw ? 36 : 50;
  const startSpin = isDraw ? -12 : -4;
  const midSpin = isDraw ? 22 * side : -26 * side;
  const landSpin = options.landRot ?? (isDraw ? -9 * side : 7);

  const animation = fly.animate([
    {
      transform: `perspective(900px) translate3d(0, 0, 0) rotateX(8deg) rotateY(0deg) rotateZ(${startSpin}deg) scale(1)`,
      filter: "drop-shadow(0 8px 10px rgba(0,0,0,.24))",
      opacity: 0.94,
      offset: 0,
    },
    {
      transform: `perspective(900px) translate3d(${dx * 0.28}px, ${dy * 0.28 - arc}px, 90px) rotateX(${firstTilt}deg) rotateY(${-24 * side}deg) rotateZ(${midSpin}deg) scale(1.12)`,
      filter: "drop-shadow(0 26px 24px rgba(0,0,0,.28))",
      opacity: 1,
      offset: 0.38,
    },
    {
      transform: `perspective(900px) translate3d(${dx * 0.72}px, ${dy * 0.72 - arc * 0.42}px, 48px) rotateX(${secondTilt}deg) rotateY(${18 * side}deg) rotateZ(${midSpin * -0.42}deg) scale(1.08)`,
      filter: "drop-shadow(0 20px 20px rgba(0,0,0,.26))",
      opacity: 1,
      offset: 0.74,
    },
    {
      transform: `perspective(900px) translate3d(${dx}px, ${dy}px, 0) rotateX(0deg) rotateY(0deg) rotateZ(${landSpin}deg) scale(1.02)`,
      filter: "drop-shadow(0 9px 12px rgba(0,0,0,.22))",
      opacity: 1,
      offset: 1,
    },
  ], {
    duration: options.duration ?? (isDraw ? 920 : 860),
    easing: "cubic-bezier(.18,.84,.2,1)",
    fill: "forwards",
  });

  return animation.finished.finally(() => fly.remove());
}

function setHandScrollSpeed(speed) {
  handScrollSpeed = speed;
  if (handScrollFrame === null && speed !== 0) {
    handScrollFrame = window.requestAnimationFrame(scrollHandStep);
  }
}

function scrollHandStep() {
  if (handScrollSpeed === 0) {
    handScrollFrame = null;
    return;
  }

  handEl.scrollLeft += handScrollSpeed;
  handScrollFrame = window.requestAnimationFrame(scrollHandStep);
}

function updateHandEdgeScroll(clientX) {
  if (handEl.scrollWidth <= handEl.clientWidth) {
    setHandScrollSpeed(0);
    return;
  }

  const rect = handEl.getBoundingClientRect();
  const edgeSize = Math.min(96, rect.width * 0.26);
  const leftDistance = clientX - rect.left;
  const rightDistance = rect.right - clientX;

  if (leftDistance < edgeSize) {
    const force = 1 - Math.max(0, leftDistance) / edgeSize;
    setHandScrollSpeed(-Math.max(3, force * 16));
    return;
  }

  if (rightDistance < edgeSize) {
    const force = 1 - Math.max(0, rightDistance) / edgeSize;
    setHandScrollSpeed(Math.max(3, force * 16));
    return;
  }

  setHandScrollSpeed(0);
}

colorPickerEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-color]");
  if (!button || pendingWild === null) return;

  const color = button.dataset.color;
  const { index, isJump } = pendingWild;
  const sourceEl = handEl.querySelector(`[data-index="${index}"]`);
  pendingWild = null;
  colorPickerEl.hidden = true;

  if (isJump) {
    await performJump(0, index, color, sourceEl);
    return;
  }

  await playCard(0, index, color, sourceEl);
});

deckEl.addEventListener("click", () => {
  getAudioContext();
  drawOneForHuman();
});
handEl.addEventListener("pointermove", (event) => updateHandEdgeScroll(event.clientX));
handEl.addEventListener("pointerleave", () => setHandScrollSpeed(0));
handEl.addEventListener("pointercancel", () => setHandScrollSpeed(0));
handEl.addEventListener("wheel", (event) => {
  if (handEl.scrollWidth <= handEl.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  event.preventDefault();
  handEl.scrollLeft += event.deltaY;
}, { passive: false });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!gameMenuEl.hidden) {
    closeGameMenu();
    return;
  }
  if (menuEl.classList.contains("hidden") && gameStarted && !gameOver) {
    openGameMenu();
  }
});
newGameBtn.addEventListener("click", startGame);
startBtn.addEventListener("click", () => {
  getAudioContext();
  menuEl.classList.add("hidden");
  gameMenuEl.hidden = true;
  startGame();
});
menuBtn.addEventListener("click", () => {
  openGameMenu();
});
resumeBtn.addEventListener("click", closeGameMenu);
restartBtn.addEventListener("click", () => {
  closeGameMenu();
  startGame();
});
homeBtn.addEventListener("click", () => {
  gameMenuEl.hidden = true;
  menuEl.classList.remove("hidden");
  setStatus("Menu inicial.");
  render();
});

render();
