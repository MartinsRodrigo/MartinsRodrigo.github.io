/* IPAR-Eleitoral Hotsite Javascript Application */

// --- Global Application State ---
let municipiosData = [];
let estadosData = {};
let geojsonData = null;
let stateGeojsonCache = {};
let nationalAverages = { comp: 0, alist: 0, fil: 0, ipar: 0 };
let currentMunicipio = null;

// Min/Max boundaries for Radar Chart relative scaling
let bounds = {
    comp: { min: 100, max: 0 },
    alist: { min: 100, max: 0 },
    fil: { min: 100, max: 0 }
};

// IBGE State codes mapping
const ufCodes = {
    'RO': 11, 'AC': 12, 'AM': 13, 'RR': 14, 'PA': 15, 'AP': 16, 'TO': 17,
    'MA': 21, 'PI': 22, 'CE': 23, 'RN': 24, 'PB': 25, 'PE': 26, 'AL': 27, 'SE': 28, 'BA': 29,
    'MG': 31, 'ES': 32, 'RJ': 33, 'SP': 35,
    'PR': 41, 'SC': 42, 'RS': 43,
    'MS': 50, 'MT': 51, 'GO': 52, 'DF': 53
};

// Chart & Map instances
let radarChartInstance = null;
let scatterChartInstance = null;
let mapInstance = null;
let nationalLayer = null;
let stateLayer = null;
let mapMode = 'state'; // Start directly in 'state' view by default
let currentUf = null;

// DOM Elements
const searchInput = document.getElementById('municipio-search');
const clearSearchBtn = document.getElementById('clear-search');
const autocompleteList = document.getElementById('autocomplete-list');
const loadingOverlay = document.getElementById('loading-overlay');
const dashboardContent = document.getElementById('dashboard-content');
const btnBackToBrazil = document.getElementById('btn-back-to-brazil');
const scatterXVarSelect = document.getElementById('scatter-x-var');

// --- Helper: Normalize strings for search (remove accents) ---
function normalizeString(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// --- Helper: Format Numbers ---
function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// --- Initialize Application ---
async function initApp() {
    try {
        // Load JSON datasets in parallel
        const [muniRes, estRes, geoRes] = await Promise.all([
            fetch('data/municipios.json'),
            fetch('data/estados.json'),
            fetch('data/brazil_states_simplified.json')
        ]);
        
        municipiosData = await muniRes.json();
        estadosData = await estRes.json();
        geojsonData = await geoRes.json();
        
        // Post-process: Compute national averages, rankings, and min-max boundaries
        computeMetrics();
        
        // Hide loading spinner, show dashboard layout
        loadingOverlay.style.display = 'none';
        dashboardContent.style.opacity = '1';
        
        // Setup map & global charts
        initMap();
        initScatterPlot();
        
        // Select a default city to showcase (e.g. Tocantinópolis - TO)
        const defaultCity = municipiosData.find(m => m.nome === 'Tocantinópolis' && m.uf === 'TO') || municipiosData[0];
        
        // Force map mode to start in state view of default city
        mapMode = 'state';
        selectMunicipio(defaultCity);
        
        // Setup event listeners
        setupSearch();
        setupInteractiveControls();
        
    } catch (err) {
        console.error("Erro ao inicializar hotsite:", err);
        loadingOverlay.innerHTML = `<p style="color: var(--accent-rose)">Falha ao carregar dados. Por favor, verifique se os arquivos JSON foram gerados com sucesso.</p>`;
    }
}

// --- Compute Rankings, Averages and Bounds Dynamically ---
function computeMetrics() {
    let compSum = 0, alistSum = 0, filSum = 0, iparSum = 0;
    let countComp = 0, countAlist = 0, countFil = 0, countIpar = 0;
    
    // Calculate Averages and find boundaries
    municipiosData.forEach(m => {
        if (m.comp !== null) { 
            compSum += m.comp; countComp++; 
            if (m.comp < bounds.comp.min) bounds.comp.min = m.comp;
            if (m.comp > bounds.comp.max) bounds.comp.max = m.comp;
        }
        if (m.alist !== null) { 
            alistSum += m.alist; countAlist++; 
            if (m.alist < bounds.alist.min) bounds.alist.min = m.alist;
            if (m.alist > bounds.alist.max) bounds.alist.max = m.alist;
        }
        if (m.fil !== null) { 
            filSum += m.fil; countFil++; 
            if (m.fil < bounds.fil.min) bounds.fil.min = m.fil;
            if (m.fil > bounds.fil.max) bounds.fil.max = m.fil;
        }
        if (m.ipar !== null) { iparSum += m.ipar; countIpar++; }
    });
    
    nationalAverages.comp = compSum / countComp;
    nationalAverages.alist = alistSum / countAlist;
    nationalAverages.fil = filSum / countFil;
    nationalAverages.ipar = iparSum / countIpar;
    
    // Compute National Ranking (excluding nulls)
    const validNational = municipiosData
        .filter(m => m.ipar !== null)
        .sort((a, b) => b.ipar - a.ipar);
        
    validNational.forEach((m, idx) => {
        m.rankNational = idx + 1;
    });
    
    // Compute State Rankings
    const states = [...new Set(municipiosData.map(m => m.uf))];
    states.forEach(state => {
        const validState = municipiosData
            .filter(m => m.uf === state && m.ipar !== null)
            .sort((a, b) => b.ipar - a.ipar);
            
        validState.forEach((m, idx) => {
            m.rankState = idx + 1;
        });
    });
}

// --- Autocomplete & Search Logic ---
function setupSearch() {
    searchInput.addEventListener('input', () => {
        const query = normalizeString(searchInput.value.trim());
        if (query.length < 2) {
            autocompleteList.style.display = 'none';
            clearSearchBtn.style.display = 'none';
            return;
        }
        
        clearSearchBtn.style.display = 'block';
        
        // Filter matches (matches starting with query first, then containing it)
        const queryNorm = normalizeString(query);
        const matches = municipiosData.filter(m => {
            const muniNorm = normalizeString(m.nome);
            return muniNorm.includes(queryNorm) || normalizeString(m.uf).includes(queryNorm);
        }).sort((a, b) => {
            const aName = normalizeString(a.nome);
            const bName = normalizeString(b.nome);
            const aStart = aName.startsWith(queryNorm);
            const bStart = bName.startsWith(queryNorm);
            if (aStart && !bStart) return -1;
            if (!aStart && bStart) return 1;
            return aName.localeCompare(bName);
        }).slice(0, 10);
        
        renderSuggestions(matches);
    });
    
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        autocompleteList.style.display = 'none';
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
    });
    
    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !autocompleteList.contains(e.target)) {
            autocompleteList.style.display = 'none';
        }
    });
}

