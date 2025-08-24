// ===== CONFIGURAÇÃO DO LM STUDIO =====
// Endereço informado por você (pode usar localhost se preferir):
const API_BASE = "http://26.140.166.251:1234";
const API_URL  = `${API_BASE}/v1/chat/completions`;
// Modelo carregado no LM Studio:
const MODEL    = "gemma-3-12b";

// ===== SELETOR DO CAMPO DE MENSAGEM NA LMS =====
// Ajuste se necessário (é o mesmo que você já utilizava)
const MESSAGE_FIELD_SELECTOR =
  "#__layout > div > div.wrapper > main > section.page > div.page__wrapper.container.submission-answer > div > div > div.answer.page__component > form > div.quill-editor.notranslate.quill-editor.notranslate > div.ql-container.ql-snow > div.ql-editor";

// ===== ELEMENTOS DO POPUP =====
const btnFetchCBAs     = document.getElementById("btnFetchCBAs");
const btnGenerate      = document.getElementById("btnGenerate");
const msg              = document.getElementById("msg");
const studentNameInput = document.getElementById("studentName");
const cbasArea         = document.getElementById("cbas");

// ===== COLETA DE CBAs DA PÁGINA =====
// Estratégia: tentar múltiplos seletores e varrer a tabela de critérios.
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
  const status = document.querySelector('input[name="status"]:checked').value; // "aprovado" | "reprovado"
  const cbasText = cbasArea.value.trim();

  // AbortController simples para evitar travar em caso de rede
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s

  // Instruções: seguir rigidamente a estrutura, NÃO expor CBAs, português, conciso.
  const systemPrompt = `
Você é Jhonatan, avaliador de uma LMS. Gere feedbacks em português do Brasil, concisos e claros, SEM emojis no corpo, EXCETO a despedida fixa.
Siga OBRIGATORIAMENTE esta estrutura e texto-base:

1) Saudação INVARIÁVEL:
"Olá [nome]! Tudo bem? Eu sou o Jhonatan e estou aqui para te ajudar nesta atividade."

2) Corpo:
- Se APROVADO: parabenize, destaque brevemente os pontos positivos observáveis a partir das CBAs (inferir do contexto), e traga UMA dica de melhoria/aperfeiçoamento.
- Se REPROVADO: aponte os erros principais (com base nas CBAs), descreva objetivamente a correção/ajuste esperado, e traga UMA dica motivadora/guia.

3) Fechamento INVARIÁVEL:
"Fico à disposição! Um abraço, Jhonatan :D"

REGRAS:
- NÃO mencione, nem liste, nem revele as CBAs ou "itens de CBA" no texto final.
- NÃO cite o termo "CBA" no feedback.
- Use o nome do aluno no lugar de [nome].
- Mantenha tom humano, acolhedor e direto.
- Não invente tecnologias ou comandos inexistentes.
- Se o status for APROVADO, não liste erros; se for REPROVADO, não parabenize como se tudo estivesse perfeito.
  `.trim();

  const userPrompt = `
Nome do aluno: ${studentName}
Status: ${status.toUpperCase()}
CBAs (apenas contexto, NÃO exibir no texto final):
${cbasText || "(vazio)"}
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
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} - ${txt}`);
    }

    const data = await resp.json();
    const feedback = data?.choices?.[0]?.message?.content?.trim();

    if (!feedback) {
      throw new Error("Resposta vazia da LLM.");
    }

    // Inserir direto no campo de mensagem da LMS
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { msg.textContent = "Aba ativa não encontrada."; return; }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [MESSAGE_FIELD_SELECTOR, feedback],
      func: (selector, text) => {
        const field = document.querySelector(selector);
        if (!field) {
          alert("Campo de texto não encontrado. Verifique o seletor no popup.js.");
          return;
        }
        field.innerHTML = text;
      }
    });

    msg.textContent = "Feedback gerado e inserido!";
  } catch (err) {
    console.error(err);
    msg.textContent = "Erro ao gerar. Verifique o LM Studio e o console (F12).";
  } finally {
    clearTimeout(timeoutId);
  }
});
