// ===== CONFIGURAÇÃO DO LM STUDIO =====
const API_BASE = "http://26.140.166.251:1234";
const API_URL  = `${API_BASE}/v1/chat/completions`;
const MODEL    = "gemma-3-12b";

// ===== SELETOR DO CAMPO DE MENSAGEM NA LMS =====
const MESSAGE_FIELD_SELECTOR =
  "#__layout > div > div.wrapper > main > section.page > div.page__wrapper.container.submission-answer > div > div > div.answer.page__component > form > div.quill-editor.notranslate.quill-editor.notranslate > div.ql-container.ql-snow > div.ql-editor";

// ===== ELEMENTOS DO POPUP =====
const btnFetchCBAs     = document.getElementById("btnFetchCBAs");
const btnGenerate      = document.getElementById("btnGenerate");
const msg              = document.getElementById("msg");
const studentNameInput = document.getElementById("studentName");
const cbasArea         = document.getElementById("cbas");
const extraArea        = document.getElementById("extra");

// ===== LINKS ÚTEIS =====
const LINKS = `
Docker: https://docs.docker.com/get-started/introduction/
Django: https://www.djangoproject.com/start/
Render: https://render.com/docs
PythonAnywhere: https://help.pythonanywhere.com/pages/
Padrões de commit: https://dev.to/renatoadorno/padroes-de-commits-commit-patterns-41co
`;

// ===== COLETA DE CBAs =====
btnFetchCBAs.addEventListener("click", async () => {
  msg.textContent = "Buscando CBAs...";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { msg.textContent = "Aba ativa não encontrada."; return; }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selectors = [
        "div.technical-criteria__table > div > div.technical-criteria__table-item-text",
        "div.technical-criteria__table > div > div"
      ];
      const items = new Set();
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          const t = (el.textContent || "").trim();
          if (t) items.add(t);
        });
      }
      return Array.from(items);
    }
  });

  const cbas = results?.[0]?.result || [];
  if (cbas.length > 0) {
    cbasArea.value = cbas.join("\n");
    msg.textContent = `Foram coletadas ${cbas.length} CBAs.`;
  } else {
    cbasArea.value = "";
    msg.textContent = "Não encontrei CBAs nesta página.";
  }
});

// ===== GERAÇÃO DE FEEDBACK PELA LLM =====
btnGenerate.addEventListener("click", async () => {
  msg.textContent = "Gerando feedback...";

  const studentName = studentNameInput.value.trim() || "usuário";
  const status = document.querySelector('input[name="status"]:checked').value;
  const cbasText = cbasArea.value.trim();
  const extra = extraArea.value.trim();

  const systemPrompt = `
Você é Jhonatan, avaliador da LMS. Gere feedbacks em português do Brasil.
Regras obrigatórias:
1. Sempre começar com: "Olá [nome]! Tudo bem? Eu sou o Jhonatan e estou aqui para te ajudar nesta atividade."
2. Se APROVADO: parabenizar, destacar pontos positivos inferidos das CBAs, e dar 1 dica de melhoria (usando os links úteis se fizer sentido).
3. Se REPROVADO: apontar os erros principais com base nas CBAs, explicar como corrigir, e dar 1 dica motivadora (pode incluir links úteis).
4. Sempre terminar com: "Fico à disposição! Um abraço, Jhonatan :D"
5. Nunca mencionar nem exibir CBAs, apenas usá-las como contexto.
6. Usar estilo humano, direto e acolhedor, sem encher de emojis (somente o final fixo).
  `.trim();

  const userPrompt = `
Aluno: ${studentName}
Status: ${status.toUpperCase()}

CBAs (somente contexto, não incluir no texto final):
${cbasText || "(vazio)"}

Comentários extras:
${extra || "(nenhum)"}

Links úteis disponíveis:
${LINKS}
  `.trim();

  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 600
      })
    });

    const data = await resp.json();
    const feedback = data?.choices?.[0]?.message?.content?.trim();
    if (!feedback) throw new Error("Resposta vazia da LLM.");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [MESSAGE_FIELD_SELECTOR, feedback],
      func: (selector, text) => {
        const field = document.querySelector(selector);
        if (field) field.innerHTML = text;
        else alert("Campo de texto não encontrado.");
      }
    });

    msg.textContent = "Feedback gerado e inserido!";
  } catch (err) {
    console.error(err);
    msg.textContent = "Erro ao gerar feedback. Veja o console (F12).";
  }
});