function renderSuggestions(matches) {
    if (matches.length === 0) {
        autocompleteList.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 0.85rem; text-align: center;">Nenhum município encontrado</div>`;
        autocompleteList.style.display = 'block';
        return;
    }
    
    autocompleteList.innerHTML = '';
    matches.forEach((m) => {
        const div = document.createElement('div');
        div.className = 'autocomplete-suggestion';
        div.innerHTML = `
            <span class="muni-name">${m.nome}</span>
            <span class="muni-uf">${m.uf}</span>
        `;
        div.addEventListener('click', () => {
            selectMunicipio(m);
            searchInput.value = '';
            autocompleteList.style.display = 'none';
            clearSearchBtn.style.display = 'none';
        });
        autocompleteList.appendChild(div);
    });
    
    autocompleteList.style.display = 'block';
}

function setupInteractiveControls() {
    // Back to Brazil / back to UF Map view toggler
    btnBackToBrazil.addEventListener('click', () => {
        if (mapMode === 'state') {
            showNationalMap();
        } else if (mapMode === 'brazil' && currentMunicipio) {
            loadStateMap(currentMunicipio.uf);
        }
    });
    
    // Scatter Plot X-axis change
    scatterXVarSelect.addEventListener('change', () => {
        updateScatterPlot();
    });
}

