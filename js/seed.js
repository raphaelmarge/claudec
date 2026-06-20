/* ============================================================
   Torque Fitness — dados de exemplo (substituídos pela planilha)
   Custos em US$ (config "Custo em dólar" ligada por padrão).
   ============================================================ */
window.TORQUE_SEED = {
  params: {
    cambio: 5.30,        // US$ -> R$
    frete: 9,            // %
    impostos: 18,        // % (impostos + markup operacional)
    margemPadrao: 40,    // %
    custoEmDolar: true,
    parcelasMax: 48,
    juros: 0,            // % a.m. (0 = sem juros)
    validade: 7,         // dias
    empresa: 'Torque Fitness'
  },
  products: [
    // ---- Racks & Power ----
    { codigo: 'TRX-X1',  nome: 'Power Rack X1',                 serie: 'Racks & Power',     custo: 1180, imagem: '' },
    { codigo: 'TRX-X1FT',nome: 'Power Rack X1 + Functional',    serie: 'Racks & Power',     custo: 1640, imagem: '' },
    { codigo: 'TRX-HR',  nome: 'Half Rack Pro',                 serie: 'Racks & Power',     custo: 940,  imagem: '' },
    { codigo: 'TRX-WMR', nome: 'Wall Mount Rack Folding',       serie: 'Racks & Power',     custo: 720,  imagem: '' },
    { codigo: 'TRX-SQT', nome: 'Squat Stand Independente',      serie: 'Racks & Power',     custo: 560,  imagem: '' },

    // ---- Functional Trainers ----
    { codigo: 'TFT-F35', nome: 'Functional Trainer F35',        serie: 'Functional Trainers', custo: 1980, imagem: '' },
    { codigo: 'TFT-F12', nome: 'Functional Trainer Compact F12',serie: 'Functional Trainers', custo: 1490, imagem: '' },
    { codigo: 'TFT-DAP', nome: 'Dual Adjustable Pulley',        serie: 'Functional Trainers', custo: 1720, imagem: '' },

    // ---- Cardio / Conditioning ----
    { codigo: 'TCD-TANK',nome: 'Tank M4 Push Sled',             serie: 'Conditioning',      custo: 1290, imagem: '' },
    { codigo: 'TCD-AB',  nome: 'Air Bike Pro',                  serie: 'Conditioning',      custo: 860,  imagem: '' },
    { codigo: 'TCD-RUN', nome: 'Curved Manual Treadmill',       serie: 'Conditioning',      custo: 2150, imagem: '' },
    { codigo: 'TCD-ROW', nome: 'Rower Magnético R7',            serie: 'Conditioning',      custo: 940,  imagem: '' },

    // ---- Benches ----
    { codigo: 'TBN-FID', nome: 'Banco FID Ajustável',           serie: 'Bancos',            custo: 380,  imagem: '' },
    { codigo: 'TBN-FLAT',nome: 'Banco Flat Comercial',          serie: 'Bancos',            custo: 210,  imagem: '' },
    { codigo: 'TBN-OLY', nome: 'Banco Supino Olímpico',         serie: 'Bancos',            custo: 520,  imagem: '' },

    // ---- Weights / Storage ----
    { codigo: 'TWS-BUMP',nome: 'Kit Anilhas Bumper 150kg',      serie: 'Pesos & Storage',   custo: 690,  imagem: '' },
    { codigo: 'TWS-BAR', nome: 'Barra Olímpica 20kg Power',     serie: 'Pesos & Storage',   custo: 240,  imagem: '' },
    { codigo: 'TWS-DB',  nome: 'Conjunto Halteres 5–30kg',      serie: 'Pesos & Storage',   custo: 1450, imagem: '' },
    { codigo: 'TWS-KB',  nome: 'Kit Kettlebells 8–32kg',        serie: 'Pesos & Storage',   custo: 560,  imagem: '' },
    { codigo: 'TWS-RACK',nome: 'Rack de Armazenamento 3 níveis',serie: 'Pesos & Storage',   custo: 410,  imagem: '' },

    // ---- Acessórios ----
    { codigo: 'TAC-MAT', nome: 'Piso Emborrachado (m²)',        serie: 'Acessórios',        custo: 28,   imagem: '' },
    { codigo: 'TAC-BAND',nome: 'Kit Bands de Resistência',      serie: 'Acessórios',        custo: 45,   imagem: '' },
    { codigo: 'TAC-BOX', nome: 'Plyo Box 3 em 1',               serie: 'Acessórios',        custo: 120,  imagem: '' },
    { codigo: 'TAC-WALL',nome: 'Wall Ball (par)',               serie: 'Acessórios',        custo: 70,   imagem: '' }
  ]
};
