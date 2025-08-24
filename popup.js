// Seletor do campo de mensagem na LMS
const MESSAGE_FIELD_SELECTOR =
  "#__layout > div > div.wrapper > main > section.page > div.page__wrapper.container.submission-answer > div > div > div.answer.page__component > form > div.quill-editor.notranslate.quill-editor.notranslate > div.ql-container.ql-snow > div.ql-editor";

const btnInsert = document.getElementById("btnInserir");
const btnFetchCBAs = document.getElementById("btnFetchCBAs");
const msg = document.getElementById("msg");
const studentNameInput = document.getElementById("studentName");
const cbasArea = document.getElementById("cbas");

// === Coletar CBAs da página ===
btnFetchCBAs.addEventListener("click", async () => {
  msg.textContent = "Buscando CBAs...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selectors = [
        "div.technical-criteria__table > div > div.technical-criteria__table-item-text",
        "div.technical-criteria__table > div > div"
      ];

      let items = [];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent?.trim();
          if (text && !items.includes(text)) items.push(text);
        });
      }

      return items;
    }
  });

  const cbas = results[0].result || [];
  if (cbas.length > 0) {
    cbasArea.value = cbas.join("\n");
    msg.textContent = `Foram coletadas ${cbas.length} CBAs.`;
  } else {
    cbasArea.value = "Nenhuma CBA encontrada nesta página.";
    msg.textContent = "Não encontrei CBAs.";
  }
});

// === Inserir feedback no campo ===
btnInsert.addEventListener("click", async () => {
  msg.textContent = "Inserindo...";

  const studentName = studentNameInput.value.trim() || "usuário";
  const status = document.querySelector('input[name="status"]:checked').value;
  const cbasText = cbasArea.value.trim();

  let TEMPLATE = "";

  if (status === "aprovado") {
    TEMPLATE = `Olá ${studentName}! Tudo bem? Eu sou o Jhonatan e estou aqui para te ajudar nesta atividade.  

Parabéns pelo excelente trabalho na conclusão da tarefa! Seu empenho é digno de reconhecimento, continue assim!  

📌 Aqui estão as CBAs analisadas:
${cbasText || "(nenhuma coletada)"}

Agora, para você continuar evoluindo, aqui vai uma dica: explore sempre novos conteúdos, busque desafios práticos e mantenha a constância nos estudos.  

Fico à disposição! Um abraço, Jhonatan :D`;
  } else {
    TEMPLATE = `Olá ${studentName}! Tudo bem? Eu sou o Jhonatan e estou aqui para te ajudar nesta atividade.  

${studentName}, ao executar sua atividade, percebi que alguns pontos precisam de ajustes para que o resultado final esteja de acordo com o esperado.  

📌 Aqui estão as CBAs analisadas:
${cbasText || "(nenhuma coletada)"}

Não desanime! O importante é revisar os passos, corrigir os detalhes e tentar novamente, pois é assim que se aprende de verdade.  

Minha dica: mantenha a prática constante e consulte materiais extras para reforçar seus conhecimentos.  

Fico à disposição! Um abraço, Jhonatan :D`;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      msg.textContent = "Não achei a aba ativa.";
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [MESSAGE_FIELD_SELECTOR, TEMPLATE],
      func: (selector, text) => {
        const field = document.querySelector(selector);
        if (!field) {
          alert("Campo de texto não encontrado. Verifique o seletor no popup.js.");
          return;
        }
        field.innerHTML = text;
      }
    });

    msg.textContent = "Feedback inserido!";
  } catch (e) {
    console.error(e);
    msg.textContent = "Falhou ao inserir. Veja o console (F12) da página.";
  }
});
