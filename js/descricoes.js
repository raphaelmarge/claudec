/* ============================================================
   TORQUE FITNESS — Descritivos de função e biomecânica
   ------------------------------------------------------------
   Mapa: nome normalizado do aparelho -> { f, m, b }
     f = função  |  m = músculos  |  b = biomecânica
   A chave é o nome em minúsculas, sem acentos/pontuação
   (mesma normalização usada em site.js). Um descritivo cobre
   todas as variantes/séries que compartilham o mesmo nome.
   ============================================================ */
window.TORQUE_DESCRICOES = (function () {
  // atalhos para reaproveitar textos de movimentos idênticos
  const legPress = {
    f: 'Força e hipertrofia dos membros inferiores.',
    m: 'Quadríceps, glúteo máximo e isquiotibiais (auxiliar).',
    b: 'Cadeia cinética fechada: extensão simultânea de quadril e joelho contra a plataforma. A coluna apoiada reduz a carga axial sobre a lombar, permitindo grandes cargas com segurança.'
  };
  const hackSquat = {
    f: 'Agachamento guiado para quadríceps e glúteos.',
    m: 'Quadríceps, glúteo máximo e adutores.',
    b: 'Agachamento em trajetória guiada com apoio dorsal; a inclinação direciona a carga para os quadríceps reduzindo a exigência de equilíbrio do agachamento livre.'
  };
  const legExt = {
    f: 'Isolamento dos extensores do joelho.',
    m: 'Quadríceps (reto femoral e vastos).',
    b: 'Extensão de joelho em cadeia aberta, com o quadril fixo no banco isolando completamente o quadríceps.'
  };
  const legCurl = {
    f: 'Isolamento dos flexores do joelho.',
    m: 'Isquiotibiais (bíceps femoral, semitendíneo, semimembranáceo); panturrilha auxiliar.',
    b: 'Flexão de joelho em cadeia aberta; o apoio do quadril estabiliza a pelve e isola a musculatura posterior da coxa.'
  };
  const legCurlExt = {
    f: 'Combo: flexão e extensão de joelho no mesmo equipamento.',
    m: 'Quadríceps na extensão; isquiotibiais na flexão.',
    b: 'Permite treinar agonista e antagonista do joelho (frente e posterior da coxa) alternando o movimento em cadeia aberta.'
  };
  const chestPress = {
    f: 'Desenvolvimento de força e volume do peitoral.',
    m: 'Peitoral maior, deltoide anterior e tríceps.',
    b: 'Empurrar horizontal (adução horizontal do ombro + extensão do cotovelo); trajetória guiada protege o ombro e dispensa estabilização da carga.'
  };
  const inclinePress = {
    f: 'Ênfase na porção superior (clavicular) do peitoral.',
    m: 'Peitoral superior, deltoide anterior e tríceps.',
    b: 'Empurrar em plano inclinado; o ângulo recruta mais as fibras claviculares do peitoral e o deltoide anterior.'
  };
  const pecFly = {
    f: 'Isolamento do peitoral em adução horizontal.',
    m: 'Peitoral maior (esterno-costal); deltoide anterior auxiliar.',
    b: 'Adução horizontal dos ombros com cotovelos semi-fixos (crucifixo); isola o peitoral sem participação do tríceps.'
  };
  const shoulderPress = {
    f: 'Força e volume dos ombros.',
    m: 'Deltoides (anterior e medial), trapézio e tríceps.',
    b: 'Empurrar vertical acima da cabeça (flexão/abdução do ombro + extensão do cotovelo) em trajetória guiada.'
  };
  const lateralRaise = {
    f: 'Isolamento do deltoide lateral (largura do ombro).',
    m: 'Deltoide medial; supraespinhal auxiliar.',
    b: 'Abdução do ombro até a linha do ombro com o cotovelo fixo, isolando a cabeça lateral do deltoide.'
  };
  const deltMachine = {
    f: 'Isolamento dos deltoides laterais/posteriores.',
    m: 'Deltoide medial e posterior.',
    b: 'Abdução/extensão horizontal do ombro com apoio do tronco; trabalha o contorno e a parte posterior do ombro.'
  };
  const rearDelt = {
    f: 'Ênfase no deltoide posterior e costas altas.',
    m: 'Deltoide posterior, romboides e trapézio médio.',
    b: 'Abdução horizontal (movimento de “abrir”) curvado, recrutando a parte de trás do ombro e a musculatura escapular.'
  };
  const latPull = {
    f: 'Desenvolvimento da largura das costas.',
    m: 'Latíssimo do dorso, redondo maior, bíceps e romboides.',
    b: 'Adução e extensão do ombro puxando a barra para baixo; o apoio das coxas estabiliza o tronco e foca no dorsal.'
  };
  const row = {
    f: 'Desenvolvimento da espessura das costas.',
    m: 'Latíssimo, romboides, trapézio médio, deltoide posterior e bíceps.',
    b: 'Puxada horizontal (remada): retração escapular + extensão do ombro com o peito apoiado, isolando o dorso e poupando a lombar.'
  };
  const bicepsCurl = {
    f: 'Isolamento dos flexores do cotovelo.',
    m: 'Bíceps braquial, braquial e braquiorradial.',
    b: 'Flexão de cotovelo com o úmero apoiado, eliminando o balanço e isolando o bíceps.'
  };
  const tricepsExt = {
    f: 'Isolamento dos extensores do cotovelo.',
    m: 'Tríceps braquial (três cabeças).',
    b: 'Extensão de cotovelo contra resistência; a fixação do braço isola o tríceps.'
  };
  const calf = {
    f: 'Desenvolvimento da panturrilha.',
    m: 'Gastrocnêmio e sóleo.',
    b: 'Flexão plantar do tornozelo (elevar os calcanhares) contra carga, em pé ou sentado.'
  };
  const abdution = {
    f: 'Isolamento dos abdutores do quadril (parte externa).',
    m: 'Glúteo médio e mínimo, tensor da fáscia lata.',
    b: 'Abdução do quadril (afastar as coxas) sentado, isolando a região lateral do glúteo.'
  };
  const adduction = {
    f: 'Isolamento dos adutores (parte interna da coxa).',
    m: 'Adutores (magno, longo, curto), grácil e pectíneo.',
    b: 'Adução do quadril (juntar as coxas) sentado contra resistência.'
  };
  const innerOuter = {
    f: 'Trabalha parte interna e externa da coxa no mesmo aparelho.',
    m: 'Adutores (juntar) e glúteo médio/mínimo (afastar).',
    b: 'Adução e abdução do quadril sentado; um mesmo equipamento treina os dois grupos antagonistas.'
  };
  const glute = {
    f: 'Isolamento e fortalecimento dos glúteos.',
    m: 'Glúteo máximo; isquiotibiais auxiliares.',
    b: 'Extensão de quadril contra resistência (coice/empurrar para trás), com o tronco apoiado.'
  };
  const hipThrust = {
    f: 'Potência e hipertrofia de glúteos.',
    m: 'Glúteo máximo; isquiotibiais e quadríceps auxiliares.',
    b: 'Extensão de quadril com apoio das costas, levando a carga do quadril para cima — pico de tensão na contração do glúteo.'
  };
  const abs = {
    f: 'Fortalecimento da parede abdominal.',
    m: 'Reto abdominal; oblíquos auxiliares.',
    b: 'Flexão do tronco (aproximar costelas da pelve) contra resistência guiada.'
  };
  const obliques = {
    f: 'Trabalho da cintura/oblíquos e rotação do tronco.',
    m: 'Oblíquos interno e externo; reto abdominal.',
    b: 'Rotação da coluna torácica contra resistência, com a pelve estabilizada.'
  };
  const backExt = {
    f: 'Fortalecimento da lombar e cadeia posterior.',
    m: 'Eretores da espinha, glúteos e isquiotibiais.',
    b: 'Extensão do tronco (hiperextensão) a partir da flexão de quadril, fortalecendo a musculatura paravertebral.'
  };
  const pullupAssist = {
    f: 'Barra fixa/paralela assistida (progressão de força).',
    m: 'Latíssimo, bíceps, peitoral e tríceps (conforme o pegada).',
    b: 'Puxada/empurrada vertical com contrapeso que reduz a carga, permitindo executar barra e paralela com técnica até ganhar força.'
  };
  const dip = {
    f: 'Mergulho para peitoral inferior e tríceps.',
    m: 'Tríceps, peitoral inferior e deltoide anterior.',
    b: 'Flexão e extensão dos cotovelos sustentando o corpo nas paralelas; a inclinação do tronco direciona para peito ou tríceps.'
  };
  const preacher = {
    f: 'Rosca de bíceps com apoio (banco Scott).',
    m: 'Bíceps braquial e braquial.',
    b: 'Flexão de cotovelo com o braço totalmente apoiado no banco inclinado, eliminando trapaça e maximizando o pico do bíceps.'
  };
  const functional = {
    f: 'Estação de cabos para treino funcional e multiarticular.',
    m: 'Corpo inteiro, conforme o exercício escolhido.',
    b: 'Polias ajustáveis em altura permitem puxar/empurrar em qualquer ângulo e plano, treinando força, estabilidade e padrões funcionais.'
  };
  const multiStation = {
    f: 'Estação combinada para treinar vários grupos musculares.',
    m: 'Corpo inteiro (peito, costas, ombros, braços, pernas).',
    b: 'Reúne várias polias/estações num só equipamento, permitindo circuito completo — ideal para academias e espaços compartilhados.'
  };
  const smith = {
    f: 'Barra guiada (Smith) para agachamento, supino e remada.',
    m: 'Varia com o exercício; compostos de pernas, peito e costas.',
    b: 'A barra corre em trilhos verticais, restringindo a trajetória; aumenta a segurança e reduz a exigência de estabilização.'
  };
  const crossover = {
    f: 'Cruzamento de cabos (crossover) para peito e ombros.',
    m: 'Peitoral, deltoides e estabilizadores.',
    b: 'Adução horizontal contra cabos altos/baixos; a tensão constante e o ajuste de ângulo permitem isolar diferentes porções do peito.'
  };
  const benchFree = {
    f: 'Banco de apoio para exercícios com pesos livres.',
    m: '—',
    b: 'Estrutura de apoio (plano/inclinado/declinado) para supino, desenvolvimento e roscas com halteres e barra.'
  };
  const benchAdj = {
    f: 'Banco ajustável para pesos livres em vários ângulos.',
    m: '—',
    b: 'Encosto regulável (declinado a inclinado) que dá suporte a supinos, desenvolvimentos e roscas em diferentes planos.'
  };
  const olympicBench = {
    f: 'Banco olímpico com suporte de barra para supino.',
    m: '—',
    b: 'Banco com cavaletes para barra olímpica; permite supino reto/inclinado/declinado com pesos livres.'
  };
  const rack = {
    f: 'Estrutura de suporte/segurança para treino com barra.',
    m: '—',
    b: 'Suporta a barra olímpica em agachamentos, supinos e levantamentos, com pinos de segurança para treinar sem auxiliar.'
  };
  const storage = {
    f: 'Suporte de armazenamento (organização da sala).',
    m: '—',
    b: 'Acessório de organização — não é equipamento de exercício; mantém anilhas, barras, halteres ou kettlebells arrumados e acessíveis.'
  };
  const squatMachine = {
    f: 'Agachamento guiado para pernas e glúteos.',
    m: 'Quadríceps, glúteo máximo, adutores e isquiotibiais.',
    b: 'Agachamento em trajetória guiada com apoio de ombros/quadril, distribuindo a carga e poupando a coluna.'
  };
  const pendulumSquat = {
    f: 'Agachamento pendular para quadríceps e glúteos.',
    m: 'Quadríceps, glúteo máximo e adutores.',
    b: 'A plataforma descreve um arco pendular, mantendo tensão constante e respeitando a trajetória natural do agachamento.'
  };
  const beltSquat = {
    f: 'Agachamento com cinturão, sem carga na coluna.',
    m: 'Quadríceps, glúteos e isquiotibiais.',
    b: 'A carga é presa ao quadril por um cinturão, tirando a compressão da coluna — ideal para quem tem restrição lombar.'
  };
  const tibialis = {
    f: 'Fortalecimento da tíbia (dorsiflexores).',
    m: 'Tibial anterior.',
    b: 'Dorsiflexão do tornozelo (puxar a ponta do pé para cima) contra carga; previne canelite e equilibra a panturrilha.'
  };
  const shrug = {
    f: 'Encolhimento para trapézio superior.',
    m: 'Trapézio superior; levantador da escápula.',
    b: 'Elevação das escápulas (“encolher os ombros”) contra carga, isolando o trapézio.'
  };
  const bicepsTriceps = { f: 'Estação combinada de bíceps e tríceps.', m: 'Bíceps e braquial (rosca); tríceps (extensão).', b: 'Treina flexão (rosca) e extensão (tríceps) de cotovelo na mesma estação — braço completo.' };
  const tricepsPush = { f: 'Tríceps na polia (pushdown).', m: tricepsExt.m, b: 'Extensão de cotovelo empurrando o cabo para baixo, com os cotovelos junto ao corpo isolando o tríceps.' };
  const declineBench = { f: 'Banco declinado para supino (peito inferior).', m: 'Peitoral inferior, deltoide anterior e tríceps.', b: 'Apoio em declive para supino com pesos livres, enfatizando as fibras inferiores do peitoral.' };
  const reformer = { f: 'Reformer de Pilates.', m: 'Core, estabilizadores e corpo inteiro.', b: 'Carro deslizante sobre molas reguláveis: empurrar/puxar contra a resistência trabalha força, controle e alongamento com baixíssimo impacto.' };
  const cadillac = { f: 'Cadillac / Trapézio de Pilates.', m: 'Corpo inteiro, core e flexibilidade.', b: 'Cama com barras, molas e alças para centenas de exercícios de força, mobilidade e descompressão da coluna.' };
  const pilatesChair = { f: 'Cadeira de Pilates (Wunda Chair).', m: 'Core, glúteos, pernas e estabilizadores.', b: 'Pedal com molas para exercícios de empurrar e equilíbrio que desafiam força e controle em base reduzida.' };
  const ladderBarrel = { f: 'Ladder Barrel (barril com escada).', m: 'Core, coluna e flexibilidade.', b: 'Barril e escada para alongamento, extensão da coluna e fortalecimento do core.' };
  const spineCorrector = { f: 'Corretor de coluna (Spine Corrector).', m: 'Core e musculatura paravertebral.', b: 'Apoio curvo para mobilizar e alinhar a coluna, alongando e fortalecendo o core.' };
  const treadmill = { f: 'Esteira ergométrica (caminhada/corrida).', m: 'Cardiovascular; quadríceps, glúteos, isquiotibiais e panturrilhas.', b: 'Corrida/caminhada sobre esteira motorizada — condicionamento aeróbico e gasto calórico no padrão de marcha.' };
  const curvedTread = { f: 'Esteira curva sem motor.', m: 'Cardio; cadeia posterior e panturrilhas.', b: 'Sem motor: a lona se move pela ação do corredor, elevando o gasto energético e recrutando mais a cadeia posterior.' };
  const elliptical = { f: 'Elíptico (cardio de baixo impacto).', m: 'Cardio; pernas, glúteos e braços.', b: 'Passada elíptica fluida sem impacto articular, movimentando membros superiores e inferiores ao mesmo tempo.' };
  const bike = { f: 'Bicicleta ergométrica (cardio).', m: 'Cardio; quadríceps, glúteos e panturrilhas.', b: 'Pedalada com carga ajustável — condicionamento aeróbico de baixo impacto para os membros inferiores.' };
  const recumbent = { f: 'Bicicleta horizontal (recumbent).', m: 'Cardio; quadríceps, glúteos e isquiotibiais.', b: 'Pedalada com encosto reclinado e apoio lombar — ideal para reabilitação e baixo impacto na coluna.' };
  const airBike = { f: 'Air bike (bike de ar).', m: 'Cardio de corpo inteiro.', b: 'Resistência por ventoinha que cresce com o esforço; braços e pernas trabalham juntos — excelente para HIIT.' };
  const spinning = { f: 'Bike de spinning.', m: 'Cardio; pernas e glúteos.', b: 'Roda inercial com carga ajustável para treinos intervalados, em pé ou sentado.' };
  const stair = { f: 'Simulador de subir escadas (stair climber).', m: 'Cardio; glúteos, quadríceps e panturrilhas.', b: 'Subida contínua de degraus — alto gasto calórico e forte recrutamento de glúteos e pernas.' };
  const rowingCardio = { f: 'Remo ergômetro (cardio de corpo inteiro).', m: 'Costas, pernas, core e braços.', b: 'Ciclo de remada — empurrar com as pernas, puxar com tronco e braços — contra resistência de ar/água; cardio completo e de baixo impacto.' };
  const pedal = { f: 'Componente/pedal de cardio.', m: 'Cardio; membros inferiores.', b: 'Movimento de pedalada de baixo impacto para condicionamento e reabilitação.' };

  return {
    /* ---------------- HM Series ---------------- */
    'prone leg curl': { f: 'Mesa flexora (decúbito ventral).', m: legCurl.m, b: 'Flexão de joelho deitado de bruços; a posição prona estabiliza o quadril e isola os isquiotibiais.' },
    'leg extension': legExt,
    'leg press': legPress,
    'pectoral fly': pecFly,
    'lateral raise': lateralRaise,
    'shoulder press': shoulderPress,
    'pearl delt pec fly': { f: 'Combo crucifixo (peito) + voador inverso (ombro posterior).', m: 'Peitoral na adução; deltoide posterior e romboides na abertura.', b: 'Um movimento fecha à frente (peitoral) e o oposto abre atrás (deltoide posterior), treinando frente e costas do tronco superior.' },
    'chest press': chestPress,
    'pull up assistance exercise': pullupAssist,
    'lat pull down': latPull,
    'functional trainer': functional,
    'kneeling twist': { f: 'Rotação de tronco ajoelhado (oblíquos).', m: obliques.m, b: 'Rotação da coluna na posição ajoelhada contra cabo, enfatizando os oblíquos e o core anti-rotação.' },
    'abdominal crunch': abs,
    'standing calf raise': { f: 'Panturrilha em pé.', m: calf.m, b: 'Flexão plantar em pé com carga nos ombros; com o joelho estendido enfatiza o gastrocnêmio.' },
    'hip abduction': abdution,
    'adductor': adduction,
    'leg curl extension': legCurlExt,
    'glute exercise': glute,
    'seated dip': { f: 'Mergulho sentado (tríceps).', m: tricepsExt.m, b: 'Extensão de cotovelo empurrando para baixo com o tronco apoiado, isolando o tríceps com segurança.' },
    'biceps curl': bicepsCurl,
    'back muscle exercise': row,
    'low pull': { f: 'Remada baixa (puxada no cabo baixo).', m: row.m, b: 'Puxada horizontal a partir do cabo baixo, retraindo as escápulas — espessura das costas e trapézio médio.' },
    'seated row': row,
    'lat pulldown': latPull,
    'lat puldown low row': { f: 'Combo puxada alta + remada baixa.', m: row.m, b: 'Une a puxada vertical (largura) e a remada horizontal (espessura) num só equipamento, cobrindo todo o dorso.' },
    'adjustable chest press': { f: 'Supino em máquina com ângulo ajustável.', m: chestPress.m, b: 'Empurrar com encosto regulável (reto/inclinado), variando a ênfase entre peitoral médio e superior.' },
    'hip abduction adduction': innerOuter,
    'leg cuarl extension': legCurlExt,
    'biceps triceps extension': { f: 'Estação combinada de bíceps e tríceps.', m: 'Bíceps e braquial (flexão); tríceps (extensão).', b: 'Mesma estação treina flexão (rosca) e extensão (tríceps) de cotovelo — agonista e antagonista do braço.' },
    'back abdominal combo': { f: 'Combo lombar + abdômen.', m: 'Reto abdominal (flexão) e eretores da espinha (extensão).', b: 'Treina flexão do tronco (abdômen) e extensão (lombar), equilibrando o core anterior e posterior.' },
    'standing multi flight': { f: 'Estação de cabos em pé (multifuncional).', m: 'Corpo inteiro conforme o exercício.', b: 'Polias para puxar/empurrar em pé, treinando padrões funcionais e estabilização do core.' },
    'flat bench': benchFree,
    'multi purpose bench': benchAdj,
    'adjustable bench': benchAdj,
    'military bench': { f: 'Banco de desenvolvimento militar (ombros).', m: 'Deltoides, trapézio e tríceps.', b: 'Encosto vertical com suporte de barra para desenvolvimento de ombros sentado.' },
    'olympic decline bench': { f: 'Banco olímpico declinado (peito inferior).', m: 'Peitoral inferior, deltoide anterior e tríceps.', b: 'Supino em declive com barra olímpica, enfatizando as fibras inferiores do peitoral.' },
    'olympic incline bench': { f: 'Banco olímpico inclinado (peito superior).', m: 'Peitoral superior, deltoide anterior e tríceps.', b: 'Supino inclinado com barra olímpica, focando a porção clavicular do peito.' },
    'weight bench press': olympicBench,
    'multi functional bench press': { f: 'Banco multifuncional com suporte de barra.', m: '—', b: 'Banco ajustável com cavaletes para supino em vários ângulos e outros exercícios com pesos livres.' },
    'preacher curl': preacher,
    'roman chair': { f: 'Cadeira romana (lombar/glúteos).', m: backExt.m, b: backExt.b },
    'squat rack': rack,
    'dumbbell rack': storage,
    'sissy squat station': { f: 'Sissy squat (quadríceps/reto femoral).', m: 'Quadríceps, sobretudo o reto femoral.', b: 'Agachamento com o tronco inclinado para trás e joelhos à frente, alongando e isolando intensamente o quadríceps.' },
    'tibia dorsi flexion': tibialis,
    'kettlebell rack': storage,
    'commodity shelf': storage,
    'plate tree': storage,
    'barbell rack': storage,
    'degree leg press': legPress,
    'degree hack squat': hackSquat,
    'leg press hack squat': { f: 'Combo leg press + hack squat.', m: legPress.m, b: 'Equipamento 2 em 1: leg press (empurrar deitado) e hack squat (agachamento guiado), cobrindo pernas em dois padrões.' },
    'hip bomber': hipThrust,
    'super dorsy bar': { f: 'Barra para puxada/dorsais (largura das costas).', m: latPull.m, b: latPull.b },
    'multi functional smith': smith,
    'smith machine': smith,
    'smith squat rack': { f: 'Smith combinado com gaiola de agachamento.', m: 'Compostos de pernas, peito e costas.', b: 'Une a barra guiada do Smith e o rack livre, permitindo treino guiado e com pesos livres na mesma estrutura.' },
    'incline chest fly': { f: 'Crucifixo inclinado (peito superior).', m: 'Peitoral superior; deltoide anterior auxiliar.', b: 'Adução horizontal em plano inclinado, isolando a porção clavicular do peitoral.' },
    'v squat rack': squatMachine,
    '90 degree leg press': legPress,
    'hip thrust glute': hipThrust,
    'abdominal oblique crunch': obliques,
    'deadlift shrug': { f: 'Estação de levantamento terra/encolhimento.', m: 'Cadeia posterior (eretores, glúteos, isquiotibiais) e trapézio.', b: 'Trajetória guiada para terra e encolhimento, trabalhando cadeia posterior e trapézio com a coluna estabilizada.' },
    'arrow deadlift rack': { f: 'Plataforma/rack para levantamento terra.', m: 'Cadeia posterior completa.', b: 'Estrutura de apoio para terra com barra, com pegada e altura otimizadas para o padrão de extensão de quadril.' },
    'rowing back trainer': row,
    'iso lateral leg extension': { f: 'Cadeira extensora isolateral.', m: legExt.m, b: 'Extensão de joelho com braços independentes para cada perna, corrigindo assimetrias.' },
    'horizontal leg curl': { f: 'Mesa/cadeira flexora horizontal.', m: legCurl.m, b: legCurl.b },
    'triceps dip': { f: 'Paralela/mergulho para tríceps.', m: tricepsExt.m, b: dip.b },
    'iso lateral bench wide chest': { f: 'Supino isolateral pegada aberta.', m: chestPress.m, b: 'Empurrar com braços independentes e pegada ampla, enfatizando a parte externa do peitoral.' },
    'wide chest press': { f: 'Supino máquina pegada aberta.', m: chestPress.m, b: 'Pegada ampla aumenta o alongamento do peitoral e a amplitude de adução horizontal.' },
    'iso lateral horizontal press': { f: 'Supino horizontal isolateral.', m: chestPress.m, b: 'Empurrar horizontal com braços independentes (isolateral), equilibrando os dois lados.' },
    'rowing high back trainer': row,
    'iso lateral low row': { f: 'Remada baixa isolateral.', m: row.m, b: 'Remada com braços independentes, corrigindo assimetrias do dorso.' },
    'rowing front high back trainer': row,
    'power squat pro': squatMachine,
    'rhino belt squat': beltSquat,
    'rhino belt': beltSquat,
    'iso lateral chest back': { f: 'Combo peito/costas isolateral.', m: 'Peitoral (empurrar) e dorsais (puxar).', b: 'Estação isolateral que empurra (peito) e puxa (costas) com braços independentes.' },
    'side lift trainer': { f: 'Elevação lateral guiada (ombros).', m: lateralRaise.m, b: lateralRaise.b },
    'standing abductor': { f: 'Abdutor em pé (glúteo médio).', m: abdution.m, b: 'Abdução do quadril em pé contra resistência, com foco em glúteo médio e estabilidade pélvica.' },
    'standing hip abduction': { f: 'Abdução de quadril em pé.', m: abdution.m, b: 'Afastar a perna lateralmente em pé contra carga, isolando os abdutores do quadril.' },
    'standing hip thrust': { f: 'Elevação de quadril em pé (glúteos).', m: hipThrust.m, b: 'Extensão de quadril em pé contra resistência, com pico de contração do glúteo.' },
    'transfer kick': { f: 'Coice/extensão de quadril (glúteos).', m: glute.m, b: glute.b },
    'shoulder lift': { f: 'Desenvolvimento/elevação de ombros.', m: shoulderPress.m, b: shoulderPress.b },
    '3 multi station': multiStation,
    'seated shoulder press': shoulderPress,
    'inclined chest press': inclinePress,
    'wrist trainer': { f: 'Fortalecimento de punho/antebraço.', m: 'Flexores e extensores do antebraço.', b: 'Flexão/extensão e rotação do punho contra carga, fortalecendo antebraço e pegada.' },
    'torso rotation trainer': obliques,

    /* ---------------- K1 Series ---------------- */
    'sit stand chest clip': { f: 'Crucifixo/adução de peito (sentar e empurrar).', m: pecFly.m, b: pecFly.b },
    'sit stand sideways': { f: 'Trabalho lateral de tronco/ombros.', m: 'Deltoides, oblíquos e core.', b: 'Movimento lateral em pé/sentado contra cabo, recrutando ombros e estabilizadores do tronco.' },
    'bent over dumbbell raise': rearDelt,
    'stand push chest': { f: 'Empurrar peito em pé (cabo).', m: chestPress.m, b: 'Adução horizontal/empurrar em pé contra cabo, com o core estabilizando — padrão funcional de empurrar.' },
    'high low pull': { f: 'Puxada alta e baixa (costas completas).', m: row.m, b: 'Combina puxada vertical (largura) e horizontal (espessura) para todo o dorso.' },
    'rhino squat trainer': squatMachine,
    'stretch bend leg': legCurlExt,
    'bicep trainer': bicepsCurl,
    'super pullover': { f: 'Pullover máquina (dorsal e peitoral).', m: 'Latíssimo do dorso, peitoral e serrátil.', b: 'Adução do ombro em arco (do alto à frente do corpo), alongando e contraindo o dorsal e o peitoral.' },
    'lat pulldown triceps dip': { f: 'Combo puxada alta + mergulho de tríceps.', m: 'Latíssimo e bíceps (puxar); tríceps (empurrar).', b: 'Une puxada vertical para as costas e mergulho para o tríceps na mesma estação.' },
    'seated chest press': chestPress,
    'pendulum': pendulumSquat,
    'vertical curl': bicepsCurl,
    'super inclined press': inclinePress,
    'belt squat': beltSquat,
    'flat chest press traine': chestPress,
    'multifunctional bench press rack': { f: 'Rack multifuncional com banco de supino.', m: '—', b: 'Estrutura com banco e suportes para supino, agachamento e exercícios com barra livre.' },
    'separate integrated leg press': { f: 'Leg press com plataformas independentes.', m: legPress.m, b: 'Plataformas separadas para cada perna (isolateral), corrigindo assimetrias na extensão de quadril e joelho.' },
    '3d hip bridge': hipThrust,
    'horizontal lift': { f: 'Elevação/empurrada horizontal (tronco superior).', m: 'Peitoral, deltoides e tríceps.', b: 'Empurrar horizontal guiado, trabalhando o tronco superior com estabilidade.' },
    'calf tibialis trainer': { f: 'Combo panturrilha + tibial.', m: 'Gastrocnêmio/sóleo (flexão plantar) e tibial anterior (dorsiflexão).', b: 'Treina os dois lados do tornozelo — flexão plantar (panturrilha) e dorsiflexão (tíbia) — equilibrando a articulação.' },
    'upslope bird': rearDelt,
    'hack squat shoulder lif': { f: 'Combo hack squat + desenvolvimento de ombro.', m: 'Pernas (agachamento) e ombros (empurrar).', b: 'Estação que combina agachamento guiado e elevação de ombros.' },
    'hip ridge squat': { f: 'Combo ponte de quadril + agachamento.', m: 'Glúteos, quadríceps e isquiotibiais.', b: 'Une extensão de quadril (ponte/glúteo) e agachamento, cobrindo toda a musculatura de pernas e glúteos.' },
    'kneeling leg bend': { f: 'Flexora ajoelhada (isquiotibiais).', m: legCurl.m, b: 'Flexão de joelho de forma unilateral ajoelhado, isolando o isquiotibial com grande amplitude.' },
    'sitting shoulder lift': shoulderPress,
    'scissor shoulder lift': { f: 'Desenvolvimento de ombro com braços independentes.', m: shoulderPress.m, b: 'Empurrar vertical isolateral (movimento em “tesoura”), equilibrando os dois ombros.' },
    'stand push shoulders': { f: 'Desenvolvimento de ombros em pé.', m: shoulderPress.m, b: 'Empurrar vertical em pé contra cabo, com o core estabilizando.' },
    'double track row pull back': row,
    'smith row': { f: 'Remada na barra guiada (Smith).', m: row.m, b: 'Remada com a barra em trilhos, padronizando a trajetória e poupando estabilização.' },
    'tower chest push shoulder push': { f: 'Torre de empurrar peito e ombro.', m: 'Peitoral, deltoides e tríceps.', b: 'Estação que empurra na horizontal (peito) e na vertical (ombro).' },
    'triceps press down': { f: 'Tríceps na polia (pushdown).', m: tricepsExt.m, b: 'Extensão de cotovelo empurrando o cabo para baixo, com os cotovelos junto ao corpo isolando o tríceps.' },
    'scissors squat trainer': { f: 'Agachamento/avanço em tesoura.', m: 'Quadríceps, glúteos e isquiotibiais.', b: 'Padrão unilateral (afundo) guiado, trabalhando pernas e estabilidade de quadril.' },
    'inner outer thigh': innerOuter,
    'sitting stretch bend leg': legCurlExt,
    'pull up bar connector': { f: 'Acessório/conector de barra fixa.', m: '—', b: 'Componente estrutural que conecta barras fixas — peça de montagem, não de exercício.' },
    '4 multi station': multiStation,
    'adjustable crossover': crossover,
    '5 multi station': multiStation,
    '8 multi station': multiStation,

    /* ---------------- K3 Series ---------------- */
    'rear kick': glute,
    'seated calf': { f: 'Panturrilha sentado.', m: calf.m, b: 'Flexão plantar sentado com os joelhos flexionados, enfatizando o sóleo.' },
    'triceps press': { f: 'Tríceps máquina.', m: tricepsExt.m, b: 'Extensão de cotovelo guiada contra resistência, isolando o tríceps.' },
    'incline chest press': inclinePress,
    'pull down': latPull,
    'low row': { f: 'Remada baixa.', m: row.m, b: row.b },

    /* ---------------- K5 Series ---------------- */
    'seated chest fly': pecFly,
    'seated standing lateral raise': lateralRaise,
    'bicep curl': bicepsCurl,
    'hyper extension': backExt,
    'hack squat': hackSquat,
    'kneeling leg flexion': { f: 'Flexora ajoelhada.', m: legCurl.m, b: legCurl.b },
    'dual track row': row,
    'tricep pushdown': { f: 'Tríceps pulley.', m: tricepsExt.m, b: 'Extensão de cotovelo empurrando o cabo para baixo, cotovelos fixos isolando o tríceps.' },
    'seated leg extension curl combo': legCurlExt,

    /* ---------------- K6 Series ---------------- */
    'delt machine': deltMachine,
    'calf heel lift': calf,
    'outer thigh': abdution,
    'inner thigh': adduction,
    'leg curl': legCurl,
    'incline row': row,
    'high pull': { f: 'Puxada alta.', m: latPull.m, b: latPull.b },

    /* ---------------- K8 Series ---------------- */
    'seated leg extension': legExt,
    'kneeling twis': obliques,
    'seated leg curl': { f: 'Cadeira flexora sentado.', m: legCurl.m, b: 'Flexão de joelho sentado contra o apoio, isolando os isquiotibiais com a pelve fixa.' },

    /* ---------------- A7 Series ---------------- */
    'row high back': row,
    'low row pull back': row,
    'sitting row': row,
    'multi angle chest push': { f: 'Supino máquina com múltiplos ângulos.', m: chestPress.m, b: 'Empurrar guiado com ângulo regulável, variando a ênfase entre peito médio e superior.' },
    'rowing back': row,
    'straight arm compression': { f: 'Pulldown com braços estendidos (dorsal).', m: 'Latíssimo do dorso e redondo maior.', b: 'Adução do ombro com cotovelos estendidos, isolando o dorsal sem participação do bíceps.' },
    'high row pull back': row,
    'slide pull back trainer': row,
    'triceps compression': { f: 'Tríceps máquina.', m: tricepsExt.m, b: 'Extensão de cotovelo guiada, isolando o tríceps.' },
    'vertical rowing pull back': row,
    'rowing pull back': row,
    'dual function orbital row': row,
    'cross shoulder raises': { f: 'Elevações de ombro em cabo cruzado.', m: 'Deltoide medial e posterior.', b: 'Abdução/elevação contra cabos cruzados, trabalhando o contorno do ombro com tensão constante.' },
    'seated push': chestPress,
    'reclining bench': benchAdj,
    'horizontal press': chestPress,
    'bench press rack': olympicBench,
    'standing rowing pull back': row,
    'pec fly': pecFly,
    'reverse crunches': { f: 'Abdominal infra (reverse crunch).', m: 'Reto abdominal, porção inferior.', b: 'Flexão da pelve em direção ao tronco (elevar o quadril), enfatizando a parte inferior do abdômen.' },
    'flat chest press trainer': chestPress,
    'scissor push chest trainer': { f: 'Supino isolateral (movimento em tesoura).', m: chestPress.m, b: 'Empurrar com braços independentes, equilibrando os dois lados do peitoral.' },
    'biceps curl triceps': bicepsTriceps,
    '45 degree leg press': legPress,
    'separate leg press': { f: 'Leg press com plataformas independentes.', m: legPress.m, b: 'Plataformas separadas para cada perna (isolateral), corrigindo assimetrias.' },
    'combo leg press hack squat': { f: 'Combo leg press + hack squat.', m: legPress.m, b: 'Equipamento 2 em 1 para pernas: empurrar deitado (leg press) e agachar guiado (hack squat).' },
    'hack slide': hackSquat,
    '70 degree leg press': legPress,
    'huck squat': hackSquat,
    'swing squat': pendulumSquat,
    'lunge': { f: 'Avanço/afundo guiado (pernas unilateral).', m: 'Quadríceps, glúteo máximo e isquiotibiais.', b: 'Passada unilateral com flexão de joelho e quadril, treinando força e estabilidade de uma perna por vez.' },
    'bend forward and lift leg': { f: 'Inclinar e elevar a perna (cadeia posterior).', m: 'Glúteos, isquiotibiais e eretores da espinha.', b: 'Extensão de quadril com inclinação do tronco, recrutando toda a cadeia posterior.' },
    'smith row pull back': { f: 'Remada na barra guiada (Smith).', m: row.m, b: 'Remada com a barra em trilhos, padronizando a trajetória.' },
    'seated leg press machine': legPress,
    'seated leg press': legPress,
    'hip bridge': hipThrust,
    'standing pull up assistance exercise': pullupAssist,

    /* ---------------- A8 Series ---------------- */
    'rigo pull back': row,
    'scissor rowing pull back': row,
    'super french press': { f: 'Tríceps francês (extensão acima da cabeça).', m: tricepsExt.m, b: 'Extensão de cotovelo com os braços acima da cabeça, alongando bastante a cabeça longa do tríceps.' },
    'kneeling leg curl': { f: 'Flexora ajoelhada (isquiotibiais).', m: legCurl.m, b: legCurl.b },
    'curved leg': legCurl,
    'seared leg curline': { f: 'Cadeira flexora sentado.', m: legCurl.m, b: 'Flexão de joelho sentado, isolando os isquiotibiais com a pelve fixa.' },
    'calf and muscle bone': { f: 'Combo panturrilha + tibial.', m: 'Gastrocnêmio/sóleo e tibial anterior.', b: 'Trabalha flexão plantar (panturrilha) e dorsiflexão (tíbia), equilibrando o tornozelo.' },
    'super middle chest flight': { f: 'Crucifixo para o peito (porção média).', m: pecFly.m, b: pecFly.b },
    'super pendulum squat': pendulumSquat,
    'super smooth pedaling': pedal,
    'horizontal leg press': legPress,
    'super vertlcal leg press': { f: 'Leg press vertical.', m: legPress.m, b: 'Empurrar a plataforma na vertical (acima do corpo), com a coluna apoiada e grande amplitude de quadril e joelho.' },
    'lateral deltoids': lateralRaise,
    'shrug machine': shrug,
    'reverse hyperextension': { f: 'Hiperextensão reversa (glúteos/lombar).', m: 'Glúteos, isquiotibiais e eretores da espinha.', b: 'Tronco fixo e pernas em extensão de quadril, descarregando a lombar e focando glúteos e cadeia posterior.' },
    'surpe horizontal multi press': chestPress,
    'multifunctional dumbbell bench': benchAdj,
    'dumbbell bench': benchFree,

    /* ---------------- A9 Series ---------------- */
    'hack squat shoulder lift': { f: 'Combo hack squat + desenvolvimento de ombro.', m: 'Pernas (agachamento) e ombros (empurrar).', b: 'Estação que combina agachamento guiado e elevação de ombros.' },

    /* ---------------- P Series ---------------- */
    'dip chin assist': pullupAssist,
    'rotary torso': obliques,
    'abdominal machine': abs,
    'thigh outer trainer': abdution,
    'thigh inner trainer': adduction,
    'standing leg exercise': glute,
    'trident stretch': { f: 'Estação de alongamento/mobilidade.', m: 'Cadeia muscular geral.', b: 'Apoios para alongar grandes grupos musculares, melhorando flexibilidade e recuperação.' },
    'back extension': backExt,
    'vertical row': row,
    'inner outer': innerOuter,
    'hip thruster': hipThrust,
    'multifunctional trainer': functional,
    'adjustable decline bench': declineBench,
    'decline bench': declineBench,
    'olympic bench incline': { f: 'Banco olímpico inclinado (peito superior).', m: 'Peitoral superior, deltoide anterior e tríceps.', b: 'Supino inclinado com barra olímpica, focando a porção clavicular do peito.' },
    'olympic bench': olympicBench,
    'olympic bench flat': olympicBench,
    'seated preacher curl': preacher,
    'vertical knee up dip': { f: 'Torre: elevação de pernas + paralela.', m: 'Reto abdominal e tríceps.', b: 'Elevação de joelhos (abdômen inferior) e mergulho (tríceps) numa torre vertical com peso corporal.' },
    'knee up chin pull up': { f: 'Torre: elevação de joelhos + barra fixa.', m: 'Abdômen, latíssimo e bíceps.', b: 'Combina elevação de pernas (core) e barra fixa (costas) numa estação vertical.' },
    'power cage': rack,
    'olympic seated bench': { f: 'Banco olímpico de desenvolvimento (ombros).', m: 'Deltoides, trapézio e tríceps.', b: 'Banco com encosto vertical e suporte de barra para desenvolvimento de ombros sentado.' },
    'incline rowing': row,
    'v squat': squatMachine,
    'stretching': { f: 'Estação de alongamento/mobilidade.', m: 'Cadeia muscular geral.', b: 'Apoios para alongar grandes grupos musculares, melhorando flexibilidade e recuperação.' },

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
    'leg lift': { f: 'Elevação de pernas (abdômen inferior).', m: 'Reto abdominal inferior e flexores do quadril.', b: 'Elevação das pernas apoiado/suspenso, enfatizando a parte inferior do abdômen.' },
    'double dumbbell rack': storage,
    'olympic squat': rack,
    'shoulder bench': { f: 'Banco de desenvolvimento de ombros.', m: 'Deltoides, trapézio e tríceps.', b: 'Encosto vertical com suporte de barra para desenvolvimento de ombros.' },
    'handle the rack': storage,
    'barbell chip rack': storage,
    'barbell frame': rack,
    'reverse pedal machine': pedal,
    'sequential pedal': pedal,
    'smith': smith,
    'lat pulldown row': { f: 'Combo puxada alta + remada.', m: row.m, b: 'Une puxada vertical (largura) e remada horizontal (espessura) das costas.' },
    'dumbbell rack 15 pairs': storage,
    'iso lateral bench press': { f: 'Supino isolateral.', m: chestPress.m, b: 'Empurrar com braços independentes, equilibrando os dois lados do peitoral.' },
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
    'abdominal bench': { f: 'Banco abdominal.', m: 'Reto abdominal e oblíquos.', b: 'Banco reto/declinado para flexão de tronco, intensificando o trabalho do abdômen.' },
    'standing stride squat trainer': { f: 'Agachamento/passada em pé guiado.', m: 'Quadríceps, glúteos e isquiotibiais.', b: 'Padrão de agachamento/afundo guiado, trabalhando pernas e estabilidade de quadril.' },
    'calf trainer': calf,
    'seated calf trainer': { f: 'Panturrilha sentado.', m: calf.m, b: 'Flexão plantar sentado com joelhos flexionados, enfatizando o sóleo.' },
    'standing squat pull up trainer': { f: 'Combo agachamento + barra fixa.', m: 'Pernas (agachar) e costas/bíceps (puxar).', b: 'Estação que une agachamento e barra fixa, cobrindo membros inferiores e superiores.' },
    'iso lateral wide pulldown': { f: 'Puxada aberta isolateral.', m: latPull.m, b: 'Puxada vertical com braços independentes e pegada ampla, ênfase na largura do dorsal.' },
    'iso lateral wide chest press': { f: 'Supino aberto isolateral.', m: chestPress.m, b: 'Empurrar com pegada ampla e braços independentes, ênfase na parte externa do peito.' },
    'front high back trainer': row,
    'leg press machine': legPress,
    'grip strengthener': { f: 'Fortalecedor de pegada/antebraço.', m: 'Flexores do antebraço e músculos da mão.', b: 'Fechamento/preensão contra resistência, fortalecendo a pegada e o antebraço.' },
    'pendulum squat rack': pendulumSquat,

    /* ---------------- SQ F Series ---------------- */
    'smith multi hip': { f: 'Smith combinado com estação de quadril.', m: 'Compostos de pernas e glúteos.', b: 'Une barra guiada (Smith) e estação de quadril, treinando pernas e glúteos numa estrutura.' },
    'multi function smith': smith,
    'functional trainer squat rack': { f: 'Estação de cabos combinada com rack.', m: 'Corpo inteiro.', b: 'Une polias funcionais e gaiola de agachamento — treino com cabos e pesos livres na mesma estrutura.' },
    'multi hip squat rack': { f: 'Estação de quadril combinada com rack.', m: 'Glúteos, pernas e compostos de barra.', b: 'Estação de quadril (abdução/extensão) integrada à gaiola de agachamento.' },
    'comprehensive training device': multiStation,
    'adjustable fid bench press': benchAdj,
    'extension leg fitting': { f: 'Acessório de cadeira extensora.', m: legExt.m, b: 'Módulo de extensão de joelho acoplável; isolamento do quadríceps em cadeia aberta.' },
    'smith weightlifting platform': { f: 'Smith com plataforma de levantamento.', m: 'Compostos de corpo inteiro.', b: 'Barra guiada sobre plataforma, segura para agachamento, supino e levantamentos.' },
    'fold back wall mount rack': { f: 'Rack de parede dobrável.', m: '—', b: 'Suporte de barra fixado à parede que recolhe quando não usado — economiza espaço para agachamento e supino.' },
    'adjustable flat bench': benchAdj,
    'adjustable crunch bench': { f: 'Banco abdominal ajustável.', m: 'Reto abdominal e oblíquos.', b: 'Banco com inclinação regulável para flexão de tronco com intensidade variável.' },
    'lateral shoulder press': shoulderPress,
    'single station': multiStation,
    'upward functional': functional,
    'high pull optional seats': { f: 'Puxada alta (com assentos opcionais).', m: latPull.m, b: latPull.b },
    'pedal optional': pedal,
    'back pedaling component': pedal,
    'seated leg extension unit': legExt,
    'push ups': { f: 'Estação/apoio para flexões de braço.', m: 'Peitoral, tríceps, deltoide anterior e core.', b: 'Empurrar com peso corporal (flexão), trabalhando peito, tríceps e estabilização do tronco.' },
    'sit ups': abs,
    'bridge hip trainer': hipThrust,
    'multi functional bench': benchAdj,
    'horizontal rowing trainer': row,
    'wall squat rack': rack,
    'pendulum trainer': pendulumSquat,
    'hook kick trainer': glute,
    'wall type double arm trainer': { f: 'Estação de cabos de parede (dois braços).', m: 'Corpo inteiro conforme o exercício.', b: 'Polias fixadas à parede para puxar/empurrar em vários ângulos, economizando espaço.' },
    'dumbbell box': storage,
    'pull up and dip station': { f: 'Estação de barra fixa e paralela.', m: 'Costas, bíceps, peito e tríceps.', b: 'Barra fixa (puxar) e paralela (empurrar) com peso corporal numa estação compacta.' },
    'flip tire machine': { f: 'Simulador de virar pneu (funcional/HIIT).', m: 'Corpo inteiro — cadeia posterior, pernas e core.', b: 'Levantar/empurrar repetidamente uma alavanca, replicando o “tire flip” para potência e condicionamento.' },
    'multifunctional dumbbell stool': benchFree,
    '360 multifunctional': multiStation,

    /* ---------------- Pilates ---------------- */
    'pilates reformer oak wood': reformer,
    'cadillac bed oak wood': cadillac,
    'pilates ladder barrel oak wood': ladderBarrel,
    'pilates chair oak wood': pilatesChair,
    'pilates reformer maple': reformer,
    'reformer trapeze combination maple': { f: 'Reformer + Torre/Trapézio (combo).', m: 'Corpo inteiro, core e flexibilidade.', b: 'Une o carro deslizante do reformer e a torre de molas, multiplicando os exercícios de força e mobilidade.' },
    'red oak pilates reformer maple': reformer,
    'rubber wood pilates reformer maple': reformer,
    'foldable reformer maple': { f: 'Reformer dobrável de Pilates.', m: reformer.m, b: 'Reformer que recolhe para guardar — mesma mecânica de molas e carro deslizante em formato compacto.' },
    'pilates reformer oak': reformer,
    'reformer trapeze combination oak': { f: 'Reformer + Torre/Trapézio (combo).', m: 'Corpo inteiro, core e flexibilidade.', b: 'Une o reformer e a torre de molas, ampliando o repertório de exercícios.' },
    'cadillac bed oak': cadillac,
    'cadillac bed maple': cadillac,
    'full track pilates reformer oak': reformer,
    'aluminum alloy pilates reformer': { f: 'Reformer de Pilates (alumínio).', m: reformer.m, b: reformer.b },
    'aluminum alloy foldable': { f: 'Reformer dobrável (alumínio).', m: reformer.m, b: 'Reformer em alumínio que recolhe para guardar, com molas reguláveis e carro deslizante.' },
    'luminum alloy reformer with tower': { f: 'Reformer com torre (alumínio).', m: 'Corpo inteiro, core e flexibilidade.', b: 'Reformer integrado a torre de molas, combinando exercícios de carro deslizante e de resistência vertical.' },
    'pilates chair maple': pilatesChair,
    'ladder barrel maple': ladderBarrel,
    'wall spring board': { f: 'Quadro de molas de parede (Wall Unit).', m: 'Corpo inteiro e core.', b: 'Molas fixas à parede para exercícios de resistência e mobilidade em pé ou deitado.' },
    'aluminum reformer': { f: 'Reformer de Pilates (alumínio).', m: reformer.m, b: reformer.b },
    'wood reformer oak': reformer,
    'foldable reformer oak': { f: 'Reformer dobrável de Pilates.', m: reformer.m, b: 'Reformer que recolhe para guardar, com molas reguláveis e carro deslizante.' },
    'a super reformer a': reformer,
    'b super reformer b': reformer,
    'super reformer': reformer,
    'two way sliding ladder maple wood': ladderBarrel,
    'foldable pilates reformer oak wood': { f: 'Reformer dobrável de Pilates.', m: reformer.m, b: 'Reformer que recolhe para guardar, com molas reguláveis e carro deslizante.' },
    'pilates spine corrector red oak': spineCorrector,
    'pilates chair red oak': pilatesChair,
    'pilates reformer red oak': reformer,
    'ladder barrel red oak': ladderBarrel,
    'cadillac bed red oak': cadillac,
    'smart reformer': { f: 'Reformer de Pilates inteligente.', m: reformer.m, b: 'Reformer com recursos eletrônicos de acompanhamento; mesma mecânica de molas e carro deslizante.' },

    /* ---------------- Cardio ---------------- */
    'commercial treadmill': treadmill,
    'commercial treadmill led': treadmill,
    'commercial treadmill 21 5inch mirror': treadmill,
    'curved treadmill': curvedTread,
    'commercial treadmill mirror': treadmill,
    'home treadmill': treadmill,
    'pet curved treadmill': { f: 'Esteira curva para pets.', m: '—', b: 'Esteira sem motor para exercício de animais — movida pelo próprio passo do pet.' },
    'elliptical machine': elliptical,
    'high end horizontal elliptical machine': { f: 'Elíptico horizontal (cardio de baixo impacto).', m: elliptical.m, b: elliptical.b },
    'upright bike': bike,
    'recumbent bike': recumbent,
    'air bike': airBike,
    'spining bike': spinning,
    'magnetic spinning bike': spinning,
    'stair climber': stair,
    'running climbing machine': { f: 'Simulador de corrida/subida.', m: 'Cardio; glúteos, quadríceps e panturrilhas.', b: 'Combina passada de corrida e subida de degraus para condicionamento aeróbico intenso.' },
    'air rowing machine': rowingCardio,
    'water rowing machine': { f: 'Remo ergômetro com resistência de água.', m: rowingCardio.m, b: 'Remada contra resistência de água em tanque, com sensação realista; cardio de corpo inteiro e baixo impacto.' },
    'dragon boat': { f: 'Simulador de remo coletivo (dragon boat).', m: 'Costas, ombros, core e pernas.', b: 'Movimento de remada em grupo contra resistência, cardio de corpo inteiro com foco em tronco e braços.' },
    'kayak ergometer': { f: 'Ergômetro de caiaque.', m: 'Core, ombros, costas e braços.', b: 'Remada alternada de caiaque contra resistência, enfatizando tronco, ombros e core.' },
    'ski machine': { f: 'Simulador de esqui (ski erg).', m: 'Dorsais, tríceps, core e pernas.', b: 'Puxada vertical dupla (movimento de bastões de esqui), cardio de corpo inteiro com ênfase em dorso e core.' },
    'surfing machine': { f: 'Simulador de surfe (equilíbrio/core).', m: 'Core, pernas e estabilizadores.', b: 'Plataforma instável que replica o surfe, treinando equilíbrio, core e propriocepção.' }
  };
})();
