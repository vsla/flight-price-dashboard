# Por que este projeto existe

Preços de passagens para a Europa flutuam constantemente — às vezes caem 40% em 48 horas e voltam ao normal. Acompanhar isso manualmente todos os dias em todas as datas possíveis é inviável. Este sistema faz isso automaticamente:

- Varre todos os dias dos próximos 12 meses, toda madrugada
- Guarda um snapshot do preço de cada data a cada coleta
- Permite ver, no dashboard, como o preço de um voo específico evoluiu ao longo das semanas

**O fluxo de uso é:** o sistema identifica oportunidades → você confirma o preço no Google Flights → compra diretamente na companhia aérea.

---

## Por que não usamos web scraping

A alternativa mais óbvia seria fazer scraping do Google Flights ou Kayak. Descartamos por três razões:

1. **Legal:** os ToS dessas plataformas proíbem explicitamente scraping automatizado.
2. **Custo:** proxies residenciais para contornar bloqueios custam R$ 1.500–10.000/mês.
3. **Fragilidade:** qualquer atualização no layout do site quebra o scraper.

Existem APIs gratuitas que entregam os mesmos dados de forma confiável e legal.

---

## Por que Recife → Europa

A rota Recife–Europa tem poucos voos diretos e preços altamente variáveis. A maioria das conexões passa por Lisboa, Madrid ou São Paulo, o que cria janelas de promoção imprevisíveis — especialmente quando TAP, Iberia ou LATAM abrem assentos de última hora. É exatamente o tipo de rota onde monitoramento automatizado faz diferença real.

---

## Estratégias de busca implementadas

O sistema aplica automaticamente as seguintes técnicas para maximizar a chance de encontrar boas ofertas:

- **Varredura completa de calendário** — todos os dias dos próximos 12 meses, não só datas específicas.
- **Comparativo ida separada vs round-trip** — companhias às vezes oferecem promoções diferentes para cada modalidade.
- **Detecção de queda abrupta** — se o preço de uma data cair mais de 20% em relação à média dos últimos 7 dias, ela aparece destacada no top 10.
- **Sentido reverso** — monitorar LIS→REC e MAD→REC separadamente, pois há promoções de retorno que não aparecem na busca de ida.
- **Fonte múltipla** — cruzar Aviasales + Amadeus reduz a chance de perder uma promoção que só aparece em um dos metasearchers.
- **Fallback por rota** — quando a Aviasales não cobre uma rota (ex: REC→MAD), o sistema usa automaticamente o Amadeus, que tem cobertura global.
