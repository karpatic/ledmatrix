function setInputValue(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clampScore(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.min(99, Math.max(0, parsed));
}

function buildScoreboardMessage(teamAScoreInput, teamBScoreInput) {
  const teamAScore = clampScore(teamAScoreInput.value);
  const teamBScore = clampScore(teamBScoreInput.value);
  return `${teamAScore}-${teamBScore}`;
}

function prefersBounce(message) {
  const lettersOnlyLength = String(message || "").replace(/[^A-Za-z]/g, "").length;
  return lettersOnlyLength > 5;
}

function initSoccerPage() {
  const teamAColorInput = document.querySelector("#teamAColor");
  const teamBColorInput = document.querySelector("#teamBColor");
  const sendScoreboardButton = document.querySelector("#sendScoreboardButton");
  const teamAScoreInput = document.querySelector("#teamAScore");
  const teamBScoreInput = document.querySelector("#teamBScore");
  const teamAScoreDown = document.querySelector("#teamAScoreDown");
  const teamAScoreUp = document.querySelector("#teamAScoreUp");
  const teamBScoreDown = document.querySelector("#teamBScoreDown");
  const teamBScoreUp = document.querySelector("#teamBScoreUp");
  const messageInput = document.querySelector("#messageInput");
  const sendMessageButton = document.querySelector("#sendMessageButton");
  const textColorInput = document.querySelector("#textColorInput");
  const bgColorInput = document.querySelector("#bgColorInput");
  const centerMotionButton = document.querySelector('[data-motion="CENTER"]');
  const bounceMotionButton = document.querySelector('[data-motion="BOUNCE"]');
  const staticColorFxButton = document.querySelector('[data-text-colorfx="STATIC"]');
  const rainbowColorFxButton = document.querySelector('[data-text-colorfx="RAINBOW_STATIC"]');

  if (
    !teamAColorInput ||
    !teamBColorInput ||
    !sendScoreboardButton ||
    !teamAScoreInput ||
    !teamBScoreInput ||
    !teamAScoreDown ||
    !teamAScoreUp ||
    !teamBScoreDown ||
    !teamBScoreUp ||
    !messageInput ||
    !sendMessageButton ||
    !textColorInput ||
    !bgColorInput ||
    !centerMotionButton ||
    !bounceMotionButton ||
    !staticColorFxButton ||
    !rainbowColorFxButton
  ) {
    return;
  }

  let scoreAnimationInFlight = false;
  let pendingScoreTeam = "A";

  function setMovementForMessage(message) {
    if (prefersBounce(message)) {
      bounceMotionButton.click();
      return;
    }
    centerMotionButton.click();
  }

  function setBillboardMessage(message, sendNow = false) {
    const normalized = String(message || "")
      .replace(/[^\x20-\x7e]/g, "")
      .slice(0, 80)
      .toUpperCase();
    messageInput.value = normalized;
    messageInput.dispatchEvent(new Event("input", { bubbles: true }));
    setMovementForMessage(normalized);
    if (sendNow) {
      sendMessageButton.click();
    }
  }

  function useTeamTextStyle(team) {
    const color = team === "A" ? teamAColorInput.value : teamBColorInput.value;
    staticColorFxButton.click();
    setInputValue(textColorInput, color);
    setInputValue(bgColorInput, "#000000");
  }

  function refreshScoreboardDisplay() {
    const teamAScore = clampScore(teamAScoreInput.value);
    const teamBScore = clampScore(teamBScoreInput.value);

    teamAScoreInput.value = String(teamAScore);
    teamBScoreInput.value = String(teamBScore);
  }

  function setScoreboardAsDefault(sendNow = false, team = "A") {
    useTeamTextStyle(team);
    setBillboardMessage(
      buildScoreboardMessage(teamAScoreInput, teamBScoreInput),
      sendNow,
    );
  }

  async function playGoalThenUpdateScore(team) {
    pendingScoreTeam = team;
    if (scoreAnimationInFlight) {
      return;
    }

    scoreAnimationInFlight = true;
    try {
      rainbowColorFxButton.click();
      setBillboardMessage("GOAL", true);
      await delay(900);
    } finally {
      try {
        setScoreboardAsDefault(true, pendingScoreTeam);
      } finally {
        scoreAnimationInFlight = false;
      }
    }
  }

  function nudgeScore(input, delta) {
    input.value = String(clampScore(Number.parseInt(input.value, 10) + delta));
    refreshScoreboardDisplay();
  }

  teamAColorInput.addEventListener("input", () => {
    setScoreboardAsDefault(false, "A");
  });
  teamBColorInput.addEventListener("input", () => {
    setScoreboardAsDefault(false, "B");
  });

  teamAScoreInput.addEventListener("input", () => {
    refreshScoreboardDisplay();
    setScoreboardAsDefault(false);
  });

  teamAScoreInput.addEventListener("change", () => {
    refreshScoreboardDisplay();
    playGoalThenUpdateScore("A");
  });

  teamBScoreInput.addEventListener("input", () => {
    refreshScoreboardDisplay();
    setScoreboardAsDefault(false);
  });

  teamBScoreInput.addEventListener("change", () => {
    refreshScoreboardDisplay();
    playGoalThenUpdateScore("B");
  });

  teamAScoreDown.addEventListener("click", () => {
    nudgeScore(teamAScoreInput, -1);
    playGoalThenUpdateScore("A");
  });

  teamAScoreUp.addEventListener("click", () => {
    nudgeScore(teamAScoreInput, 1);
    playGoalThenUpdateScore("A");
  });

  teamBScoreDown.addEventListener("click", () => {
    nudgeScore(teamBScoreInput, -1);
    playGoalThenUpdateScore("B");
  });

  teamBScoreUp.addEventListener("click", () => {
    nudgeScore(teamBScoreInput, 1);
    playGoalThenUpdateScore("B");
  });

  sendScoreboardButton.addEventListener("click", () => {
    setScoreboardAsDefault(true);
  });

  refreshScoreboardDisplay();
  setScoreboardAsDefault(false);
}

document.addEventListener("DOMContentLoaded", initSoccerPage);
