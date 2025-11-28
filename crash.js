(function () {
  // DOM elements
  const canvas = document.getElementById("crash-canvas");
  const rocketEl = document.getElementById("rocket");
  const multiplierEl = document.getElementById("multiplier");
  const crashHintEl = document.getElementById("crash-hint");
  const roundIdEl = document.getElementById("round-id");
  const phasePill = document.getElementById("phase-pill");
  const phaseLabel = document.getElementById("phase-label");
  const phaseCountdown = document.getElementById("phase-countdown");
  const betInput = document.getElementById("bet-amount");
  const autoInput = document.getElementById("auto-cashout");
  const maxBetLabel = document.getElementById("max-bet-label");
  const btnStart = document.getElementById("btn-start");
  const btnCashout = document.getElementById("btn-cashout");
  const btnAuto = document.getElementById("btn-auto");
  const btnClearHistory = document.getElementById("btn-clear-history");
  const roundTip = document.getElementById("round-tip");
  const balanceEl = document.getElementById("balance");
  const historyEl = document.getElementById("history");
  const lastMultsEl = document.getElementById("last-mults");
  const statWagered = document.getElementById("stat-wagered");
  const statProfit = document.getElementById("stat-profit");
  const statRtp = document.getElementById("stat-rtp");

  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // State
  let roundId = 1;
  let phase = "idle"; // idle | betting | running | crashed | cashed
  let balance = 1000;
  let baseBalance = 1000;
  let totalWagered = 0;
  let totalReturned = 0;
  let currentBet = 0;
  let currentMultiplier = 1.0;
  let crashPoint = null;
  let startTimestamp = 0;
  let animReq = null;
  let bettingCountdown = 0;
  let nextRoundTimeout = null;
  let autoPlay = false;
  let lastMults = [];
  let canvasWidth = 0;
  let canvasHeight = 0;

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * ratio;
    canvas.height = canvasHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawBackground();
  }

  function drawBackground() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;

    // Axes
    ctx.beginPath();
    ctx.moveTo(30, canvasHeight - 30);
    ctx.lineTo(canvasWidth - 20, canvasHeight - 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(30, canvasHeight - 30);
    ctx.lineTo(30, 20);
    ctx.stroke();

    // Grid lines
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(30, canvasHeight - 110);
    ctx.lineTo(canvasWidth - 20, canvasHeight - 110);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(30, canvasHeight - 170);
    ctx.lineTo(canvasWidth - 20, canvasHeight - 170);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  function formatMoney(val) {
    return "$" + val.toFixed(2);
  }

  function updateBalanceDisplay() {
    balanceEl.textContent = formatMoney(balance);
    balanceEl.classList.remove("positive", "negative");
    if (balance > baseBalance) balanceEl.classList.add("positive");
    else if (balance < baseBalance) balanceEl.classList.add("negative");

    const max = Math.max(1, Math.floor(balance));
    maxBetLabel.textContent = "Max: " + max;
  }

  function updateStatsDisplay() {
    statWagered.textContent = formatMoney(totalWagered);
    const profit = balance - baseBalance;
    statProfit.textContent = formatMoney(profit);
    const rtp = totalWagered > 0 ? (totalReturned / totalWagered) * 100 : null;
    statRtp.textContent = rtp === null ? "–" : rtp.toFixed(1) + "%";
  }

  function setPhase(newPhase, extra) {
    phase = newPhase;
    phasePill.className = "phase-pill";
    phaseCountdown.textContent = "";

    switch (newPhase) {
      case "betting":
        phasePill.classList.add("phase-betting");
        phaseLabel.textContent = "Betting";
        if (typeof extra === "number") {
          phaseCountdown.textContent = extra.toFixed(0) + "s";
        }
        break;
      case "running":
        phasePill.classList.add("phase-running");
        phaseLabel.textContent = "Live";
        break;
      case "crashed":
        phasePill.classList.add("phase-crashed");
        phaseLabel.textContent = "Crashed";
        break;
      case "cashed":
        phasePill.classList.add("phase-running");
        phaseLabel.textContent = "Cashed out";
        break;
      default:
        phasePill.classList.add("phase-idle");
        phaseLabel.textContent = "Waiting";
    }
  }

  function resetRocketPosition() {
    rocketEl.style.transform = "translate(-9999px, -9999px)";
  }

  function drawCurve(maxMulti) {
    drawBackground();
    ctx.save();
    const originX = 30;
    const originY = canvasHeight - 30;
    const maxX = canvasWidth - 30;
    const maxY = 20;

    ctx.strokeStyle = "rgba(255,184,0,0.7)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const m = 1 + (maxMulti - 1) * t;
      const x = originX + (maxX - originX) * t;
      const k = Math.log(m) / Math.log(maxMulti);
      const y = originY - (originY - maxY) * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function placeRocket(multiplier, maxMulti) {
    const originX = 30;
    const originY = canvasHeight - 30;
    const maxX = canvasWidth - 30;
    const maxY = 20;

    const t = Math.min(multiplier / maxMulti, 1);
    const x = originX + (maxX - originX) * t;
    const k = Math.log(multiplier) / Math.log(maxMulti || 10);
    const y = originY - (originY - maxY) * k;

    rocketEl.style.transform = `translate(${x - 13}px, ${y - 13}px)`;
  }

  function updateMultiplierDisplay(stateClass) {
    multiplierEl.textContent = currentMultiplier.toFixed(2) + "x";
    multiplierEl.classList.remove("crashed", "cashed");
    if (stateClass) multiplierEl.classList.add(stateClass);
  }

  function addHistoryRow(multi, change, didCashout) {
    const row = document.createElement("div");
    row.className = "history-row";

    const mSpan = document.createElement("span");
    mSpan.className = "history-multi";
    mSpan.textContent = multi.toFixed(2) + "x";

    const changeSpan = document.createElement("span");
    if (change >= 0 && didCashout) {
      changeSpan.className = "history-win";
      changeSpan.textContent = "+" + formatMoney(change);
    } else {
      changeSpan.className = "history-loss";
      changeSpan.textContent = "-" + formatMoney(currentBet);
    }

    const tag = document.createElement("span");
    tag.className = "history-tag";
    tag.textContent = didCashout ? "Cashed out" : "Crashed";

    row.appendChild(mSpan);
    row.appendChild(changeSpan);
    row.appendChild(tag);

    historyEl.insertBefore(row, historyEl.firstChild);
    while (historyEl.children.length > 60) {
      historyEl.removeChild(historyEl.lastChild);
    }
  }

  function updateLastMults(multi) {
    lastMults.unshift(multi);
    if (lastMults.length > 12) lastMults.pop();
    lastMultsEl.innerHTML = "";
    if (!lastMults.length) return;

    lastMults.forEach((m) => {
      const chip = document.createElement("span");
      chip.className = "multi-chip";
      if (m < 2) chip.classList.add("multi-low");
      else if (m < 5) chip.classList.add("multi-mid");
      else chip.classList.add("multi-high");
      chip.textContent = m.toFixed(2) + "x";
      lastMultsEl.appendChild(chip);
    });
  }

  function startBettingPhase() {
    if (phase === "running") return;
    if (nextRoundTimeout) {
      clearTimeout(nextRoundTimeout);
      nextRoundTimeout = null;
    }

    bettingCountdown = 4;
    setPhase("betting", bettingCountdown);

    btnStart.disabled = true;
    btnCashout.disabled = true;

    roundTip.innerHTML =
      "Bet locked for this round. Next: rocket launch in a few seconds.";

    const interval = setInterval(() => {
      bettingCountdown -= 1;
      if (bettingCountdown <= 0) {
        clearInterval(interval);
        startLivePhase();
      } else {
        setPhase("betting", bettingCountdown);
      }
    }, 1000);
  }

  function startLivePhase() {
    const minCrash = 1.01;
    const maxCrashVal = 10;
    crashPoint = minCrash + Math.random() * (maxCrashVal - minCrash);
    crashPoint = parseFloat(crashPoint.toFixed(2));

    currentMultiplier = 1.0;
    updateMultiplierDisplay();
    crashHintEl.textContent = "Crash point: hidden";

    drawBackground();
    drawCurve(10);
    placeRocket(1, 10);

    setPhase("running");
    btnCashout.disabled = false;
    roundTip.innerHTML =
      "Rocket is live. Press <strong>Cash out</strong> or let auto cashout trigger.";

    startTimestamp = performance.now();
    if (animReq) cancelAnimationFrame(animReq);
    animReq = requestAnimationFrame(stepLive);
  }

  function stepLive(timestamp) {
    if (phase !== "running") return;

    const elapsed = (timestamp - startTimestamp) / 1000;
    const growth = 1 + Math.pow(elapsed * 1.33, 1.7);
    currentMultiplier = Math.max(1.0, growth);

    const autoVal = parseFloat(autoInput.value);
    const hasAuto = Number.isFinite(autoVal) && autoVal >= 1.01;
    if (hasAuto && currentMultiplier >= autoVal) {
      doCashout(true);
      return;
    }

    if (currentMultiplier >= crashPoint) {
      currentMultiplier = crashPoint;
      doCrash();
      return;
    }

    updateMultiplierDisplay();
    drawBackground();
    drawCurve(10);
    placeRocket(currentMultiplier, 10);

    animReq = requestAnimationFrame(stepLive);
  }

  function doCashout(autoTriggered) {
    if (phase !== "running") return;
    setPhase("cashed");
    if (animReq) {
      cancelAnimationFrame(animReq);
      animReq = null;
    }

    const winAmount = currentBet * currentMultiplier;
    balance += winAmount;
    totalReturned += winAmount;

    updateBalanceDisplay();
    updateStatsDisplay();

    updateMultiplierDisplay("cashed");
    drawBackground();
    drawCurve(10);
    placeRocket(currentMultiplier, 10);

    crashHintEl.textContent =
      "You cashed out at " + currentMultiplier.toFixed(2) + "x";

    addHistoryRow(currentMultiplier, winAmount - currentBet, true);
    updateLastMults(currentMultiplier);

    roundTip.innerHTML =
      "You exited at <strong>" +
      currentMultiplier.toFixed(2) +
      "x</strong>. Profit added to your demo balance.";

    currentBet = 0;
    btnCashout.disabled = true;

    scheduleNextRound();
  }

  function doCrash() {
    if (phase !== "running" && phase !== "cashed") return;
    setPhase("crashed");
    if (animReq) {
      cancelAnimationFrame(animReq);
      animReq = null;
    }

    updateMultiplierDisplay("crashed");
    drawBackground();
    drawCurve(10);
    placeRocket(currentMultiplier, 10);

    crashHintEl.textContent =
      "Crashed at " + crashPoint.toFixed(2) + "x";

    addHistoryRow(currentMultiplier, 0, false);
    updateLastMults(currentMultiplier);

    roundTip.innerHTML =
      "Rocket exploded at <strong>" +
      crashPoint.toFixed(2) +
      "x</strong>. Your bet for this round was lost.";

    currentBet = 0;
    btnCashout.disabled = true;

    scheduleNextRound();
  }

  function scheduleNextRound() {
    resetRocketPosition();
    const delay = 3.5; // seconds
    let remaining = delay;

    setPhase("idle");
    btnStart.disabled = false;
    if (!autoPlay) {
      roundTip.innerHTML +=
        " Next round will be ready in a few seconds.";
    }

    if (nextRoundTimeout) {
      clearTimeout(nextRoundTimeout);
    }

    const countdownTick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        phaseCountdown.textContent = "";
      } else {
        phaseCountdown.textContent = remaining.toFixed(0) + "s";
      }
    };

    countdownTick();
    const interval = setInterval(() => {
      countdownTick();
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    nextRoundTimeout = setTimeout(() => {
      roundId += 1;
      roundIdEl.textContent = "#" + roundId;
      setPhase("idle");
      if (autoPlay && balance > 0) {
        placeBetAndStart();
      }
    }, delay * 1000);
  }

  function placeBetAndStart() {
    if (phase === "running" || phase === "betting") return;
    let betVal = parseFloat(betInput.value);
    const max = Math.floor(balance);
    if (!Number.isFinite(betVal) || betVal <= 0) {
      alert("Enter a valid bet amount greater than zero.");
      return;
    }
    if (betVal > max) {
      alert("Bet is larger than your available balance.");
      return;
    }

    betVal = Math.floor(betVal);
    currentBet = betVal;
    balance -= betVal;
    totalWagered += betVal;

    updateBalanceDisplay();
    updateStatsDisplay();

    roundTip.innerHTML =
      "Bet locked: <strong>" +
      formatMoney(currentBet) +
      "</strong>. Get ready for the next launch.";
    startBettingPhase();
  }

  // Events
  btnStart.addEventListener("click", () => {
    if (phase === "running") return;
    placeBetAndStart();
  });

  btnCashout.addEventListener("click", () => {
    if (phase === "running") {
      doCashout(false);
    }
  });

  btnAuto.addEventListener("click", () => {
    autoPlay = !autoPlay;
    btnAuto.textContent = "Auto play: " + (autoPlay ? "On" : "Off");
    if (autoPlay && phase === "idle" && balance > 0 && currentBet === 0) {
      placeBetAndStart();
    }
  });

  btnClearHistory.addEventListener("click", () => {
    historyEl.innerHTML = "";
    lastMults = [];
    lastMultsEl.innerHTML = "";
  });

  // Quick bet buttons
  document.querySelectorAll(".btn-pill[data-bet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-bet");
      if (type === "max") {
        betInput.value = Math.floor(balance);
      } else {
        const add = parseInt(type, 10);
        const current = parseFloat(betInput.value) || 0;
        const max = Math.floor(balance);
        betInput.value = Math.min(current + add, max);
      }
    });
  });

  // Auto cashout shortcuts
  document.querySelectorAll(".btn-pill[data-auto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      autoInput.value = btn.getAttribute("data-auto");
    });
  });

  window.addEventListener("resize", resizeCanvas);

  // Init
  resizeCanvas();
  drawBackground();
  updateBalanceDisplay();
  updateStatsDisplay();
  setPhase("idle");
  roundIdEl.textContent = "#" + roundId;
  roundTip.innerHTML =
    "Set your bet, optionally choose auto cashout, then click <strong>Place bet</strong> to queue for the next round.";
})();