// --- Populate Dashboard Card with Selected Municipality ---
function selectMunicipio(m) {
    const isUfChanged = !currentMunicipio || currentMunicipio.uf !== m.uf;
    currentMunicipio = m;
    
    // 1. Text elements
    document.getElementById('municipio-nome').innerText = m.nome;
    document.getElementById('municipio-uf').innerText = m.uf;
    document.getElementById('municipio-regiao').innerText = `Região ${m.reg}`;
    document.getElementById('ipar-value').innerText = formatNumber(m.ipar, 1);
    
    // Total municipalities count in state and national
    const totalNational = municipiosData.filter(x => x.ipar !== null).length;
    const totalState = municipiosData.filter(x => x.uf === m.uf && x.ipar !== null).length;
    
    document.getElementById('rank-nacional').innerText = m.rankNational ? `#${m.rankNational} / ${totalNational}` : '--';
    document.getElementById('rank-estadual').innerText = m.rankState ? `#${m.rankState} / ${totalState}` : '--';
    
    document.getElementById('muni-pop').innerText = formatNumber(m.pop) + ' hab.';
    document.getElementById('muni-urb').innerText = formatNumber(m.urb, 1) + '%';
    document.getElementById('muni-porte').innerText = m.porte || 'Desconhecido';
    document.getElementById('muni-regic').innerText = m.regic || 'Outro';
    
    // Granular rating classification
    const ratingEl = document.getElementById('score-rating');
    ratingEl.className = 'rating-badge'; // reset
    if (m.ipar >= 65) {
        ratingEl.innerText = 'Muito Alto';
        ratingEl.classList.add('rating-very-high');
    } else if (m.ipar >= 52) {
        ratingEl.innerText = 'Alto';
        ratingEl.classList.add('rating-high');
    } else if (m.ipar >= 38) {
        ratingEl.innerText = 'Médio';
        ratingEl.classList.add('rating-medium');
    } else if (m.ipar >= 25) {
        ratingEl.innerText = 'Baixo';
        ratingEl.classList.add('rating-low');
    } else {
        ratingEl.innerText = 'Muito Baixo';
        ratingEl.classList.add('rating-very-low');
    }
    
    // 2. Score Ring SVG progress
    const ring = document.getElementById('score-ring-progress');
    const radius = ring.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const scoreVal = m.ipar !== null ? m.ipar : 0;
    const offset = circumference - (scoreVal / 100) * circumference;
    ring.style.strokeDashoffset = offset;
    
    // 3. Expected vs Real Bars (Regression Diagnostics)
    const expected = m.pred;
    const actual = m.ipar;
    const residual = m.res;
    
    document.getElementById('val-esperado').innerText = formatNumber(expected, 1);
    document.getElementById('val-real').innerText = formatNumber(actual, 1);
    
    const barExpected = document.getElementById('bar-esperado');
    const barReal = document.getElementById('bar-real');
    
    barExpected.style.width = expected ? `${Math.max(10, expected)}%` : '0%';
    barReal.style.width = actual ? `${Math.max(10, actual)}%` : '0%';
    
    // Residual description alert (using standard error prediction interval)
    // Multilevel model RSE is ~7.8. 
    // We treat residual within [-7.8, +7.8] as "Dentro do esperado" (within 1 Standard Error)
    const alertEl = document.getElementById('residual-alert');
    const alertTitle = document.getElementById('residual-title');
    const alertDesc = document.getElementById('residual-desc');
    const iconUp = document.getElementById('alert-icon-up');
    const iconDown = document.getElementById('alert-icon-down');
    
    alertEl.className = 'residual-alert'; // reset
    iconUp.style.display = 'none';
    iconDown.style.display = 'none';
    
    if (residual !== null) {
        const absRes = Math.abs(residual);
        const threshold = 7.8; // 1 standard deviation of residuals
        
        if (absRes <= threshold) {
            alertEl.classList.add('alert-neutral');
            alertTitle.innerText = 'Dentro do esperado';
            alertDesc.innerText = `O engajamento do município está dentro da faixa típica prevista pelo modelo. A variação de ${formatNumber(absRes, 1)} pontos não é estatisticamente significante.`;
        } else if (residual > threshold) {
            alertEl.classList.add('alert-positive');
            alertTitle.innerText = 'Engajamento acima do esperado';
            alertDesc.innerText = `O município participa ${formatNumber(absRes, 1)} pontos ACIMA do esperado pelo modelo para suas características sócio-demográficas.`;
            iconUp.style.display = 'block';
        } else {
            alertEl.classList.add('alert-negative');
            alertTitle.innerText = 'Engajamento abaixo do esperado';
            alertDesc.innerText = `O município participa ${formatNumber(absRes, 1)} pontos ABAIXO do esperado pelo modelo para suas características sócio-demográficas.`;
            iconDown.style.display = 'block';
        }
        alertEl.style.display = 'flex';
    } else {
        alertEl.style.display = 'none';
    }
    
    // 4. FIRJAN metrics
    document.getElementById('ifdm-e').innerText = formatNumber(m.ifdm_e, 3);
    document.getElementById('ifdm-s').innerText = formatNumber(m.ifdm_s, 3);
    document.getElementById('ifdm-emp').innerText = formatNumber(m.ifdm_emp, 3);
    
    // 5. Update Visualizations
    updateRadarChart();
    updateScatterPlot();
    
    // 6. Update Map View
    if (mapMode === 'state') {
        if (isUfChanged) {
            // Load state map of the newly selected city
            loadStateMap(m.uf);
            // Re-render layer to highlight newly selected city
            if (stateLayer) stateLayer.setStyle(styleMuniFeature);
            // Update map legend selected city chip
            const selectedNameEl = document.getElementById('legend-selected-name');
            if (selectedNameEl) selectedNameEl.innerText = `(${m.nome})`;
        }
    } else {
        // We are in 'brazil' view, update the toggle button to say "Ver [UF]"
        btnBackToBrazil.style.display = 'block';
        btnBackToBrazil.innerText = `Ver ${m.uf}`;
    }
}

// Helper styling function to draw municipalities and highlight the selected one
function styleMuniFeature(feature) {
    const muniId = parseInt(feature.properties.id);
    const muniInfo = municipiosData.find(x => x.id === muniId);
    const score = muniInfo ? muniInfo.ipar : null;
    const isSelected = currentMunicipio && currentMunicipio.id === muniId;
    
    return {
        fillColor: isSelected ? '#eab308' : getMapColor(score, true),
        weight: isSelected ? 2.5 : 1,
        opacity: 1,
        color: isSelected ? '#fff' : 'rgba(34, 34, 60, 0.1)',
        fillOpacity: isSelected ? 0.95 : 0.7
    };
}

