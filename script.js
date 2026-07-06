// Cloudflare Workersを公開したら、次のURLだけを書き換えてください。
// APIキーは絶対にこのファイルへ書かないでください。
const API_ENDPOINT = "ここにCloudflare WorkersのURL";

const STORAGE_KEYS = {
  nickname: "ai-chat-nickname",
  history: "ai-chat-history",
};
const MAX_LOCAL_MESSAGES = 200;
const MAX_CONTEXT_MESSAGES = 20;
const REQUEST_TIMEOUT_MS = 60_000;

const chatArea = document.querySelector("#chatArea");
const messagesElement = document.querySelector("#messages");
const emptyState = document.querySelector("#emptyState");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const nicknameDisplay = document.querySelector("#nicknameDisplay");
const nicknameModal = document.querySelector("#nicknameModal");
const nicknameForm = document.querySelector("#nicknameForm");
const nicknameInput = document.querySelector("#nicknameInput");

let nickname = readStorage(STORAGE_KEYS.nickname)?.trim() || "";
let history = loadHistory();
let isSending = false;

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(readStorage(STORAGE_KEYS.history) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (item) =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
    ).slice(-MAX_LOCAL_MESSAGES);
  } catch {
    return [];
  }
}

function saveHistory() {
  const saved = writeStorage(
    STORAGE_KEYS.history,
    JSON.stringify(history.slice(-MAX_LOCAL_MESSAGES))
  );
  if (!saved) {
    showTemporaryError("履歴をブラウザに保存できませんでした。空き容量をご確認ください。");
  }
}

function createMessageElement(role, content, options = {}) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const block = document.createElement("div");
  block.className = "message-block";

  const name = document.createElement("p");
  name.className = "message-name";
  name.textContent = role === "user" ? nickname : role === "error" ? "エラー" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (options.thinking) {
    const thinking = document.createElement("span");
    thinking.className = "thinking";
    thinking.textContent = "考え中";
    const dots = document.createElement("span");
    dots.className = "thinking-dots";
    dots.setAttribute("aria-label", "...");
    dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    thinking.append(dots);
    bubble.append(thinking);
  } else {
    // textContentを使い、AIの返答をHTMLとして実行させないようにします。
    bubble.textContent = content;
  }

  block.append(name, bubble);
  row.append(block);
  return row;
}

function renderHistory() {
  messagesElement.replaceChildren();
  history.forEach((message) => {
    messagesElement.append(createMessageElement(message.role, message.content));
  });
  emptyState.hidden = history.length > 0;
  scrollToBottom(false);
}

function scrollToBottom(smooth = true) {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

function setSending(sending) {
  isSending = sending;
  sendButton.disabled = sending;
  messageInput.disabled = sending;
  clearHistoryButton.disabled = sending;
}

function resizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

function showTemporaryError(message) {
  const errorElement = createMessageElement("error", message);
  messagesElement.append(errorElement);
  emptyState.hidden = true;
  scrollToBottom();
}

async function sendMessage(content) {
  const userMessage = { role: "user", content };
  history.push(userMessage);
  saveHistory();
  messagesElement.append(createMessageElement("user", content));
  emptyState.hidden = true;

  const thinkingElement = createMessageElement("assistant", "", { thinking: true });
  messagesElement.append(thinkingElement);
  scrollToBottom();
  setSending(true);

  try {
    if (!API_ENDPOINT.startsWith("https://")) {
      throw new Error("script.js の API_ENDPOINT をCloudflare WorkersのURLに変更してください。");
    }

    // 文脈が長くなりすぎないよう、送信するのは直近20件だけです。
    const context = history.slice(-MAX_CONTEXT_MESSAGES).map(({ role, content: text }) => ({
      role,
      content: text,
    }));

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;

    try {
      response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: context }),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `通信に失敗しました（HTTP ${response.status}）。`);
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("AIから空の返答が届きました。もう一度お試しください。");
    }

    const assistantMessage = { role: "assistant", content: data.reply.trim() };
    history.push(assistantMessage);
    saveHistory();
    thinkingElement.replaceWith(createMessageElement("assistant", assistantMessage.content));
  } catch (error) {
    let errorMessage = "予期しないエラーが発生しました。";
    if (error instanceof DOMException && error.name === "AbortError") {
      errorMessage = "AIの応答に時間がかかりすぎました。少し待ってからもう一度お試しください。";
    } else if (error instanceof TypeError) {
      errorMessage = "サーバーに接続できませんでした。WorkersのURL、公開状態、CORS設定をご確認ください。";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    thinkingElement.replaceWith(
      createMessageElement("error", errorMessage)
    );
  } finally {
    setSending(false);
    messageInput.focus();
    scrollToBottom();
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const content = messageInput.value.trim();
  if (!content || isSending) return;
  messageInput.value = "";
  resizeTextarea();
  sendMessage(content);
});

messageInput.addEventListener("input", resizeTextarea);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

clearHistoryButton.addEventListener("click", () => {
  if (history.length === 0 || !window.confirm("このブラウザに保存されたチャット履歴を消しますか？")) return;
  if (!removeStorage(STORAGE_KEYS.history)) {
    showTemporaryError("履歴を削除できませんでした。ブラウザのサイトデータ設定をご確認ください。");
    return;
  }
  history = [];
  renderHistory();
  messageInput.focus();
});

nicknameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const newNickname = nicknameInput.value.trim();
  if (!newNickname) return;
  if (!writeStorage(STORAGE_KEYS.nickname, newNickname)) {
    nicknameInput.setCustomValidity("ニックネームを保存できません。ブラウザのサイトデータ設定をご確認ください。");
    nicknameInput.reportValidity();
    return;
  }
  nicknameInput.setCustomValidity("");
  nickname = newNickname;
  nicknameDisplay.textContent = nickname;
  nicknameModal.hidden = true;
  messageInput.focus();
});

nicknameDisplay.textContent = nickname;
renderHistory();

if (!nickname) {
  nicknameModal.hidden = false;
  nicknameInput.focus();
} else {
  messageInput.focus();
}
