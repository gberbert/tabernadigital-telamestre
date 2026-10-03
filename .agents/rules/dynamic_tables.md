# Regra de Apresentação de Listas e Catálogos (Tabelas Dinâmicas Interativas)

## Diretriz Geral
Sempre que o usuário solicitar uma lista de **qualquer item, tipo, personagem, classe, magia, monstro, ferramenta, arma, armadura, condição, tipo de dano ou qualquer outro recurso**:

1. **Estrutura Obrigatória em Tabela Markdown**:
   - Responda obrigatoriamente utilizando uma **Tabela Markdown** rica e estruturada.
   - A **primeira coluna** deve conter o **Nome do Item em Português** (e nome original em inglês entre parênteses ou na 2ª coluna).
   - As colunas seguintes devem conter informações essenciais e comparáveis (ex: Tipo/Categoria, Custo, ND/Círculo, Peso, Propriedades, Resumo do Efeito Principal).
   - Exemplo padrão:
     ```markdown
     | Nome (PT-BR) | Nome Original (EN) | Tipo / Categoria | Custo / ND / Círculo | Resumo / Efeito Principal |
     | :--- | :--- | :--- | :--- | :--- |
     | Ferramentas de Ladrão | Thieves' Tools | Ferramenta de Artesão | 25 po | Permite abrir fechaduras e desarmar armadilhas usando Destreza |
     ```

2. **Comportamento Interativo no Chat**:
   - A interface web do chat transforma tabelas Markdown automaticamente em um componente de **Tabela Dinâmica Interativa**:
     - **Pesquisa Dinâmica**: Campo de busca em tempo real que filtra itens instantaneamente por qualquer coluna.
     - **Itens Clicáveis**: Cada linha da tabela é interativa (hover com destaque dourado, cursor pointer, botão "Abrir").
     - **Detalhamento Integrado ("Tudo dentro do chat")**: Ao clicar no item, o chat abre um detalhamento completo com ficha, atributos, regras oficiais completas e botão de ação para consultar o Oráculo.
     - **Botão "Voltar à lista"**: Permite retornar à visão tabular mantendo a pesquisa e o estado preservados.