// --- Initialize and Update Radar Chart (Min-Max scaled with raw values on tooltip) ---
function updateRadarChart() {
    const m = currentMunicipio;
    if (!m) return;
    
    // Min-Max Normalization: (V - min) / (max - min) * 100
    const normalize = (v, type) => {
        if (v === null || v === undefined) return 0;
        const b = bounds[type];
        return ((v - b.min) / (b.max - b.min)) * 100;
    };
    
    const labels = ['Comparecimento', 'Alistamento Jovem', 'Filiação Partidária'];
    const dataMuni = [
        normalize(m.comp, 'comp'),
        normalize(m.alist, 'alist'),
        normalize(m.fil, 'fil')
    ];
    const dataNational = [
        normalize(nationalAverages.comp, 'comp'),
        normalize(nationalAverages.alist, 'alist'),
        normalize(nationalAverages.fil, 'fil')
    ];
    
    if (radarChartInstance) {
        radarChartInstance.data.datasets[0].data = dataMuni;
        radarChartInstance.data.datasets[0].label = m.nome;
        radarChartInstance.update();
        return;
    }
    
    const ctx = document.getElementById('radarChart').getContext('2d');
    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: m.nome,
                    data: dataMuni,
                    backgroundColor: 'rgba(223, 122, 94, 0.2)', // brand coral transparency
                    borderColor: '#df7a5e', // brand coral
                    borderWidth: 2,
                    pointBackgroundColor: '#df7a5e',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#df7a5e'
                },
                {
                    label: 'Média Nacional',
                    data: dataNational,
                    backgroundColor: 'rgba(74, 78, 105, 0.05)', // brand slate-purple transparency
                    borderColor: '#4a4e69', // brand slate-purple
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointBackgroundColor: '#4a4e69',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#4a4e69'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(34, 34, 60, 0.08)' },
                    grid: { color: 'rgba(34, 34, 60, 0.08)' },
                    pointLabels: {
                        color: '#4a4e69',
                        font: { family: 'Outfit', size: 11, weight: '600' }
                    },
                    ticks: {
                        color: '#64748b',
                        backdropColor: 'transparent',
                        font: { family: 'Outfit', size: 8 }
                    },
                    suggestedMin: 0,
                    suggestedMax: 100
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#22223c',
                        font: { family: 'Outfit', size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dataset = context.dataset;
                            const index = context.dataIndex;
                            const label = dataset.label;
                            const valNormalized = context.raw;
                            
                            // Retrieve the actual raw percentage values
                            let rawVal;
                            const isNational = label === 'Média Nacional';
                            const target = isNational ? nationalAverages : currentMunicipio;
                            
                            if (index === 0) rawVal = target.comp;
                            else if (index === 1) rawVal = target.alist;
                            else rawVal = target.fil;
                            
                            return `${label}: ${formatNumber(rawVal, 1)}% (Nível Relativo: ${formatNumber(valNormalized, 0)}%)`;
                        }
                    }
                }
            }
        }
    });
}

// --- Brand-Aligned Unified Color Interpolator ---
// Maps a value in range [minVal, maxVal] to a three-color ramp using INCT brand colors:
// 5 Discrete Color Classes matching the legend exactly:
// Muito Baixo (< 25) -> Steel Blue (#97a7b6)
// Baixo (25-38)      -> Slate (#64748b)
// Médio (38-52)      -> Dark Blue (#22223c)
// Alto (52-65)       -> Coral (#df7a5e)
// Muito Alto (>= 65)  -> Terracota (#b84a39)
function getMapColor(val, isStateMode = true) {
    if (val === null || val === undefined) return '#f1f1f5';
    
    if (isStateMode) {
        if (val < 25) return '#97a7b6';       // Muito Baixo
        if (val < 38) return '#64748b';       // Baixo
        if (val < 52) return '#22223c';       // Médio
        if (val < 65) return '#df7a5e';       // Alto
        return '#b84a39';                     // Muito Alto
    } else {
        if (val < -10) return '#97a7b6';      // Muito Negativo
        if (val < -3) return '#64748b';       // Negativo
        if (val <= 3) return '#22223c';       // Neutro / Na Média
        if (val <= 10) return '#df7a5e';      // Positivo
        return '#b84a39';                     // Muito Positivo
    }
}

