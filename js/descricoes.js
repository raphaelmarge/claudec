/* ============================================================
   TORQUE FITNESS — Descritivos de função e biomecânica
   ------------------------------------------------------------
   Mapa: nome normalizado do aparelho -> { f, m, b, i, d }
     f = função  |  m = músculos  |  b = biomecânica
     i = indicação / público  |  d = dica de execução
   A chave é o nome em minúsculas, sem acentos/pontuação
   (mesma normalização usada em site.js). Um descritivo cobre
   todas as variantes/séries que compartilham o mesmo nome.
   ============================================================ */
window.TORQUE_DESCRICOES = (function () {
  const legPress = {
    f: 'O campeão de pernas: máxima carga para quadríceps e glúteos com total segurança lombar.',
    m: 'Quadríceps, glúteo máximo e isquiotibiais (auxiliar).',
    b: 'Cadeia cinética fechada: extensão simultânea de quadril e joelho contra a plataforma. A coluna apoiada reduz a carga axial sobre a lombar, permitindo grandes cargas com segurança.',
    i: 'Indispensável em qualquer sala de musculação — atrai de iniciantes a avançados e é referência de procura na área de pernas.',
    d: 'Não estenda totalmente os joelhos no topo e não deixe a lombar descolar do encosto na descida.'
  };
  const hackSquat = {
    f: 'Agachamento guiado que entrega coxas fortes e definidas sem o risco do agachamento livre.',
    m: 'Quadríceps, glúteo máximo e adutores.',
    b: 'Agachamento em trajetória guiada com apoio dorsal; a inclinação direciona a carga para os quadríceps reduzindo a exigência de equilíbrio do agachamento livre.',
    i: 'Queridinho de quem busca volume de coxa — vende muito para o público intermediário e avançado.',
    d: 'Pés na largura dos ombros; desça até ~90° controlando, sem deixar os calcanhares subirem.'
  };
  const legExt = {
    f: 'Isolamento total do quadríceps para definição e aquele "gomo" na coxa.',
    m: 'Quadríceps (reto femoral e vastos).',
    b: 'Extensão de joelho em cadeia aberta, com o quadril fixo no banco isolando completamente o quadríceps.',
    i: 'Presença obrigatória na sala: campeã em hipertrofia e também muito usada em reabilitação de joelho.',
    d: 'Alinhe o eixo da máquina com o joelho e segure 1s na contração; evite cargas que gerem dor patelar.'
  };
  const legCurl = {
    f: 'O par perfeito da extensora: posterior de coxa forte, equilibrado e protegido contra lesões.',
    m: 'Isquiotibiais (bíceps femoral, semitendíneo, semimembranáceo); panturrilha auxiliar.',
    b: 'Flexão de joelho em cadeia aberta; o apoio do quadril estabiliza a pelve e isola a musculatura posterior da coxa.',
    i: 'Item essencial de toda sala — agrada todos os públicos e completa o treino de pernas.',
    d: 'Controle a volta (fase excêntrica) e evite levantar o quadril do apoio para “roubar” o movimento.'
  };
  const legCurlExt = {
    f: 'Dois em um: extensora e flexora no mesmo aparelho — coxa completa ocupando metade do espaço.',
    m: 'Quadríceps na extensão; isquiotibiais na flexão.',
    b: 'Permite treinar agonista e antagonista do joelho (frente e posterior da coxa) alternando o movimento em cadeia aberta.',
    i: 'A escolha inteligente para academias que querem otimizar espaço e investimento treinando a coxa inteira.',
    d: 'Ajuste o apoio a cada função; mantenha o tronco firme e a amplitude completa nos dois movimentos.'
  };
  const chestPress = {
    f: 'Peito forte e largo com a segurança de uma trajetória guiada — o supino sem complicação.',
    m: 'Peitoral maior, deltoide anterior e tríceps.',
    b: 'Empurrar horizontal (adução horizontal do ombro + extensão do cotovelo); trajetória guiada protege o ombro e dispensa estabilização da carga.',
    i: 'Alternativa segura e acessível ao supino livre — conquista iniciantes e mantém os avançados.',
    d: 'Ombros para baixo e para trás; não trave totalmente os cotovelos no fim do empurrão.'
  };
  const inclinePress = {
    f: 'Constrói a parte alta do peito, aquele volume que faz a diferença no espelho.',
    m: 'Peitoral superior, deltoide anterior e tríceps.',
    b: 'Empurrar em plano inclinado; o ângulo recruta mais as fibras claviculares do peitoral e o deltoide anterior.',
    i: 'Procurada pelo público que já treina e quer desenvolver o peito superior com qualidade.',
    d: 'Não exagere na inclinação (acima de ~45° vira exercício de ombro); desça controlando até a linha do peito.'
  };
  const pecFly = {
    f: 'O isolador de peito por excelência — contração máxima para um peitoral definido.',
    m: 'Peitoral maior (esterno-costal); deltoide anterior auxiliar.',
    b: 'Adução horizontal dos ombros com cotovelos semi-fixos (crucifixo); isola o peitoral sem participação do tríceps.',
    i: 'Favorita para finalizar o treino de peito — agrada do iniciante ao avançado.',
    d: 'Mantenha um leve flexionamento de cotovelo fixo e junte as mãos à frente apertando o peito 1s.'
  };
  const shoulderPress = {
    f: 'Ombros largos e poderosos: o desenvolvimento que dá amplitude à silhueta.',
    m: 'Deltoides (anterior e medial), trapézio e tríceps.',
    b: 'Empurrar vertical acima da cabeça (flexão/abdução do ombro + extensão do cotovelo) em trajetória guiada.',
    i: 'Base de qualquer treino de ombro — indispensável e de altíssima procura na sala.',
    d: 'Não hiperextenda a lombar; suba sem travar os cotovelos e desça até a linha das orelhas.'
  };
  const lateralRaise = {
    f: 'O segredo dos ombros largos: isolamento do deltoide lateral para aquela aparência atlética.',
    m: 'Deltoide medial; supraespinhal auxiliar.',
    b: 'Abdução do ombro até a linha do ombro com o cotovelo fixo, isolando a cabeça lateral do deltoide.',
    i: 'Exercício-chave para a "largura" dos ombros — sucesso garantido com todos os públicos.',
    d: 'Suba até a altura dos ombros (não além) liderando com os cotovelos, sem balançar o tronco.'
  };
  const deltMachine = {
    f: 'Ombros torneados e saudáveis: trabalha contorno lateral e posterior em um só movimento.',
    m: 'Deltoide medial e posterior.',
    b: 'Abdução/extensão horizontal do ombro com apoio do tronco; trabalha o contorno e a parte posterior do ombro.',
    i: 'Excelente para estética e postura — agrada todos os níveis e tem ótima saída.',
    d: 'Movimento lento e controlado; evite usar impulso e mantenha o peito apoiado.'
  };
  const rearDelt = {
    f: 'Postura impecável e ombros 3D: foco no deltoide posterior e nas costas altas.',
    m: 'Deltoide posterior, romboides e trapézio médio.',
    b: 'Abdução horizontal (movimento de “abrir”) curvado, recrutando a parte de trás do ombro e a musculatura escapular.',
    i: 'Corrige a postura de quem treina muito peito — argumento de venda forte para todos os níveis.',
    d: 'Cotovelos levemente flexionados e fixos; abra apertando as escápulas, sem usar o trapézio superior.'
  };
  const latPull = {
    f: 'Costas em "V": a puxada que dá largura e aquele dorso de atleta.',
    m: 'Latíssimo do dorso, redondo maior, bíceps e romboides.',
    b: 'Adução e extensão do ombro puxando a barra para baixo; o apoio das coxas estabiliza o tronco e foca no dorsal.',
    i: 'Campeã de procura na área de costas — perfeita para quem ainda não faz barra fixa.',
    d: 'Puxe a barra até a parte alta do peito levando os cotovelos para baixo; não jogue o tronco para trás.'
  };
  const row = {
    f: 'Costas densas e fortes: a remada que constrói espessura e melhora a postura.',
    m: 'Latíssimo, romboides, trapézio médio, deltoide posterior e bíceps.',
    b: 'Puxada horizontal (remada): retração escapular + extensão do ombro com o peito apoiado, isolando o dorso e poupando a lombar.',
    i: 'Indispensável para costas completas — alta saída e aprovação de todos os públicos.',
    d: 'Inicie puxando pelas escápulas (junte-as) e só depois pelos braços; não curve a lombar.'
  };
  const bicepsCurl = {
    f: 'Braços impressionantes: isolamento total do bíceps, sem trapaça.',
    m: 'Bíceps braquial, braquial e braquiorradial.',
    b: 'Flexão de cotovelo com o úmero apoiado, eliminando o balanço e isolando o bíceps.',
    i: 'Um clássico que nunca sai de moda — atrai todo mundo que quer braços maiores.',
    d: 'Não balance o corpo; desça até estender quase totalmente e suba apertando o bíceps.'
  };
  const tricepsExt = {
    f: 'Braços maiores de verdade: o tríceps é 2/3 do braço, e este aparelho é o caminho.',
    m: 'Tríceps braquial (três cabeças).',
    b: 'Extensão de cotovelo contra resistência; a fixação do braço isola o tríceps.',
    i: 'Essencial para braços volumosos — sucesso de procura com todos os públicos.',
    d: 'Mantenha os cotovelos junto ao corpo e estenda totalmente, controlando a volta.'
  };
  const calf = {
    f: 'Panturrilhas potentes que completam o shape das pernas.',
    m: 'Gastrocnêmio e sóleo.',
    b: 'Flexão plantar do tornozelo (elevar os calcanhares) contra carga, em pé ou sentado.',
    i: 'Aparelho que não pode faltar para quem leva o treino de pernas a sério.',
    d: 'Use amplitude total: desça bem os calcanhares (alongamento) e suba ao máximo, com pausa no topo.'
  };
  const abdution = {
    f: 'Glúteos firmes e quadril estável: o trabalho da parte externa que todos procuram.',
    m: 'Glúteo médio e mínimo, tensor da fáscia lata.',
    b: 'Abdução do quadril (afastar as coxas) sentado, isolando a região lateral do glúteo.',
    i: 'Altíssima procura, sobretudo do público feminino — campeão de fila na sala.',
    d: 'Incline levemente o tronco à frente para ativar mais o glúteo; controle a volta sem bater os pesos.'
  };
  const adduction = {
    f: 'Parte interna da coxa tonificada e quadril protegido contra lesões.',
    m: 'Adutores (magno, longo, curto), grácil e pectíneo.',
    b: 'Adução do quadril (juntar as coxas) sentado contra resistência.',
    i: 'Muito procurado para tonificar a coxa interna — sucesso com todos os públicos.',
    d: 'Abra só até onde sentir alongamento confortável e junte controlando, sem solavancos.'
  };
  const innerOuter = {
    f: 'Coxa interna e externa no mesmo aparelho: dois exercícios campeões, um só investimento.',
    m: 'Adutores (juntar) e glúteo médio/mínimo (afastar).',
    b: 'Adução e abdução do quadril sentado; um mesmo equipamento treina os dois grupos antagonistas.',
    i: 'Escolha inteligente para academias: une dois dos aparelhos mais procurados economizando espaço.',
    d: 'Troque o ajuste entre as duas funções; movimento controlado em ambas, sem impulso.'
  };
  const glute = {
    f: 'O foco em glúteos que o público pede: estética e força em um movimento isolado.',
    m: 'Glúteo máximo; isquiotibiais auxiliares.',
    b: 'Extensão de quadril contra resistência (coice/empurrar para trás), com o tronco apoiado.',
    i: 'Um dos campeões de procura da sala — imbatível para o público focado em glúteos.',
    d: 'Aperte o glúteo no fim da extensão e evite arquear a lombar para compensar.'
  };
  const hipThrust = {
    f: 'O rei dos glúteos: o exercício mais eficiente para resultados que aparecem.',
    m: 'Glúteo máximo; isquiotibiais e quadríceps auxiliares.',
    b: 'Extensão de quadril com apoio das costas, levando a carga do quadril para cima — pico de tensão na contração do glúteo.',
    i: 'Febre nas redes e na sala — um dos aparelhos mais desejados pelo público atual.',
    d: 'Suba até o tronco ficar paralelo ao chão, queixo neutro, apertando o glúteo 1s no topo.'
  };
  const abs = {
    f: 'Abdômen definido e core forte: a base de um corpo bonito e funcional.',
    m: 'Reto abdominal; oblíquos auxiliares.',
    b: 'Flexão do tronco (aproximar costelas da pelve) contra resistência guiada.',
    i: 'Core forte melhora postura e desempenho — aparelho de apelo universal.',
    d: 'Enrole a coluna (não puxe pelo pescoço) e expire na contração; evite tracionar a cabeça.'
  };
  const obliques = {
    f: 'Cintura definida e tronco forte: trabalho de oblíquos e rotação.',
    m: 'Oblíquos interno e externo; reto abdominal.',
    b: 'Rotação da coluna torácica contra resistência, com a pelve estabilizada.',
    i: 'Complementa o abdômen e desenha a cintura — agrada todos os públicos.',
    d: 'Gire a partir do tronco, mantendo o quadril fixo; cargas moderadas e movimento controlado.'
  };
  const backExt = {
    f: 'Lombar blindada: fortalece a cadeia posterior e previne dores nas costas.',
    m: 'Eretores da espinha, glúteos e isquiotibiais.',
    b: 'Extensão do tronco (hiperextensão) a partir da flexão de quadril, fortalecendo a musculatura paravertebral.',
    i: 'Argumento de venda imbatível: prevenção de dor lombar atrai todos os públicos.',
    d: 'Suba até alinhar o tronco (sem hiperestender demais) e desça controlando; evite usar impulso.'
  };
  const pullupAssist = {
    f: 'Faça barra fixa hoje: o contrapeso que transforma iniciantes em quem domina o peso do corpo.',
    m: 'Latíssimo, bíceps, peitoral e tríceps (conforme a pegada).',
    b: 'Puxada/empurrada vertical com contrapeso que reduz a carga, permitindo executar barra e paralela com técnica até ganhar força.',
    i: 'Conquista o iniciante que sonha com a primeira barra — porta de entrada de grande apelo.',
    d: 'Use o contrapeso mínimo necessário; desça controlando e suba com amplitude total.'
  };
  const dip = {
    f: 'Peito e tríceps com o peso do corpo: o clássico que entrega tronco forte.',
    m: 'Tríceps, peitoral inferior e deltoide anterior.',
    b: 'Flexão e extensão dos cotovelos sustentando o corpo nas paralelas; a inclinação do tronco direciona para peito ou tríceps.',
    i: 'Preferido do público que já treina e quer evoluir com o peso corporal.',
    d: 'Não desça além do confortável para o ombro; mantenha as escápulas estáveis.'
  };
  const preacher = {
    f: 'O banco Scott: pico de bíceps sem trapaça, para braços que impressionam.',
    m: 'Bíceps braquial e braquial.',
    b: 'Flexão de cotovelo com o braço totalmente apoiado no banco inclinado, eliminando trapaça e maximizando o pico do bíceps.',
    i: 'Clássico desejado por quem quer braços de destaque — agrada todos os níveis.',
    d: 'Não estenda o cotovelo de forma brusca no fim; controle a descida para proteger a articulação.'
  };
  const functional = {
    f: 'A estação mais versátil da sala: centenas de exercícios funcionais em um só lugar.',
    m: 'Corpo inteiro, conforme o exercício escolhido.',
    b: 'Polias ajustáveis em altura permitem puxar/empurrar em qualquer ângulo e plano, treinando força, estabilidade e padrões funcionais.',
    i: 'Atende todos os públicos e modalidades — do iniciante ao atleta — e nunca fica parada na sala.',
    d: 'Ajuste a altura da polia ao exercício e mantenha o core firme para estabilizar o movimento.'
  };
  const multiStation = {
    f: 'Academia completa em um só equipamento: corpo inteiro com economia máxima de espaço.',
    m: 'Corpo inteiro (peito, costas, ombros, braços, pernas).',
    b: 'Reúne várias polias/estações num só equipamento, permitindo circuito completo — ideal para academias e espaços compartilhados.',
    i: 'Solução ideal para academias, condomínios e estúdios: atende vários alunos ao mesmo tempo, maximizando o retorno.',
    d: 'Organize uma sequência de estações para circuito; ajuste cargas e apoios em cada posto.'
  };
  const smith = {
    f: 'Versatilidade e segurança: agachamento, supino e remada com a barra sempre sob controle.',
    m: 'Varia com o exercício; compostos de pernas, peito e costas.',
    b: 'A barra corre em trilhos verticais, restringindo a trajetória; aumenta a segurança e reduz a exigência de estabilização.',
    i: 'Equipamento curinga que agrada do iniciante (segurança) ao avançado (intensidade sem auxiliar).',
    d: 'Use as travas de segurança; posicione os pés conforme o exercício para respeitar a trajetória fixa.'
  };
  const crossover = {
    f: 'O crossover dos sonhos: tensão contínua e infinitos ângulos para um peito definido.',
    m: 'Peitoral, deltoides e estabilizadores.',
    b: 'Adução horizontal contra cabos altos/baixos; a tensão constante e o ajuste de ângulo permitem isolar diferentes porções do peito.',
    i: 'Peça de destaque na sala — atrai o público que busca definição e variedade de treino.',
    d: 'Dê um passo à frente para gerar tensão; cruze as mãos à frente apertando o peito.'
  };
  const benchFree = {
    f: 'A base de todo treino livre: banco robusto para supino, desenvolvimento e roscas.',
    m: '—',
    b: 'Estrutura de apoio (plano/inclinado/declinado) para supino, desenvolvimento e roscas com halteres e barra.',
    i: 'Item básico e indispensável: nenhuma sala de musculação funciona sem ele.',
    d: 'Confira a estabilidade antes de carregar; ajuste o encosto ao exercício desejado.'
  };
  const benchAdj = {
    f: 'Um banco, infinitos treinos: regule o ângulo e mude a ênfase a cada exercício.',
    m: '—',
    b: 'Encosto regulável (declinado a inclinado) que dá suporte a supinos, desenvolvimentos e roscas em diferentes planos.',
    i: 'O coringa da área de pesos livres — versatilidade que justifica a compra na hora.',
    d: 'Trave bem a regulagem antes de usar; varie o ângulo para mudar a ênfase muscular.'
  };
  const olympicBench = {
    f: 'Supino de verdade: banco olímpico robusto para treinar peito pesado com barra.',
    m: '—',
    b: 'Banco com cavaletes para barra olímpica; permite supino reto/inclinado/declinado com pesos livres.',
    i: 'Indispensável para o público que treina força e leva o supino com barra a sério.',
    d: 'Treine com auxiliar ou pinos de segurança; ajuste a altura dos ganchos à sua envergadura.'
  };
  const rack = {
    f: 'O coração da área livre: treine pesado e sozinho com total segurança.',
    m: '—',
    b: 'Suporta a barra olímpica em agachamentos, supinos e levantamentos, com pinos de segurança para treinar sem auxiliar.',
    i: 'Peça central de qualquer sala de força — alta procura do público intermediário e avançado.',
    d: 'Posicione os pinos de segurança na altura certa antes de cada série.'
  };
  const storage = {
    f: 'Sala organizada, imagem profissional: acessórios sempre arrumados e à mão.',
    m: '—',
    b: 'Acessório de organização — não é equipamento de exercício; mantém anilhas, barras, halteres ou kettlebells arrumados e acessíveis.',
    i: 'Investimento que valoriza o espaço: organização que transmite seriedade e segurança aos alunos.',
    d: 'Posicione próximo à área de uso e distribua o peso de forma equilibrada nas prateleiras.'
  };
  const squatMachine = {
    f: 'Agachamento sem medo: pernas e glúteos completos com a coluna protegida.',
    m: 'Quadríceps, glúteo máximo, adutores e isquiotibiais.',
    b: 'Agachamento em trajetória guiada com apoio de ombros/quadril, distribuindo a carga e poupando a coluna.',
    i: 'Alternativa segura ao agachamento livre — conquista quem tem receio do movimento tradicional.',
    d: 'Pés alinhados aos ombros; desça controlando e empurre pelos calcanhares.'
  };
  const pendulumSquat = {
    f: 'Estímulo intenso de coxa com a trajetória mais confortável e natural do mercado.',
    m: 'Quadríceps, glúteo máximo e adutores.',
    b: 'A plataforma descreve um arco pendular, mantendo tensão constante e respeitando a trajetória natural do agachamento.',
    i: 'Equipamento premium que vira atração da sala para o público intermediário e avançado.',
    d: 'Mantenha o tronco apoiado e desça profundo respeitando o arco da máquina.'
  };
  const beltSquat = {
    f: 'Pernas pesadas, zero carga na coluna: a solução para treinar forte sem dor lombar.',
    m: 'Quadríceps, glúteos e isquiotibiais.',
    b: 'A carga é presa ao quadril por um cinturão, tirando a compressão da coluna — ideal para quem tem restrição lombar.',
    i: 'Diferencial de venda: atende quem tem limitação lombar e quer continuar treinando perna pesado.',
    d: 'Ajuste o cinturão no quadril (não na cintura) e mantenha o core firme durante o agachamento.'
  };
  const tibialis = {
    f: 'A peça que faltava: fortalece a canela e previne lesões em corredores.',
    m: 'Tibial anterior.',
    b: 'Dorsiflexão do tornozelo (puxar a ponta do pé para cima) contra carga; previne canelite e equilibra a panturrilha.',
    i: 'Diferencial para atrair corredores e atletas — prevenção de canelite é um forte argumento.',
    d: 'Movimento curto e controlado; foque na amplitude total da dorsiflexão.'
  };
  const shrug = {
    f: 'Trapézio imponente: a moldura dos ombros que dá presença ao físico.',
    m: 'Trapézio superior; levantador da escápula.',
    b: 'Elevação das escápulas (“encolher os ombros”) contra carga, isolando o trapézio.',
    i: 'Procurada pelo público avançado que busca um trapézio volumoso e marcante.',
    d: 'Suba os ombros em direção às orelhas (sem rolar) e segure 1s no topo.'
  };
  const bicepsTriceps = {
    f: 'Braço completo em uma estação: rosca e tríceps no mesmo equipamento.',
    m: 'Bíceps e braquial (rosca); tríceps (extensão).',
    b: 'Treina flexão (rosca) e extensão (tríceps) de cotovelo na mesma estação — braço completo.',
    i: 'Eficiência que vende: dois exercícios de braço economizando espaço e investimento.',
    d: 'Alterne as duas funções; mantenha os cotovelos fixos em ambos os movimentos.'
  };
  const tricepsPush = {
    f: 'O pushdown clássico: tensão contínua para um tríceps definido e cheio.',
    m: 'Tríceps braquial (três cabeças).',
    b: 'Extensão de cotovelo empurrando o cabo para baixo, com os cotovelos junto ao corpo isolando o tríceps.',
    i: 'Favorito para volume e definição de braço — alta procura com todos os públicos.',
    d: 'Cole os cotovelos no tronco e estenda totalmente, controlando a subida do cabo.'
  };
  const declineBench = {
    f: 'A parte baixa do peito em destaque: banco declinado para um peitoral completo.',
    m: 'Peitoral inferior, deltoide anterior e tríceps.',
    b: 'Apoio em declive para supino com pesos livres, enfatizando as fibras inferiores do peitoral.',
    i: 'Complemento desejado pelo público que quer um peito desenhado por inteiro.',
    d: 'Prenda bem as pernas; controle a barra/halteres na descida até a linha inferior do peito.'
  };
  const reformer = {
    f: 'O coração do estúdio de Pilates: força, controle e alongamento com elegância e baixo impacto.',
    m: 'Core, estabilizadores e corpo inteiro.',
    b: 'Carro deslizante sobre molas reguláveis: empurrar/puxar contra a resistência trabalha força, controle e alongamento com baixíssimo impacto.',
    i: 'Atende o público mais amplo possível — do iniciante ao avançado, reabilitação, gestantes e idosos — fidelizando alunos.',
    d: 'Ajuste as molas ao exercício e ao nível; priorize controle e respiração, não velocidade.'
  };
  const cadillac = {
    f: 'A peça mais completa do Pilates: centenas de exercícios e descompressão da coluna em um só aparelho.',
    m: 'Corpo inteiro, core e flexibilidade.',
    b: 'Cama com barras, molas e alças para centenas de exercícios de força, mobilidade e descompressão da coluna.',
    i: 'Investimento de prestígio para estúdios — atende do condicionamento à reabilitação e valoriza o espaço.',
    d: 'Versátil para todos os níveis; selecione molas e acessórios conforme o objetivo da aula.'
  };
  const pilatesChair = {
    f: 'Compacta e desafiadora: força e equilíbrio de corpo inteiro ocupando pouco espaço.',
    m: 'Core, glúteos, pernas e estabilizadores.',
    b: 'Pedal com molas para exercícios de empurrar e equilíbrio que desafiam força e controle em base reduzida.',
    i: 'Queridinha dos estúdios que querem desafiar o aluno intermediário e avançado sem ocupar área.',
    d: 'Ative o core antes de empurrar o pedal e controle a subida (excêntrica) das molas.'
  };
  const ladderBarrel = {
    f: 'Mobilidade e alongamento de coluna como nenhum outro: postura e flexibilidade que o aluno sente.',
    m: 'Core, coluna e flexibilidade.',
    b: 'Barril e escada para alongamento, extensão da coluna e fortalecimento do core.',
    i: 'Complemento valorizado em estúdios — entrega resultados de mobilidade que fidelizam alunos.',
    d: 'Ajuste a distância escada–barril ao tamanho do praticante; movimentos lentos e amplos.'
  };
  const spineCorrector = {
    f: 'Alívio e alinhamento: mobiliza a coluna e fortalece o core com conforto.',
    m: 'Core e musculatura paravertebral.',
    b: 'Apoio curvo para mobilizar e alinhar a coluna, alongando e fortalecendo o core.',
    i: 'Diferencial para estúdios com foco em reabilitação postural e bem-estar da coluna.',
    d: 'Acomode bem a curvatura da coluna no apoio e respeite os limites de amplitude.'
  };
  const treadmill = {
    f: 'A esteira que não pode faltar: o cardio nº 1 procurado por todos os alunos.',
    m: 'Cardiovascular; quadríceps, glúteos, isquiotibiais e panturrilhas.',
    b: 'Corrida/caminhada sobre esteira motorizada — condicionamento aeróbico e gasto calórico no padrão de marcha.',
    i: 'Campeã absoluta de procura na área de cardio — do iniciante na caminhada ao corredor avançado.',
    d: 'Comece com aquecimento, evite segurar no apoio ao correr e use a inclinação para variar a intensidade.'
  };
  const curvedTread = {
    f: 'Esteira sem motor que queima mais: o cardio premium para treinos intensos.',
    m: 'Cardio; cadeia posterior e panturrilhas.',
    b: 'Sem motor: a lona se move pela ação do corredor, elevando o gasto energético e recrutando mais a cadeia posterior.',
    i: 'Diferencial de alto valor para boxes e estúdios — atrai o público de alta intensidade.',
    d: 'A velocidade é você quem controla com a passada; ideal para tiros curtos e potentes.'
  };
  const elliptical = {
    f: 'Cardio sem impacto para todos: queima calorias preservando as articulações.',
    m: 'Cardio; pernas, glúteos e braços.',
    b: 'Passada elíptica fluida sem impacto articular, movimentando membros superiores e inferiores ao mesmo tempo.',
    i: 'Sucesso com todos os públicos — especialmente quem tem dores articulares ou está em reabilitação.',
    d: 'Mantenha a postura ereta e use os braços ativamente para um gasto calórico maior.'
  };
  const bike = {
    f: 'O cardio mais acessível: pedalar com baixo impacto que agrada de iniciantes a idosos.',
    m: 'Cardio; quadríceps, glúteos e panturrilhas.',
    b: 'Pedalada com carga ajustável — condicionamento aeróbico de baixo impacto para os membros inferiores.',
    i: 'Aposta certeira de baixo impacto — perfeita para iniciantes e reabilitação.',
    d: 'Regule a altura do banco (joelho levemente flexionado no ponto baixo) para proteger o joelho.'
  };
  const recumbent = {
    f: 'Conforto e segurança no cardio: encosto reclinado que protege a coluna ao pedalar.',
    m: 'Cardio; quadríceps, glúteos e isquiotibiais.',
    b: 'Pedalada com encosto reclinado e apoio lombar — ideal para reabilitação e baixo impacto na coluna.',
    i: 'Conquista o público idoso e de reabilitação — conforto que vira argumento de venda.',
    d: 'Ajuste a distância do banco para pedalar sem estender totalmente o joelho.'
  };
  const airBike = {
    f: 'A bike do HIIT: quanto mais forte você pedala, mais ela responde — queima total.',
    m: 'Cardio de corpo inteiro.',
    b: 'Resistência por ventoinha que cresce com o esforço; braços e pernas trabalham juntos — excelente para HIIT.',
    i: 'Estrela do cross training e dos treinos intervalados — desejo do público intenso.',
    d: 'Quanto mais forte você pedala/puxa, maior a resistência — ideal para tiros curtos e intensos.'
  };
  const spinning = {
    f: 'O motor das aulas que lotam: spinning é energia, comunidade e resultado.',
    m: 'Cardio; pernas e glúteos.',
    b: 'Roda inercial com carga ajustável para treinos intervalados, em pé ou sentado.',
    i: 'Base das aulas coletivas mais populares — enche a sala e fideliza turmas.',
    d: 'Ajuste banco e guidão antes de começar; nunca pedale com a carga zerada em pé.'
  };
  const stair = {
    f: 'O cardio que mais queima e tonifica glúteos: subir escadas sem parar.',
    m: 'Cardio; glúteos, quadríceps e panturrilhas.',
    b: 'Subida contínua de degraus — alto gasto calórico e forte recrutamento de glúteos e pernas.',
    i: 'Febre entre quem quer cardio intenso e glúteos definidos — grande apelo atual.',
    d: 'Mantenha-se ereto, pise com o pé todo nos degraus e evite apoiar o peso nos corrimãos.'
  };
  const rowingCardio = {
    f: 'O cardio mais completo: 85% da musculatura em ação, com baixíssimo impacto.',
    m: 'Costas, pernas, core e braços.',
    b: 'Ciclo de remada — empurrar com as pernas, puxar com tronco e braços — contra resistência de ar/água; cardio completo e de baixo impacto.',
    i: 'Trabalha o corpo quase inteiro de uma vez — argumento de eficiência que conquista todos os públicos.',
    d: 'A força vem das pernas primeiro, depois tronco e braços; volte na ordem inversa, sem curvar a lombar.'
  };
  const pedal = {
    f: 'Cardio leve e prático: pedalar de baixo impacto para condicionamento e recuperação.',
    m: 'Cardio; membros inferiores.',
    b: 'Movimento de pedalada de baixo impacto para condicionamento e reabilitação.',
    i: 'Solução compacta para reabilitação e condicionamento leve — agrada o público que busca baixo impacto.',
    d: 'Mantenha cadência constante e ajuste a resistência ao objetivo.'
  };

  return {
    /* ---------------- HM Series ---------------- */
    'prone leg curl': { f: 'Mesa flexora (decúbito ventral).', m: legCurl.m, b: 'Flexão de joelho deitado de bruços; a posição prona estabiliza o quadril e isola os isquiotibiais.', i: legCurl.i, d: 'Evite levantar o quadril da maca; controle a descida do peso.' },
    'leg extension': legExt,
    'leg press': legPress,
    'pectoral fly': pecFly,
    'lateral raise': lateralRaise,
    'shoulder press': shoulderPress,
    'pearl delt pec fly': { f: 'Combo crucifixo (peito) + voador inverso (ombro posterior).', m: 'Peitoral na adução; deltoide posterior e romboides na abertura.', b: 'Um movimento fecha à frente (peitoral) e o oposto abre atrás (deltoide posterior), treinando frente e costas do tronco superior.', i: 'Todos os níveis; equilibra peito e ombro posterior no mesmo aparelho.', d: 'Controle as duas fases; ajuste os apoios ao trocar de função.' },
    'chest press': chestPress,
    'pull up assistance exercise': pullupAssist,
    'lat pull down': latPull,
    'functional trainer': functional,
    'kneeling twist': { f: 'Rotação de tronco ajoelhado (oblíquos).', m: obliques.m, b: 'Rotação da coluna na posição ajoelhada contra cabo, enfatizando os oblíquos e o core anti-rotação.', i: obliques.i, d: 'Gire pelo tronco mantendo o quadril fixo; cargas moderadas.' },
    'abdominal crunch': abs,
    'standing calf raise': { f: 'Panturrilha em pé.', m: calf.m, b: 'Flexão plantar em pé com carga nos ombros; com o joelho estendido enfatiza o gastrocnêmio.', i: calf.i, d: calf.d },
    'hip abduction': abdution,
    'adductor': adduction,
    'leg curl extension': legCurlExt,
    'glute exercise': glute,
    'seated dip': { f: 'Mergulho sentado (tríceps).', m: tricepsExt.m, b: 'Extensão de cotovelo empurrando para baixo com o tronco apoiado, isolando o tríceps com segurança.', i: 'Todos os níveis; alternativa segura à paralela.', d: tricepsExt.d },
    'biceps curl': bicepsCurl,
    'back muscle exercise': row,
    'low pull': { f: 'Remada baixa (puxada no cabo baixo).', m: row.m, b: 'Puxada horizontal a partir do cabo baixo, retraindo as escápulas — espessura das costas e trapézio médio.', i: row.i, d: row.d },
    'seated row': row,
    'lat pulldown': latPull,
    'lat puldown low row': { f: 'Combo puxada alta + remada baixa.', m: row.m, b: 'Une a puxada vertical (largura) e a remada horizontal (espessura) num só equipamento, cobrindo todo o dorso.', i: 'Academias que querem costas completas em um aparelho.', d: 'Use a puxada para largura e a remada para espessura; mantenha a postura neutra.' },
    'adjustable chest press': { f: 'Supino em máquina com ângulo ajustável.', m: chestPress.m, b: 'Empurrar com encosto regulável (reto/inclinado), variando a ênfase entre peitoral médio e superior.', i: chestPress.i, d: 'Trave o ângulo desejado; não trave os cotovelos no fim.' },
    'hip abduction adduction': innerOuter,
    'leg cuarl extension': legCurlExt,
    'biceps triceps extension': bicepsTriceps,
    'back abdominal combo': { f: 'Combo lombar + abdômen.', m: 'Reto abdominal (flexão) e eretores da espinha (extensão).', b: 'Treina flexão do tronco (abdômen) e extensão (lombar), equilibrando o core anterior e posterior.', i: 'Todos os níveis; core equilibrado previne dores lombares.', d: 'Trabalhe as duas funções na mesma sessão para equilibrar o core.' },
    'standing multi flight': { f: 'Estação de cabos em pé (multifuncional).', m: 'Corpo inteiro conforme o exercício.', b: 'Polias para puxar/empurrar em pé, treinando padrões funcionais e estabilização do core.', i: functional.i, d: functional.d },
    'flat bench': benchFree,
    'multi purpose bench': benchAdj,
    'adjustable bench': benchAdj,
    'military bench': { f: 'Banco de desenvolvimento militar (ombros).', m: 'Deltoides, trapézio e tríceps.', b: 'Encosto vertical com suporte de barra para desenvolvimento de ombros sentado.', i: 'Intermediários e avançados no desenvolvimento com barra.', d: 'Apoie bem as costas no encosto e não hiperestenda a lombar ao empurrar.' },
    'olympic decline bench': { f: 'Banco olímpico declinado (peito inferior).', m: 'Peitoral inferior, deltoide anterior e tríceps.', b: 'Supino em declive com barra olímpica, enfatizando as fibras inferiores do peitoral.', i: olympicBench.i, d: 'Prenda as pernas e treine com auxiliar; controle a barra na descida.' },
    'olympic incline bench': { f: 'Banco olímpico inclinado (peito superior).', m: 'Peitoral superior, deltoide anterior e tríceps.', b: 'Supino inclinado com barra olímpica, focando a porção clavicular do peito.', i: olympicBench.i, d: 'Inclinação de ~30–45°; desça a barra até a parte alta do peito.' },
    'weight bench press': olympicBench,
    'multi functional bench press': { f: 'Banco multifuncional com suporte de barra.', m: '—', b: 'Banco ajustável com cavaletes para supino em vários ângulos e outros exercícios com pesos livres.', i: benchAdj.i, d: 'Confira os ganchos e travas antes de carregar a barra.' },
    'preacher curl': preacher,
    'roman chair': { f: 'Cadeira romana (lombar/glúteos).', m: backExt.m, b: backExt.b, i: backExt.i, d: backExt.d },
    'squat rack': rack,
    'dumbbell rack': storage,
    'sissy squat station': { f: 'Sissy squat (quadríceps/reto femoral).', m: 'Quadríceps, sobretudo o reto femoral.', b: 'Agachamento com o tronco inclinado para trás e joelhos à frente, alongando e isolando intensamente o quadríceps.', i: 'Intermediários e avançados; alta tensão no quadríceps.', d: 'Comece sem carga até dominar o equilíbrio; desça controlando para proteger o joelho.' },
    'tibia dorsi flexion': tibialis,
    'kettlebell rack': storage,
    'commodity shelf': storage,
    'plate tree': storage,
    'barbell rack': storage,
    'degree leg press': legPress,
    'degree hack squat': hackSquat,
    'leg press hack squat': { f: 'Combo leg press + hack squat.', m: legPress.m, b: 'Equipamento 2 em 1: leg press (empurrar deitado) e hack squat (agachamento guiado), cobrindo pernas em dois padrões.', i: 'Academias que querem dois exercícios de perna em um equipamento.', d: 'Ajuste o apoio conforme a função; respeite a amplitude de cada padrão.' },
    'hip bomber': hipThrust,
    'super dorsy bar': { f: 'Barra para puxada/dorsais (largura das costas).', m: latPull.m, b: latPull.b, i: latPull.i, d: latPull.d },
    'multi functional smith': smith,
    'smith machine': smith,
    'smith squat rack': { f: 'Smith combinado com gaiola de agachamento.', m: 'Compostos de pernas, peito e costas.', b: 'Une a barra guiada do Smith e o rack livre, permitindo treino guiado e com pesos livres na mesma estrutura.', i: 'Todos os níveis; flexibilidade entre guiado e livre.', d: 'Use as travas; escolha entre barra guiada ou livre conforme o exercício.' },
    'incline chest fly': { f: 'Crucifixo inclinado (peito superior).', m: 'Peitoral superior; deltoide anterior auxiliar.', b: 'Adução horizontal em plano inclinado, isolando a porção clavicular do peitoral.', i: 'Intermediários e avançados; foco no peito superior.', d: 'Cotovelos levemente flexionados e fixos; junte as mãos acima do peito.' },
    'v squat rack': squatMachine,
    '90 degree leg press': legPress,
    'hip thrust glute': hipThrust,
    'abdominal oblique crunch': obliques,
    'deadlift shrug': { f: 'Estação de levantamento terra/encolhimento.', m: 'Cadeia posterior (eretores, glúteos, isquiotibiais) e trapézio.', b: 'Trajetória guiada para terra e encolhimento, trabalhando cadeia posterior e trapézio com a coluna estabilizada.', i: 'Intermediários e avançados; força de cadeia posterior com mais segurança.', d: 'Mantenha a coluna neutra; empurre o chão com os pés e finalize estendendo o quadril.' },
    'arrow deadlift rack': { f: 'Plataforma/rack para levantamento terra.', m: 'Cadeia posterior completa.', b: 'Estrutura de apoio para terra com barra, com pegada e altura otimizadas para o padrão de extensão de quadril.', i: 'Intermediários e avançados no levantamento terra.', d: 'Mantenha a barra próxima ao corpo e a lombar neutra durante todo o levantamento.' },
    'rowing back trainer': row,
    'iso lateral leg extension': { f: 'Cadeira extensora isolateral.', m: legExt.m, b: 'Extensão de joelho com braços independentes para cada perna, corrigindo assimetrias.', i: 'Todos os níveis; ideal para corrigir diferença de força entre as pernas.', d: 'Trabalhe as pernas de forma independente para igualar os lados.' },
    'horizontal leg curl': { f: 'Mesa/cadeira flexora horizontal.', m: legCurl.m, b: legCurl.b, i: legCurl.i, d: legCurl.d },
    'triceps dip': { f: 'Paralela/mergulho para tríceps.', m: tricepsExt.m, b: dip.b, i: dip.i, d: dip.d },
    'iso lateral bench wide chest': { f: 'Supino isolateral pegada aberta.', m: chestPress.m, b: 'Empurrar com braços independentes e pegada ampla, enfatizando a parte externa do peitoral.', i: 'Intermediários e avançados; corrige assimetrias do peito.', d: 'Empurre os dois lados igualmente; controle a fase de descida.' },
    'wide chest press': { f: 'Supino máquina pegada aberta.', m: chestPress.m, b: 'Pegada ampla aumenta o alongamento do peitoral e a amplitude de adução horizontal.', i: chestPress.i, d: 'Não desça além do confortável para o ombro com a pegada aberta.' },
    'iso lateral horizontal press': { f: 'Supino horizontal isolateral.', m: chestPress.m, b: 'Empurrar horizontal com braços independentes (isolateral), equilibrando os dois lados.', i: 'Todos os níveis; equilíbrio entre os lados.', d: 'Empurre simétrico; se um lado falhar antes, reduza a carga.' },
    'rowing high back trainer': row,
    'iso lateral low row': { f: 'Remada baixa isolateral.', m: row.m, b: 'Remada com braços independentes, corrigindo assimetrias do dorso.', i: 'Todos os níveis; corrige diferença de força entre os lados das costas.', d: 'Puxe iniciando pela escápula; mantenha o peito no apoio.' },
    'rowing front high back trainer': row,
    'power squat pro': squatMachine,
    'rhino belt squat': beltSquat,
    'rhino belt': beltSquat,
    'iso lateral chest back': { f: 'Combo peito/costas isolateral.', m: 'Peitoral (empurrar) e dorsais (puxar).', b: 'Estação isolateral que empurra (peito) e puxa (costas) com braços independentes.', i: 'Todos os níveis; treina empurrar e puxar equilibrando os lados.', d: 'Alterne empurrar e puxar; mantenha simetria entre os braços.' },
    'side lift trainer': { f: 'Elevação lateral guiada (ombros).', m: lateralRaise.m, b: lateralRaise.b, i: lateralRaise.i, d: lateralRaise.d },
    'standing abductor': { f: 'Abdutor em pé (glúteo médio).', m: abdution.m, b: 'Abdução do quadril em pé contra resistência, com foco em glúteo médio e estabilidade pélvica.', i: abdution.i, d: 'Mantenha o tronco estável e afaste a perna sem rodar o quadril.' },
    'standing hip abduction': { f: 'Abdução de quadril em pé.', m: abdution.m, b: 'Afastar a perna lateralmente em pé contra carga, isolando os abdutores do quadril.', i: abdution.i, d: 'Não incline o tronco para o lado; movimento vem só do quadril.' },
    'standing hip thrust': { f: 'Elevação de quadril em pé (glúteos).', m: hipThrust.m, b: 'Extensão de quadril em pé contra resistência, com pico de contração do glúteo.', i: hipThrust.i, d: 'Aperte o glúteo na extensão sem arquear a lombar.' },
    'transfer kick': { f: 'Coice/extensão de quadril (glúteos).', m: glute.m, b: glute.b, i: glute.i, d: glute.d },
    'shoulder lift': { f: 'Desenvolvimento/elevação de ombros.', m: shoulderPress.m, b: shoulderPress.b, i: shoulderPress.i, d: shoulderPress.d },
    '3 multi station': multiStation,
    'seated shoulder press': shoulderPress,
    'inclined chest press': inclinePress,
    'wrist trainer': { f: 'Fortalecimento de punho/antebraço.', m: 'Flexores e extensores do antebraço.', b: 'Flexão/extensão e rotação do punho contra carga, fortalecendo antebraço e pegada.', i: 'Atletas de luta, escalada e quem busca pegada forte.', d: 'Amplitude completa e carga leve; movimento lento para proteger o punho.' },
    'torso rotation trainer': obliques,

    /* ---------------- K1 Series ---------------- */
    'sit stand chest clip': { f: 'Crucifixo/adução de peito (sentar e empurrar).', m: pecFly.m, b: pecFly.b, i: pecFly.i, d: pecFly.d },
    'sit stand sideways': { f: 'Trabalho lateral de tronco/ombros.', m: 'Deltoides, oblíquos e core.', b: 'Movimento lateral em pé/sentado contra cabo, recrutando ombros e estabilizadores do tronco.', i: 'Todos os níveis; trabalho funcional de core e ombros.', d: 'Estabilize o core e evite girar o quadril durante o movimento.' },
    'bent over dumbbell raise': rearDelt,
    'stand push chest': { f: 'Empurrar peito em pé (cabo).', m: chestPress.m, b: 'Adução horizontal/empurrar em pé contra cabo, com o core estabilizando — padrão funcional de empurrar.', i: 'Todos os níveis; padrão funcional de empurrar.', d: 'Dê um passo à frente e mantenha o core firme ao empurrar.' },
    'high low pull': { f: 'Puxada alta e baixa (costas completas).', m: row.m, b: 'Combina puxada vertical (largura) e horizontal (espessura) para todo o dorso.', i: 'Todos os níveis; costas completas.', d: 'Use a puxada alta para largura e a baixa para espessura.' },
    'rhino squat trainer': squatMachine,
    'stretch bend leg': legCurlExt,
    'bicep trainer': bicepsCurl,
    'super pullover': { f: 'Pullover máquina (dorsal e peitoral).', m: 'Latíssimo do dorso, peitoral e serrátil.', b: 'Adução do ombro em arco (do alto à frente do corpo), alongando e contraindo o dorsal e o peitoral.', i: 'Intermediários e avançados; conecta dorsal e peitoral.', d: 'Movimento amplo e controlado; sinta o alongamento do dorsal no início.' },
    'lat pulldown triceps dip': { f: 'Combo puxada alta + mergulho de tríceps.', m: 'Latíssimo e bíceps (puxar); tríceps (empurrar).', b: 'Une puxada vertical para as costas e mergulho para o tríceps na mesma estação.', i: 'Todos os níveis; costas e tríceps em um aparelho.', d: 'Alterne as funções; ajuste o apoio de pernas na puxada.' },
    'seated chest press': chestPress,
    'pendulum': pendulumSquat,
    'vertical curl': bicepsCurl,
    'super inclined press': inclinePress,
    'belt squat': beltSquat,
    'flat chest press traine': chestPress,
    'multifunctional bench press rack': { f: 'Rack multifuncional com banco de supino.', m: '—', b: 'Estrutura com banco e suportes para supino, agachamento e exercícios com barra livre.', i: 'Todos os níveis; centro de treino com barra livre.', d: 'Posicione os pinos de segurança e ajuste o banco antes de carregar.' },
    'separate integrated leg press': { f: 'Leg press com plataformas independentes.', m: legPress.m, b: 'Plataformas separadas para cada perna (isolateral), corrigindo assimetrias na extensão de quadril e joelho.', i: 'Todos os níveis; corrige diferença de força entre as pernas.', d: 'Trabalhe cada perna de forma independente, mantendo a lombar apoiada.' },
    '3d hip bridge': hipThrust,
    'horizontal lift': { f: 'Elevação/empurrada horizontal (tronco superior).', m: 'Peitoral, deltoides e tríceps.', b: 'Empurrar horizontal guiado, trabalhando o tronco superior com estabilidade.', i: 'Todos os níveis.', d: 'Empurre controlando e não trave os cotovelos no fim.' },
    'calf tibialis trainer': { f: 'Combo panturrilha + tibial.', m: 'Gastrocnêmio/sóleo (flexão plantar) e tibial anterior (dorsiflexão).', b: 'Treina os dois lados do tornozelo — flexão plantar (panturrilha) e dorsiflexão (tíbia) — equilibrando a articulação.', i: 'Corredores e atletas; equilíbrio do tornozelo e prevenção de canelite.', d: 'Use amplitude total nas duas direções, com pausa nos extremos.' },
    'upslope bird': rearDelt,
    'hack squat shoulder lif': { f: 'Combo hack squat + desenvolvimento de ombro.', m: 'Pernas (agachamento) e ombros (empurrar).', b: 'Estação que combina agachamento guiado e elevação de ombros.', i: 'Academias que querem perna e ombro em um aparelho.', d: 'Ajuste os apoios ao trocar de exercício; respeite a amplitude de cada um.' },
    'hip ridge squat': { f: 'Combo ponte de quadril + agachamento.', m: 'Glúteos, quadríceps e isquiotibiais.', b: 'Une extensão de quadril (ponte/glúteo) e agachamento, cobrindo toda a musculatura de pernas e glúteos.', i: 'Todos os níveis; glúteos e pernas completos.', d: 'Aperte o glúteo na ponte e desça controlando no agachamento.' },
    'kneeling leg bend': { f: 'Flexora ajoelhada (isquiotibiais).', m: legCurl.m, b: 'Flexão de joelho de forma unilateral ajoelhado, isolando o isquiotibial com grande amplitude.', i: legCurl.i, d: 'Controle a fase excêntrica; evite arquear a lombar.' },
    'sitting shoulder lift': shoulderPress,
    'scissor shoulder lift': { f: 'Desenvolvimento de ombro com braços independentes.', m: shoulderPress.m, b: 'Empurrar vertical isolateral (movimento em “tesoura”), equilibrando os dois ombros.', i: 'Todos os níveis; corrige assimetria dos ombros.', d: 'Empurre os dois lados igualmente, sem hiperestender a lombar.' },
    'stand push shoulders': { f: 'Desenvolvimento de ombros em pé.', m: shoulderPress.m, b: 'Empurrar vertical em pé contra cabo, com o core estabilizando.', i: 'Todos os níveis; padrão funcional de empurrar acima da cabeça.', d: 'Mantenha o core firme e não arqueie a lombar ao subir.' },
    'double track row pull back': row,
    'smith row': { f: 'Remada na barra guiada (Smith).', m: row.m, b: 'Remada com a barra em trilhos, padronizando a trajetória e poupando estabilização.', i: row.i, d: 'Puxe a barra ao abdômen retraindo as escápulas; tronco firme.' },
    'tower chest push shoulder push': { f: 'Torre de empurrar peito e ombro.', m: 'Peitoral, deltoides e tríceps.', b: 'Estação que empurra na horizontal (peito) e na vertical (ombro).', i: 'Todos os níveis; peito e ombro em um aparelho.', d: 'Ajuste o ângulo conforme o foco (horizontal = peito, vertical = ombro).' },
    'triceps press down': tricepsPush,
    'scissors squat trainer': { f: 'Agachamento/avanço em tesoura.', m: 'Quadríceps, glúteos e isquiotibiais.', b: 'Padrão unilateral (afundo) guiado, trabalhando pernas e estabilidade de quadril.', i: 'Intermediários e avançados; força unilateral de perna.', d: 'Desça o joelho de trás em direção ao chão controlando; tronco ereto.' },
    'inner outer thigh': innerOuter,
    'sitting stretch bend leg': legCurlExt,
    'pull up bar connector': { f: 'Acessório/conector de barra fixa.', m: '—', b: 'Componente estrutural que conecta barras fixas — peça de montagem, não de exercício.', i: 'Montagem de estruturas de barra fixa.', d: 'Verifique o aperto e a fixação antes de qualquer uso.' },
    '4 multi station': multiStation,
    'adjustable crossover': crossover,
    '5 multi station': multiStation,
    '8 multi station': multiStation,

    /* ---------------- K3 Series ---------------- */
    'rear kick': glute,
    'seated calf': { f: 'Panturrilha sentado.', m: calf.m, b: 'Flexão plantar sentado com os joelhos flexionados, enfatizando o sóleo.', i: calf.i, d: 'Joelho flexionado foca o sóleo; use amplitude total com pausa no topo.' },
    'triceps press': { f: 'Tríceps máquina.', m: tricepsExt.m, b: 'Extensão de cotovelo guiada contra resistência, isolando o tríceps.', i: tricepsExt.i, d: tricepsExt.d },
    'incline chest press': inclinePress,
    'pull down': latPull,
    'low row': { f: 'Remada baixa.', m: row.m, b: row.b, i: row.i, d: row.d },

    /* ---------------- K5 Series ---------------- */
    'seated chest fly': pecFly,
    'seated standing lateral raise': lateralRaise,
    'bicep curl': bicepsCurl,
    'hyper extension': backExt,
    'hack squat': hackSquat,
    'kneeling leg flexion': { f: 'Flexora ajoelhada.', m: legCurl.m, b: legCurl.b, i: legCurl.i, d: legCurl.d },
    'dual track row': row,
    'tricep pushdown': tricepsPush,
    'seated leg extension curl combo': legCurlExt,

    /* ---------------- K6 Series ---------------- */
    'delt machine': deltMachine,
    'calf heel lift': calf,
    'outer thigh': abdution,
    'inner thigh': adduction,
    'leg curl': legCurl,
    'incline row': row,
    'high pull': { f: 'Puxada alta.', m: latPull.m, b: latPull.b, i: latPull.i, d: latPull.d },

    /* ---------------- K8 Series ---------------- */
    'seated leg extension': legExt,
    'kneeling twis': obliques,
    'seated leg curl': { f: 'Cadeira flexora sentado.', m: legCurl.m, b: 'Flexão de joelho sentado contra o apoio, isolando os isquiotibiais com a pelve fixa.', i: legCurl.i, d: 'Ajuste o encosto para alinhar o joelho ao eixo; controle a volta.' },

    /* ---------------- A7 Series ---------------- */
    'row high back': row,
    'low row pull back': row,
    'sitting row': row,
    'multi angle chest push': { f: 'Supino máquina com múltiplos ângulos.', m: chestPress.m, b: 'Empurrar guiado com ângulo regulável, variando a ênfase entre peito médio e superior.', i: chestPress.i, d: 'Escolha o ângulo conforme a porção do peito a focar.' },
    'rowing back': row,
    'straight arm compression': { f: 'Pulldown com braços estendidos (dorsal).', m: 'Latíssimo do dorso e redondo maior.', b: 'Adução do ombro com cotovelos estendidos, isolando o dorsal sem participação do bíceps.', i: 'Intermediários e avançados; isola o dorsal sem o braço.', d: 'Mantenha os cotovelos fixos e estendidos; puxe pela contração do dorsal.' },
    'high row pull back': row,
    'slide pull back trainer': row,
    'triceps compression': { f: 'Tríceps máquina.', m: tricepsExt.m, b: 'Extensão de cotovelo guiada, isolando o tríceps.', i: tricepsExt.i, d: tricepsExt.d },
    'vertical rowing pull back': row,
    'rowing pull back': row,
    'dual function orbital row': row,
    'cross shoulder raises': { f: 'Elevações de ombro em cabo cruzado.', m: 'Deltoide medial e posterior.', b: 'Abdução/elevação contra cabos cruzados, trabalhando o contorno do ombro com tensão constante.', i: 'Intermediários e avançados; definição de ombro.', d: 'Movimento controlado; evite usar impulso do tronco.' },
    'seated push': chestPress,
    'reclining bench': benchAdj,
    'horizontal press': chestPress,
    'bench press rack': olympicBench,
    'standing rowing pull back': row,
    'pec fly': pecFly,
    'reverse crunches': { f: 'Abdominal infra (reverse crunch).', m: 'Reto abdominal, porção inferior.', b: 'Flexão da pelve em direção ao tronco (elevar o quadril), enfatizando a parte inferior do abdômen.', i: 'Todos os níveis; foco no abdômen inferior.', d: 'Eleve o quadril enrolando a pelve, sem balançar as pernas.' },
    'flat chest press trainer': chestPress,
    'scissor push chest trainer': { f: 'Supino isolateral (movimento em tesoura).', m: chestPress.m, b: 'Empurrar com braços independentes, equilibrando os dois lados do peitoral.', i: 'Todos os níveis; corrige assimetria do peito.', d: 'Empurre simétrico; controle a fase de retorno.' },
    'biceps curl triceps': bicepsTriceps,
    '45 degree leg press': legPress,
    'separate leg press': { f: 'Leg press com plataformas independentes.', m: legPress.m, b: 'Plataformas separadas para cada perna (isolateral), corrigindo assimetrias.', i: 'Todos os níveis; equilíbrio entre as pernas.', d: 'Trabalhe cada perna com a mesma carga e amplitude.' },
    'combo leg press hack squat': { f: 'Combo leg press + hack squat.', m: legPress.m, b: 'Equipamento 2 em 1 para pernas: empurrar deitado (leg press) e agachar guiado (hack squat).', i: 'Academias que querem dois padrões de perna em um aparelho.', d: 'Troque o apoio conforme a função; respeite a amplitude de cada um.' },
    'hack slide': hackSquat,
    '70 degree leg press': legPress,
    'huck squat': hackSquat,
    'swing squat': pendulumSquat,
    'lunge': { f: 'Avanço/afundo guiado (pernas unilateral).', m: 'Quadríceps, glúteo máximo e isquiotibiais.', b: 'Passada unilateral com flexão de joelho e quadril, treinando força e estabilidade de uma perna por vez.', i: 'Intermediários e avançados; força e equilíbrio unilateral.', d: 'Tronco ereto; desça o joelho de trás controlando sem ultrapassar a ponta do pé da frente.' },
    'bend forward and lift leg': { f: 'Inclinar e elevar a perna (cadeia posterior).', m: 'Glúteos, isquiotibiais e eretores da espinha.', b: 'Extensão de quadril com inclinação do tronco, recrutando toda a cadeia posterior.', i: 'Intermediários e avançados; força de cadeia posterior.', d: 'Mantenha a lombar neutra; movimento vem da articulação do quadril.' },
    'smith row pull back': { f: 'Remada na barra guiada (Smith).', m: row.m, b: 'Remada com a barra em trilhos, padronizando a trajetória.', i: row.i, d: 'Puxe ao abdômen retraindo as escápulas; tronco firme.' },
    'seated leg press machine': legPress,
    'seated leg press': legPress,
    'hip bridge': hipThrust,
    'standing pull up assistance exercise': pullupAssist,

    /* ---------------- A8 Series ---------------- */
    'rigo pull back': row,
    'scissor rowing pull back': row,
    'super french press': { f: 'Tríceps francês (extensão acima da cabeça).', m: tricepsExt.m, b: 'Extensão de cotovelo com os braços acima da cabeça, alongando bastante a cabeça longa do tríceps.', i: 'Intermediários e avançados; foco na cabeça longa do tríceps.', d: 'Mantenha os cotovelos apontados para frente e estáveis; controle a descida atrás da cabeça.' },
    'kneeling leg curl': { f: 'Flexora ajoelhada (isquiotibiais).', m: legCurl.m, b: legCurl.b, i: legCurl.i, d: legCurl.d },
    'curved leg': legCurl,
    'seared leg curline': { f: 'Cadeira flexora sentado.', m: legCurl.m, b: 'Flexão de joelho sentado, isolando os isquiotibiais com a pelve fixa.', i: legCurl.i, d: 'Controle a volta e mantenha a pelve apoiada.' },
    'calf and muscle bone': { f: 'Combo panturrilha + tibial.', m: 'Gastrocnêmio/sóleo e tibial anterior.', b: 'Trabalha flexão plantar (panturrilha) e dorsiflexão (tíbia), equilibrando o tornozelo.', i: 'Corredores e atletas; equilíbrio do tornozelo.', d: 'Amplitude total nas duas direções.' },
    'super middle chest flight': { f: 'Crucifixo para o peito (porção média).', m: pecFly.m, b: pecFly.b, i: pecFly.i, d: pecFly.d },
    'super pendulum squat': pendulumSquat,
    'super smooth pedaling': pedal,
    'horizontal leg press': legPress,
    'super vertlcal leg press': { f: 'Leg press vertical.', m: legPress.m, b: 'Empurrar a plataforma na vertical (acima do corpo), com a coluna apoiada e grande amplitude de quadril e joelho.', i: 'Intermediários e avançados; grande amplitude para glúteos e quadríceps.', d: 'Mantenha a lombar apoiada e não estenda totalmente os joelhos no topo.' },
    'lateral deltoids': lateralRaise,
    'shrug machine': shrug,
    'reverse hyperextension': { f: 'Hiperextensão reversa (glúteos/lombar).', m: 'Glúteos, isquiotibiais e eretores da espinha.', b: 'Tronco fixo e pernas em extensão de quadril, descarregando a lombar e focando glúteos e cadeia posterior.', i: 'Reabilitação lombar e fortalecimento de glúteos.', d: 'Eleve as pernas até a linha do tronco sem hiperestender; controle a descida.' },
    'surpe horizontal multi press': chestPress,
    'multifunctional dumbbell bench': benchAdj,
    'dumbbell bench': benchFree,

    /* ---------------- A9 Series ---------------- */
    'hack squat shoulder lift': { f: 'Combo hack squat + desenvolvimento de ombro.', m: 'Pernas (agachamento) e ombros (empurrar).', b: 'Estação que combina agachamento guiado e elevação de ombros.', i: 'Academias que querem perna e ombro em um aparelho.', d: 'Ajuste os apoios ao trocar de exercício.' },

    /* ---------------- P Series ---------------- */
    'dip chin assist': pullupAssist,
    'rotary torso': obliques,
    'abdominal machine': abs,
    'thigh outer trainer': abdution,
    'thigh inner trainer': adduction,
    'standing leg exercise': glute,
    'trident stretch': { f: 'Estação de alongamento/mobilidade.', m: 'Cadeia muscular geral.', b: 'Apoios para alongar grandes grupos musculares, melhorando flexibilidade e recuperação.', i: 'Todos os níveis; aquecimento e recuperação.', d: 'Alongue sem dor, segurando cada posição por 20–30s.' },
    'back extension': backExt,
    'vertical row': row,
    'inner outer': innerOuter,
    'hip thruster': hipThrust,
    'multifunctional trainer': functional,
    'adjustable decline bench': declineBench,
    'decline bench': declineBench,
    'olympic bench incline': { f: 'Banco olímpico inclinado (peito superior).', m: 'Peitoral superior, deltoide anterior e tríceps.', b: 'Supino inclinado com barra olímpica, focando a porção clavicular do peito.', i: olympicBench.i, d: 'Inclinação de ~30–45°; desça a barra até a parte alta do peito.' },
    'olympic bench': olympicBench,
    'olympic bench flat': olympicBench,
    'seated preacher curl': preacher,
    'vertical knee up dip': { f: 'Torre: elevação de pernas + paralela.', m: 'Reto abdominal e tríceps.', b: 'Elevação de joelhos (abdômen inferior) e mergulho (tríceps) numa torre vertical com peso corporal.', i: 'Todos os níveis; abdômen e tríceps com peso do corpo.', d: 'Eleve os joelhos sem balançar; no mergulho, não desça além do confortável.' },
    'knee up chin pull up': { f: 'Torre: elevação de joelhos + barra fixa.', m: 'Abdômen, latíssimo e bíceps.', b: 'Combina elevação de pernas (core) e barra fixa (costas) numa estação vertical.', i: 'Intermediários e avançados; core e costas com peso do corpo.', d: 'Evite balançar o corpo; puxe pelas costas na barra e enrole a pelve no abdômen.' },
    'power cage': rack,
    'olympic seated bench': { f: 'Banco olímpico de desenvolvimento (ombros).', m: 'Deltoides, trapézio e tríceps.', b: 'Banco com encosto vertical e suporte de barra para desenvolvimento de ombros sentado.', i: 'Intermediários e avançados no desenvolvimento com barra.', d: 'Apoie as costas e não hiperestenda a lombar ao empurrar.' },
    'incline rowing': row,
    'v squat': squatMachine,
    'stretching': { f: 'Estação de alongamento/mobilidade.', m: 'Cadeia muscular geral.', b: 'Apoios para alongar grandes grupos musculares, melhorando flexibilidade e recuperação.', i: 'Todos os níveis; aquecimento e recuperação.', d: 'Alongue sem dor, segurando cada posição por 20–30s.' },

    /* ---------------- L Series ---------------- */
    'assistance dip chin': pullupAssist,
    'abdoina crunch': abs,
    'calf extension': calf,
    'biceps triceps exercises': bicepsTriceps,
    'bench': benchFree,
    'utility bench': benchAdj,
    'olympic pushing bench': olympicBench,
    'downward push bench': declineBench,
    'level bench': benchFree,
    'bicep bench': preacher,
    'leg lift': { f: 'Elevação de pernas (abdômen inferior).', m: 'Reto abdominal inferior e flexores do quadril.', b: 'Elevação das pernas apoiado/suspenso, enfatizando a parte inferior do abdômen.', i: 'Todos os níveis; foco no abdômen inferior.', d: 'Enrole a pelve ao subir; evite arquear a lombar e balançar.' },
    'double dumbbell rack': storage,
    'olympic squat': rack,
    'shoulder bench': { f: 'Banco de desenvolvimento de ombros.', m: 'Deltoides, trapézio e tríceps.', b: 'Encosto vertical com suporte de barra para desenvolvimento de ombros.', i: 'Intermediários e avançados no desenvolvimento com barra.', d: 'Apoie a coluna no encosto e evite hiperestender a lombar.' },
    'handle the rack': storage,
    'barbell chip rack': storage,
    'barbell frame': rack,
    'reverse pedal machine': pedal,
    'sequential pedal': pedal,
    'smith': smith,
    'lat pulldown row': { f: 'Combo puxada alta + remada.', m: row.m, b: 'Une puxada vertical (largura) e remada horizontal (espessura) das costas.', i: 'Academias que querem costas completas em um aparelho.', d: 'Use a puxada para largura e a remada para espessura.' },
    'dumbbell rack 15 pairs': storage,
    'iso lateral bench press': { f: 'Supino isolateral.', m: chestPress.m, b: 'Empurrar com braços independentes, equilibrando os dois lados do peitoral.', i: 'Todos os níveis; corrige assimetria do peito.', d: 'Empurre os dois lados igualmente; controle a descida.' },
    'incline press': inclinePress,
    'lat pulldown back': latPull,
    'linear leg press': legPress,
    'single cable 4 multi station': multiStation,
    'dual cable 4 station': multiStation,
    'dual cable 4 multi station': multiStation,
    'split dual cable 4 multi station': multiStation,
    'single cable 5 multi station': multiStation,
    'dual cable 5 station': multiStation,
    'dual cable 5 multi station': multiStation,
    'split dual cable 5 multi station': multiStation,
    'single cable 8 multi station': multiStation,
    'dual cable 8 multi station': multiStation,

    /* ---------------- HY Series ---------------- */
    'abdominal bench': { f: 'Banco abdominal.', m: 'Reto abdominal e oblíquos.', b: 'Banco reto/declinado para flexão de tronco, intensificando o trabalho do abdômen.', i: 'Todos os níveis; ajuste o declive à intensidade desejada.', d: 'Enrole a coluna (não puxe o pescoço) e expire na contração.' },
    'standing stride squat trainer': { f: 'Agachamento/passada em pé guiado.', m: 'Quadríceps, glúteos e isquiotibiais.', b: 'Padrão de agachamento/afundo guiado, trabalhando pernas e estabilidade de quadril.', i: 'Todos os níveis; força e estabilidade de perna.', d: 'Tronco ereto; desça controlando e empurre pelos calcanhares.' },
    'calf trainer': calf,
    'seated calf trainer': { f: 'Panturrilha sentado.', m: calf.m, b: 'Flexão plantar sentado com joelhos flexionados, enfatizando o sóleo.', i: calf.i, d: 'Joelho flexionado foca o sóleo; amplitude total com pausa no topo.' },
    'standing squat pull up trainer': { f: 'Combo agachamento + barra fixa.', m: 'Pernas (agachar) e costas/bíceps (puxar).', b: 'Estação que une agachamento e barra fixa, cobrindo membros inferiores e superiores.', i: 'Todos os níveis; corpo inteiro em um aparelho.', d: 'Alterne empurrar (agachar) e puxar (barra) para um treino completo.' },
    'iso lateral wide pulldown': { f: 'Puxada aberta isolateral.', m: latPull.m, b: 'Puxada vertical com braços independentes e pegada ampla, ênfase na largura do dorsal.', i: 'Todos os níveis; corrige assimetria das costas.', d: 'Puxe os cotovelos para baixo; não jogue o tronco para trás.' },
    'iso lateral wide chest press': { f: 'Supino aberto isolateral.', m: chestPress.m, b: 'Empurrar com pegada ampla e braços independentes, ênfase na parte externa do peito.', i: 'Intermediários e avançados; corrige assimetria do peito.', d: 'Empurre simétrico; não desça além do confortável para o ombro.' },
    'front high back trainer': row,
    'leg press machine': legPress,
    'grip strengthener': { f: 'Fortalecedor de pegada/antebraço.', m: 'Flexores do antebraço e músculos da mão.', b: 'Fechamento/preensão contra resistência, fortalecendo a pegada e o antebraço.', i: 'Atletas de luta, escalada e levantamento; pegada forte.', d: 'Feche completamente e controle a abertura; carga leve a moderada.' },
    'pendulum squat rack': pendulumSquat,

    /* ---------------- SQ F Series ---------------- */
    'smith multi hip': { f: 'Smith combinado com estação de quadril.', m: 'Compostos de pernas e glúteos.', b: 'Une barra guiada (Smith) e estação de quadril, treinando pernas e glúteos numa estrutura.', i: 'Todos os níveis; pernas e glúteos em um equipamento.', d: 'Use as travas do Smith; ajuste a estação de quadril ao exercício.' },
    'multi function smith': smith,
    'functional trainer squat rack': { f: 'Estação de cabos combinada com rack.', m: 'Corpo inteiro.', b: 'Une polias funcionais e gaiola de agachamento — treino com cabos e pesos livres na mesma estrutura.', i: 'Todos os níveis; centro de treino completo.', d: 'Posicione os pinos de segurança ao usar a barra livre na gaiola.' },
    'multi hip squat rack': { f: 'Estação de quadril combinada com rack.', m: 'Glúteos, pernas e compostos de barra.', b: 'Estação de quadril (abdução/extensão) integrada à gaiola de agachamento.', i: 'Todos os níveis; glúteos e agachamento em um aparelho.', d: 'Ajuste o apoio do quadril e use as travas do rack.' },
    'comprehensive training device': multiStation,
    'adjustable fid bench press': benchAdj,
    'extension leg fitting': { f: 'Acessório de cadeira extensora.', m: legExt.m, b: 'Módulo de extensão de joelho acoplável; isolamento do quadríceps em cadeia aberta.', i: 'Complemento para racks/estações compatíveis.', d: 'Fixe bem o módulo antes de usar; alinhe o joelho ao eixo.' },
    'smith weightlifting platform': { f: 'Smith com plataforma de levantamento.', m: 'Compostos de corpo inteiro.', b: 'Barra guiada sobre plataforma, segura para agachamento, supino e levantamentos.', i: 'Todos os níveis; treino guiado com base estável.', d: 'Use as travas e mantenha os pés bem posicionados na plataforma.' },
    'fold back wall mount rack': { f: 'Rack de parede dobrável.', m: '—', b: 'Suporte de barra fixado à parede que recolhe quando não usado — economiza espaço para agachamento e supino.', i: 'Espaços pequenos (home/box) que precisam liberar área.', d: 'Confira a fixação na parede e abra/feche com a estrutura sem carga.' },
    'adjustable flat bench': benchAdj,
    'adjustable crunch bench': { f: 'Banco abdominal ajustável.', m: 'Reto abdominal e oblíquos.', b: 'Banco com inclinação regulável para flexão de tronco com intensidade variável.', i: 'Todos os níveis; intensidade ajustável.', d: 'Mais declive = mais difícil; enrole a coluna sem puxar o pescoço.' },
    'lateral shoulder press': shoulderPress,
    'single station': multiStation,
    'upward functional': functional,
    'high pull optional seats': { f: 'Puxada alta (com assentos opcionais).', m: latPull.m, b: latPull.b, i: latPull.i, d: latPull.d },
    'pedal optional': pedal,
    'back pedaling component': pedal,
    'seated leg extension unit': legExt,
    'push ups': { f: 'Estação/apoio para flexões de braço.', m: 'Peitoral, tríceps, deltoide anterior e core.', b: 'Empurrar com peso corporal (flexão), trabalhando peito, tríceps e estabilização do tronco.', i: 'Todos os níveis; treino funcional com peso do corpo.', d: 'Mantenha o corpo alinhado (prancha) e desça o peito controlando.' },
    'sit ups': abs,
    'bridge hip trainer': hipThrust,
    'multi functional bench': benchAdj,
    'horizontal rowing trainer': row,
    'wall squat rack': rack,
    'pendulum trainer': pendulumSquat,
    'hook kick trainer': glute,
    'wall type double arm trainer': { f: 'Estação de cabos de parede (dois braços).', m: 'Corpo inteiro conforme o exercício.', b: 'Polias fixadas à parede para puxar/empurrar em vários ângulos, economizando espaço.', i: 'Espaços pequenos; treino funcional com cabos.', d: 'Ajuste a altura das polias ao exercício e mantenha o core firme.' },
    'dumbbell box': storage,
    'pull up and dip station': { f: 'Estação de barra fixa e paralela.', m: 'Costas, bíceps, peito e tríceps.', b: 'Barra fixa (puxar) e paralela (empurrar) com peso corporal numa estação compacta.', i: 'Todos os níveis; treino completo com peso do corpo.', d: 'Use amplitude total; se faltar força, combine com elástico de assistência.' },
    'flip tire machine': { f: 'Simulador de virar pneu (funcional/HIIT).', m: 'Corpo inteiro — cadeia posterior, pernas e core.', b: 'Levantar/empurrar repetidamente uma alavanca, replicando o “tire flip” para potência e condicionamento.', i: 'Intermediários e avançados; cross training e HIIT.', d: 'Use as pernas e o quadril para levantar, mantendo a lombar neutra.' },
    'multifunctional dumbbell stool': benchFree,
    '360 multifunctional': multiStation,

    /* ---------------- Pilates ---------------- */
    'pilates reformer oak wood': reformer,
    'cadillac bed oak wood': cadillac,
    'pilates ladder barrel oak wood': ladderBarrel,
    'pilates chair oak wood': pilatesChair,
    'pilates reformer maple': reformer,
    'reformer trapeze combination maple': { f: 'Reformer + Torre/Trapézio (combo).', m: 'Corpo inteiro, core e flexibilidade.', b: 'Une o carro deslizante do reformer e a torre de molas, multiplicando os exercícios de força e mobilidade.', i: reformer.i, d: reformer.d },
    'red oak pilates reformer maple': reformer,
    'rubber wood pilates reformer maple': reformer,
    'foldable reformer maple': { f: 'Reformer dobrável de Pilates.', m: reformer.m, b: 'Reformer que recolhe para guardar — mesma mecânica de molas e carro deslizante em formato compacto.', i: reformer.i, d: reformer.d },
    'pilates reformer oak': reformer,
    'reformer trapeze combination oak': { f: 'Reformer + Torre/Trapézio (combo).', m: 'Corpo inteiro, core e flexibilidade.', b: 'Une o reformer e a torre de molas, ampliando o repertório de exercícios.', i: reformer.i, d: reformer.d },
    'cadillac bed oak': cadillac,
    'cadillac bed maple': cadillac,
    'full track pilates reformer oak': reformer,
    'aluminum alloy pilates reformer': { f: 'Reformer de Pilates (alumínio).', m: reformer.m, b: reformer.b, i: reformer.i, d: reformer.d },
    'aluminum alloy foldable': { f: 'Reformer dobrável (alumínio).', m: reformer.m, b: 'Reformer em alumínio que recolhe para guardar, com molas reguláveis e carro deslizante.', i: reformer.i, d: reformer.d },
    'luminum alloy reformer with tower': { f: 'Reformer com torre (alumínio).', m: 'Corpo inteiro, core e flexibilidade.', b: 'Reformer integrado a torre de molas, combinando exercícios de carro deslizante e de resistência vertical.', i: reformer.i, d: reformer.d },
    'pilates chair maple': pilatesChair,
    'ladder barrel maple': ladderBarrel,
    'wall spring board': { f: 'Quadro de molas de parede (Wall Unit).', m: 'Corpo inteiro e core.', b: 'Molas fixas à parede para exercícios de resistência e mobilidade em pé ou deitado.', i: 'Todos os níveis; economiza espaço no estúdio.', d: 'Selecione a altura e a tensão das molas conforme o exercício.' },
    'aluminum reformer': { f: 'Reformer de Pilates (alumínio).', m: reformer.m, b: reformer.b, i: reformer.i, d: reformer.d },
    'wood reformer oak': reformer,
    'foldable reformer oak': { f: 'Reformer dobrável de Pilates.', m: reformer.m, b: 'Reformer que recolhe para guardar, com molas reguláveis e carro deslizante.', i: reformer.i, d: reformer.d },
    'a super reformer a': reformer,
    'b super reformer b': reformer,
    'super reformer': reformer,
    'two way sliding ladder maple wood': ladderBarrel,
    'foldable pilates reformer oak wood': { f: 'Reformer dobrável de Pilates.', m: reformer.m, b: 'Reformer que recolhe para guardar, com molas reguláveis e carro deslizante.', i: reformer.i, d: reformer.d },
    'pilates spine corrector red oak': spineCorrector,
    'pilates chair red oak': pilatesChair,
    'pilates reformer red oak': reformer,
    'ladder barrel red oak': ladderBarrel,
    'cadillac bed red oak': cadillac,
    'smart reformer': { f: 'Reformer de Pilates inteligente.', m: reformer.m, b: 'Reformer com recursos eletrônicos de acompanhamento; mesma mecânica de molas e carro deslizante.', i: reformer.i, d: reformer.d },

    /* ---------------- Cardio ---------------- */
    'commercial treadmill': treadmill,
    'commercial treadmill led': treadmill,
    'commercial treadmill 21 5inch mirror': treadmill,
    'curved treadmill': curvedTread,
    'commercial treadmill mirror': treadmill,
    'home treadmill': treadmill,
    'pet curved treadmill': { f: 'Esteira curva para pets.', m: '—', b: 'Esteira sem motor para exercício de animais — movida pelo próprio passo do pet.', i: 'Pet shops, clínicas veterinárias e adestramento.', d: 'Supervisione o animal e introduza o uso de forma gradual.' },
    'elliptical machine': elliptical,
    'high end horizontal elliptical machine': { f: 'Elíptico horizontal (cardio de baixo impacto).', m: elliptical.m, b: elliptical.b, i: elliptical.i, d: elliptical.d },
    'upright bike': bike,
    'recumbent bike': recumbent,
    'air bike': airBike,
    'spining bike': spinning,
    'magnetic spinning bike': spinning,
    'stair climber': stair,
    'running climbing machine': { f: 'Simulador de corrida/subida.', m: 'Cardio; glúteos, quadríceps e panturrilhas.', b: 'Combina passada de corrida e subida de degraus para condicionamento aeróbico intenso.', i: 'Intermediários e avançados; cardio intenso.', d: 'Mantenha a postura ereta e evite apoiar o peso nos corrimãos.' },
    'air rowing machine': rowingCardio,
    'water rowing machine': { f: 'Remo ergômetro com resistência de água.', m: rowingCardio.m, b: 'Remada contra resistência de água em tanque, com sensação realista; cardio de corpo inteiro e baixo impacto.', i: rowingCardio.i, d: rowingCardio.d },
    'dragon boat': { f: 'Simulador de remo coletivo (dragon boat).', m: 'Costas, ombros, core e pernas.', b: 'Movimento de remada em grupo contra resistência, cardio de corpo inteiro com foco em tronco e braços.', i: 'Treinos coletivos e condicionamento de corpo inteiro.', d: 'Sincronize a remada com o grupo; puxe pelo tronco, não só pelos braços.' },
    'kayak ergometer': { f: 'Ergômetro de caiaque.', m: 'Core, ombros, costas e braços.', b: 'Remada alternada de caiaque contra resistência, enfatizando tronco, ombros e core.', i: 'Atletas de caiaque/canoagem e cardio de membros superiores.', d: 'Gire o tronco a cada remada; mantenha o core ativo.' },
    'ski machine': { f: 'Simulador de esqui (ski erg).', m: 'Dorsais, tríceps, core e pernas.', b: 'Puxada vertical dupla (movimento de bastões de esqui), cardio de corpo inteiro com ênfase em dorso e core.', i: 'Todos os níveis; cardio de corpo inteiro e baixo impacto.', d: 'Puxe usando o tronco e o core, não apenas os braços; flexione levemente os joelhos.' },
    'surfing machine': { f: 'Simulador de surfe (equilíbrio/core).', m: 'Core, pernas e estabilizadores.', b: 'Plataforma instável que replica o surfe, treinando equilíbrio, core e propriocepção.', i: 'Todos os níveis; equilíbrio, core e diversão.', d: 'Mantenha os joelhos flexionados e o core ativo para estabilizar a plataforma.' }
  };
})();
