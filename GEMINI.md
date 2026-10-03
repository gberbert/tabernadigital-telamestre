# Regras Mandatórias do Projeto Taberna Digital / Oráculo D&D 2024

Estas regras são de cumprimento obrigatório e prioritário para qualquer agente de IA ou assistente atuando neste workspace.

---

## 🚫 REGRA 1: NUNCA TESTAR OS DESENVOLVIMENTOS POR CONTA PRÓPRIA
- **O AGENTE NUNCA DEVE TESTAR O CÓDIGO/DESENVOLVIMENTOS POR CONTA PRÓPRIA**.
- É **estritamente proibido** abrir o navegador (subagentes de browser, testes automatizados de clique/navegação) ou executar testes dinâmicos de interface por iniciativa própria.
- **Sempre peça para o USUÁRIO testar** os desenvolvimentos, informando o que foi feito, onde acessar e como verificar.
- **ÚNICA EXCEÇÃO**: Apenas teste se o usuário solicitar **explicitamente** na mensagem (ex: *"teste você mesmo no navegador"*, *"faça os testes para mim"*). Fora dessa instrução explícita, NUNCA teste sozinho.

---

## 📊 REGRA 2: LISTAS E CATÁLOGOS EM TABELAS DINÂMICAS INTERATIVAS
- **Ao solicitar uma lista de qualquer item, tipo, personagem, magia, ferramenta, arma, monstro ou qualquer elemento**:
  - Responda obrigatoriamente estruturando os dados em uma **Tabela Markdown rica e padronizada**.
  - A primeira coluna deve conter o **Nome do Item** (PT-BR) e a segunda Nome Original (EN) se houver.
  - As colunas seguintes devem conter informações essenciais (Tipo/Categoria, Custo/ND/Círculo, Propriedades, Resumo/Efeito).
  - A interface web do chat transforma tabelas Markdown automaticamente em um componente de **Tabela Dinâmica Interativa**:
    - **Pesquisa Dinâmica**: Campo de busca em tempo real que filtra itens instantaneamente por qualquer coluna.
    - **Itens Clicáveis**: Cada linha da tabela é interativa (hover com destaque dourado, cursor pointer, botão "Abrir").
    - **Detalhamento Integrado ("Tudo dentro do chat")**: Ao clicar no item, o chat abre um detalhamento completo com ficha, atributos, regras oficiais completas e botão de ação para consultar o Oráculo.
    - **Botão "Voltar à lista"**: Permite retornar à visão tabular mantendo a pesquisa e o estado preservados.

---

## 🛡️ REGRA 3: FIDELIDADE ÀS REGRAS DO D&D 2024 (FREE RULES / SRD 5.2)
- Baseie sempre as respostas e dados no acervo oficial localizado em `dnd_2024_regras_ptbr/`.
- Mantenha a nomenclatura oficial bilíngue (ex.: Pontos de Vida (PV / Hit Points), Classe de Armadura (CA / AC), Nível de Desafio (ND / CR)).
- Responda sempre em Português do Brasil com máxima fidelidade às regras oficiais.