// --- Update Map Legend Content ---
function updateMapLegend(mode, uf) {
    const subtitleEl = document.getElementById('map-legend-subtitle');
    const ticksEl = document.getElementById('legend-ticks');
    if (!ticksEl) return;

    const selectedName = currentMunicipio ? currentMunicipio.nome : '';

    if (mode === 'brazil') {
        if (subtitleEl) subtitleEl.innerText = "Diferença do Efeito Estadual vs Média Nacional (em pontos)";
        ticksEl.innerHTML = `
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-very-low"></span>
                <span class="tick-label"><strong>Muito Negativo</strong> <span class="tick-range">(< -10 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-low"></span>
                <span class="tick-label"><strong>Negativo</strong> <span class="tick-range">(-10 a -3 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-mid"></span>
                <span class="tick-label"><strong>Neutro / Na Média</strong> <span class="tick-range">(-3 a +3 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-high"></span>
                <span class="tick-label"><strong>Positivo</strong> <span class="tick-range">(+3 a +10 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-very-high"></span>
                <span class="tick-label"><strong>Muito Positivo</strong> <span class="tick-range">(> +10 pts)</span></span>
            </div>
        `;
    } else {
        if (subtitleEl) subtitleEl.innerText = `Score IPAR-Eleitoral (0 a 100 pontos) - ${uf || ''}`;
        ticksEl.innerHTML = `
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-very-low"></span>
                <span class="tick-label"><strong>Muito Baixo</strong> <span class="tick-range">(0 - 25 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-low"></span>
                <span class="tick-label"><strong>Baixo</strong> <span class="tick-range">(25 - 38 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-mid"></span>
                <span class="tick-label"><strong>Médio</strong> <span class="tick-range">(38 - 52 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-high"></span>
                <span class="tick-label"><strong>Alto</strong> <span class="tick-range">(52 - 65 pts)</span></span>
            </div>
            <div class="legend-tick-item">
                <span class="tick-color-badge bg-scale-very-high"></span>
                <span class="tick-label"><strong>Muito Alto</strong> <span class="tick-range">(65 - 100 pts)</span></span>
            </div>
            <div class="legend-tick-item legend-selected-chip">
                <span class="tick-color-badge bg-scale-selected"></span>
                <span class="tick-label"><strong>Selecionado</strong> <span id="legend-selected-name" class="tick-range">${selectedName ? `(${selectedName})` : ''}</span></span>
            </div>
        `;
    }
}

// --- Initialize Leaflet Map ---
function initMap() {
    mapInstance = L.map('brazil-map', {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false
    }).setView([-14.235, -51.925], 4);
    
    // Light Positron tile layer (perfectly matches light theme!)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 8,
        minZoom: 3
    }).addTo(mapInstance);
}

// --- Show National Map (States View) ---
function showNationalMap() {
    mapMode = 'brazil';
    
    // Toggle button configuration
    if (currentMunicipio) {
        btnBackToBrazil.style.display = 'block';
        btnBackToBrazil.innerText = `Ver ${currentMunicipio.uf}`;
    } else {
        btnBackToBrazil.style.display = 'none';
    }
    
    document.getElementById('map-title').innerText = "Efeito da Cultura Política por Estado (UF)";
    document.getElementById('map-desc').innerText = "Mapeamento dos efeitos estaduais (intercepto do modelo multinível). Cores quentes indicam estados que impulsionam o engajamento de suas cidades, cores frias indicam estados que atenuam.";
    updateMapLegend('brazil');
    
    // Clear any existing layers
    if (stateLayer) { mapInstance.removeLayer(stateLayer); stateLayer = null; }
    if (nationalLayer) { mapInstance.removeLayer(nationalLayer); }
    
    function styleFeature(feature) {
        const uf = feature.properties.sigla;
        const estInfo = estadosData[uf];
        const effect = estInfo ? estInfo.efeito_uf : 0;
        return {
            fillColor: getMapColor(effect, false),
            weight: 1.5,
            opacity: 1,
            color: 'rgba(34, 34, 60, 0.15)',
            fillOpacity: 0.7
        };
    }
    
    function onEachFeature(feature, layer) {
        const uf = feature.properties.sigla;
        const name = feature.properties.name;
        const estInfo = estadosData[uf];
        const effect = estInfo ? estInfo.efeito_uf : null;
        
        const munisState = municipiosData.filter(m => m.uf === uf && m.ipar !== null);
        const avgIparState = munisState.reduce((sum, m) => sum + m.ipar, 0) / munisState.length;
        
        // Instant hover tooltip: "SP: 45.2" (not permanent anymore per user request)
        layer.bindTooltip(`${uf}: ${formatNumber(avgIparState, 1)}`, {
            permanent: false, // only on hover!
            direction: 'center',
            className: 'state-map-label'
        });
        
        let popupText = `
            <div style="font-family: var(--font-primary);">
                <strong style="font-size: 0.95rem; display: block; margin-bottom: 4px;">${name} (${uf})</strong>
                <span style="display: block; margin-bottom: 2px; color: #4a4e69;">Efeito Cultural/Líquido: 
                    <strong style="color: ${effect >= 0 ? '#df7a5e' : '#97a7b6'}">
                        ${effect >= 0 ? '+' : ''}${formatNumber(effect, 2)} pts
                    </strong>
                </span>
                <span style="display: block; color: #4a4e69;">IPAR-Eleitoral Médio: 
                    <strong>${formatNumber(avgIparState, 1)}</strong>
                </span>
                <span style="display: block; font-size: 0.725rem; color: var(--accent-cyan); margin-top: 6px; font-weight: 600;">Clique para explorar as cidades deste estado</span>
            </div>
        `;
        
        layer.bindPopup(popupText);
        
        layer.on({
            mouseover: (e) => {
                e.target.setStyle({ fillOpacity: 0.85, weight: 2, color: 'var(--text-primary)' });
            },
            mouseout: (e) => {
                nationalLayer.resetStyle(e.target);
            },
            click: () => {
                loadStateMap(uf);
            }
        });
    }
    
    nationalLayer = L.geoJSON(geojsonData, {
        style: styleFeature,
        onEachFeature: onEachFeature
    }).addTo(mapInstance);
    
    mapInstance.setView([-14.235, -51.925], 4);
}

// --- Load and Display State Municipalities Map ---
async function loadStateMap(uf) {
    const stateCode = ufCodes[uf];
    if (!stateCode) return;
    
    mapMode = 'state';
    currentUf = uf;
    btnBackToBrazil.style.display = 'block';
    btnBackToBrazil.innerText = "Ver Brasil";
    
    document.getElementById('map-title').innerText = `Municípios de ${uf}`;
    document.getElementById('map-desc').innerText = `Visualização das cidades de ${uf} coloridas pelo score IPAR-Eleitoral. Passe o mouse para ver os nomes e valores IPAR. O município selecionado está em amarelo.`;
    updateMapLegend('state', uf);
    
    if (nationalLayer) { mapInstance.removeLayer(nationalLayer); }
    if (stateLayer) { mapInstance.removeLayer(stateLayer); }
    
    try {
        let stateGeojson = stateGeojsonCache[stateCode];
        if (!stateGeojson) {
            // Load state municipality borders dynamically
            const res = await fetch(`https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-${stateCode}-mun.json`);
            stateGeojson = await res.json();
            stateGeojsonCache[stateCode] = stateGeojson;
        }
        
        function onEachMuni(feature, layer) {
            const muniId = parseInt(feature.properties.id);
            const muniInfo = municipiosData.find(x => x.id === muniId);
            
            if (muniInfo) {
                // Instantly display clean hover tooltip with name and score
                layer.bindTooltip(`${muniInfo.nome}: ${formatNumber(muniInfo.ipar, 1)}`, {
                    permanent: false, // only on hover
                    direction: 'top',
                    className: 'muni-map-tooltip'
                });
                
                let popupText = `
                    <div style="font-family: var(--font-primary);">
                        <strong style="font-size: 0.95rem; display: block; margin-bottom: 4px;">${muniInfo.nome} (${muniInfo.uf})</strong>
                        <span style="display: block; color: #4a4e69;">IPAR-Eleitoral: <strong>${formatNumber(muniInfo.ipar, 1)}</strong></span>
                        <span style="display: block; color: #4a4e69; font-size: 0.725rem;">Comparecimento: ${formatNumber(muniInfo.comp, 1)}%</span>
                        <span style="display: block; color: #4a4e69; font-size: 0.725rem;">Alistamento Jovem: ${formatNumber(muniInfo.alist, 1)}%</span>
                        <span style="display: block; color: #4a4e69; font-size: 0.725rem;">Filiação Partidária: ${formatNumber(muniInfo.fil, 1)}%</span>
                        <span style="display: block; font-size: 0.725rem; color: var(--accent-cyan); margin-top: 6px; font-weight: 600;">Clique para selecionar este município</span>
                    </div>
                `;
                layer.bindPopup(popupText);
            }
            
            layer.on({
                mouseover: (e) => {
                    const isSelected = currentMunicipio && currentMunicipio.id === muniId;
                    e.target.setStyle({
                        fillOpacity: 0.9,
                        weight: isSelected ? 3.5 : 2,
                        color: isSelected ? '#fff' : 'rgba(34,34,60,0.4)'
                    });
                },
                mouseout: (e) => {
                    stateLayer.resetStyle(e.target);
                },
                click: () => {
                    if (muniInfo) selectMunicipio(muniInfo);
                }
            });
        }
        
        stateLayer = L.geoJSON(stateGeojson, {
            style: styleMuniFeature,
            onEachFeature: onEachMuni
        }).addTo(mapInstance);
        
        // Fit map viewport to state boundaries
        mapInstance.fitBounds(stateLayer.getBounds(), { padding: [20, 20] });
        
    } catch (err) {
        console.error("Erro ao carregar mapa do estado:", err);
        showNationalMap(); // Fallback to Brazil view on error
    }
}

// --- Initialize Scatter Plot (Paradox) ---
function initScatterPlot() {
    const ctx = document.getElementById('scatterChart').getContext('2d');
    
    scatterChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Municípios (Amostra)',
                    data: [], // populated dynamically
                    backgroundColor: 'rgba(74, 78, 105, 0.4)', // brand slate-purple with transparency
                    borderColor: 'transparent',
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#df7a5e' // brand coral hover
                },
                {
                    label: 'Limite Inferior (95% IC)',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(223, 122, 94, 0.4)',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    pointRadius: 0,
                    showLine: true
                },
                {
                    label: 'Limite Superior (95% IC)',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(223, 122, 94, 0.4)',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: {
                        target: 1,
                        above: 'rgba(223, 122, 94, 0.08)'
                    },
                    pointRadius: 0,
                    showLine: true
                },
                {
                    label: 'Linha de Tendência',
                    data: [], // populated dynamically
                    type: 'line',
                    borderColor: '#df7a5e', // brand coral trendline
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    showLine: true
                },
                {
                    label: 'Selecionado',
                    data: [], // populated dynamically
                    backgroundColor: '#eab308', // gold
                    borderColor: '#fff',
                    borderWidth: 2,
                    pointRadius: 8,
                    pointHoverRadius: 9
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Variável X',
                        color: '#4a4e69',
                        font: { family: 'Outfit', size: 12, weight: '600' }
                    },
                    grid: { color: 'rgba(34, 34, 60, 0.04)' },
                    ticks: { color: '#64748b', font: { family: 'Outfit' } }
                },
                y: {
                    title: {
                        display: true,
                        text: 'IPAR-Eleitoral (Score)',
                        color: '#4a4e69',
                        font: { family: 'Outfit', size: 12, weight: '600' }
                    },
                    grid: { color: 'rgba(34, 34, 60, 0.04)' },
                    ticks: { color: '#64748b', font: { family: 'Outfit' } },
                    min: 0,
                    max: 100
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const raw = context.raw;
                            if (context.datasetIndex === 1) return 'Limite Inferior (95% IC)';
                            if (context.datasetIndex === 2) return 'Limite Superior (95% IC)';
                            if (context.datasetIndex === 3) return 'Linha de Tendência';
                            const labelX = scatterXVarSelect.options[scatterXVarSelect.selectedIndex].text;
                            
                            // For population, show formatted full value
                            const xValFormatted = scatterXVarSelect.value === 'pop' 
                                ? formatNumber(raw.xRaw || raw.x) + ' hab.' 
                                : formatNumber(raw.x, 1);
                                
                            return `${raw.label} (${raw.uf}): ${labelX}: ${xValFormatted} | IPAR: ${formatNumber(raw.y, 1)}`;
                        }
                    }
                }
            }
        }
    });
}

// --- Update Scatter Plot variables & data ---
function updateScatterPlot() {
    if (!scatterChartInstance || !currentMunicipio) return;
    
    const xVar = scatterXVarSelect.value;
    const xLabel = scatterXVarSelect.options[scatterXVarSelect.selectedIndex].text;
    
    // Filter and prepare points
    const validMunis = municipiosData.filter(m => m[xVar] !== null && m.ipar !== null);
    
    // Random sample of background points to prevent render lag
    const subsetCount = 1200;
    const shuffled = [...validMunis].sort(() => 0.5 - Math.random());
    const subset = shuffled.slice(0, subsetCount);
    
    // If pop, the plot coordinates x will be raw, but X-axis scale handles log scale
    const backgroundData = subset.map(m => ({ 
        x: m[xVar], 
        y: m.ipar, 
        label: m.nome, 
        uf: m.uf,
        xRaw: xVar === 'pop' ? m.pop : null
    }));
    
    // Compute Linear Regression Trend Line (y = a + bx)
    // If pop, regression is calculated in logarithmic space: y = a + b * log10(x)
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = validMunis.length;
    
    validMunis.forEach(m => {
        const valX = xVar === 'pop' ? Math.log10(m[xVar]) : m[xVar];
        sumX += valX;
        sumY += m.ipar;
        sumXY += valX * m.ipar;
        sumXX += valX * valX;
    });
    
    const b = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const a = (sumY - b * sumX) / n;
    
    // Compute residual standard error (RSE) of bivariate regression
    let sumE2 = 0;
    validMunis.forEach(m => {
        const valX = xVar === 'pop' ? Math.log10(m[xVar]) : m[xVar];
        const predY = a + b * valX;
        const e = m.ipar - predY;
        sumE2 += e * e;
    });
    const rse = Math.sqrt(sumE2 / (n - 2));
    
    // Define bounds for Xaxis trend line and 95% Confidence prediction bands drawing
    let trendData = [];
    let lowerData = [];
    let upperData = [];
    
    if (xVar === 'pop') {
        // Draw logarithmic curve trend points
        const logMin = Math.log10(1000);
        const logMax = Math.log10(15000000);
        const steps = 15;
        for (let i = 0; i <= steps; i++) {
            const logX = logMin + (logMax - logMin) * (i / steps);
            const x = Math.pow(10, logX);
            const predY = a + b * logX;
            trendData.push({ x: x, y: predY });
            lowerData.push({ x: x, y: Math.max(0, predY - 1.96 * rse) });
            upperData.push({ x: x, y: Math.min(100, predY + 1.96 * rse) });
        }
    } else {
        const minX = Math.min(...validMunis.map(m => m[xVar]));
        const maxX = Math.max(...validMunis.map(m => m[xVar]));
        trendData = [
            { x: minX, y: a + b * minX },
            { x: maxX, y: a + b * maxX }
        ];
        lowerData = [
            { x: minX, y: Math.max(0, (a + b * minX) - 1.96 * rse) },
            { x: maxX, y: Math.max(0, (a + b * maxX) - 1.96 * rse) }
        ];
        upperData = [
            { x: minX, y: Math.min(100, (a + b * minX) + 1.96 * rse) },
            { x: maxX, y: Math.min(100, (a + b * maxX) + 1.96 * rse) }
        ];
    }
    
    // Highlighted selected city
    const highlightPoint = currentMunicipio[xVar] !== null && currentMunicipio.ipar !== null
        ? [{ 
            x: currentMunicipio[xVar], 
            y: currentMunicipio.ipar, 
            label: currentMunicipio.nome, 
            uf: currentMunicipio.uf,
            xRaw: xVar === 'pop' ? currentMunicipio.pop : null
          }]
        : [];
        
    // Update chart
    scatterChartInstance.options.scales.x.title.text = xLabel;
    scatterChartInstance.data.datasets[0].data = backgroundData;
    scatterChartInstance.data.datasets[1].data = lowerData;
    scatterChartInstance.data.datasets[2].data = upperData;
    scatterChartInstance.data.datasets[3].data = trendData;
    scatterChartInstance.data.datasets[4].data = highlightPoint;
    scatterChartInstance.data.datasets[4].label = currentMunicipio.nome;
    
    // Adjust scale types: logarithmic for population, linear for others
    if (xVar === 'pop') {
        scatterChartInstance.options.scales.x.type = 'logarithmic';
        scatterChartInstance.options.scales.x.min = 1000;
        scatterChartInstance.options.scales.x.max = 15000000;
        scatterChartInstance.options.scales.x.ticks.callback = function(value) {
            if (value === 1000) return '1k';
            if (value === 10000) return '10k';
            if (value === 100000) return '100k';
            if (value === 1000000) return '1M';
            if (value === 10000000) return '10M';
            return null;
        };
    } else {
        scatterChartInstance.options.scales.x.type = 'linear';
        scatterChartInstance.options.scales.x.min = undefined;
        scatterChartInstance.options.scales.x.max = undefined;
        scatterChartInstance.options.scales.x.ticks.callback = undefined;
    }
    
    // Check if the selected city is statistically significantly above/below the bivariate regression line
    const muniXVal = xVar === 'pop' ? Math.log10(currentMunicipio[xVar]) : currentMunicipio[xVar];
    const muniPredY = a + b * muniXVal;
    const isSigAbove = currentMunicipio.ipar > (muniPredY + 1.96 * rse);
    const isSigBelow = currentMunicipio.ipar < (muniPredY - 1.96 * rse);
    
    let sigText = "";
    if (isSigAbove) {
        sigText = ` O município selecionado está <strong style="color: var(--accent-cyan);">significativamente acima</strong> do esperado para o seu nível de ${xLabel.toLowerCase()} (nível de confiança de 95%).`;
    } else if (isSigBelow) {
        sigText = ` O município selecionado está <strong style="color: var(--accent-rose);">significativamente abaixo</strong> do esperado para o seu nível de ${xLabel.toLowerCase()} (nível de confiança de 95%).`;
    } else {
        sigText = ` O município selecionado está <strong style="color: var(--accent-emerald);">dentro da faixa típica esperada</strong> para o seu nível de ${xLabel.toLowerCase()}.`;
    }
    
    // Update dynamic description text
    const scatterDesc = document.getElementById('scatter-desc');
    const direction = b < 0 ? 'negativa' : 'positiva';
    const correlationStrength = Math.abs(b) > 0.15 ? 'expressivo' : 'sutil';
    
    scatterDesc.innerHTML = `Visualização da associação ${direction} entre ${xLabel.toLowerCase()} (eixo X em escala ${xVar === 'pop' ? 'logarítmica' : 'linear'}) e o IPAR-Eleitoral, com <strong>banda de predição de 95%</strong> (sombreada). ${sigText}`;
    
    scatterChartInstance.update();
}

// --- Kick off Initialization ---
document.addEventListener('DOMContentLoaded', initApp);
