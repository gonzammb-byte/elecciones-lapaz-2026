// js/mapa.js - Lógica del mapa con soporte para todos los cargos

let mapa = null;
let recintosData = null;
let marcadores = [];
let cargoActual = 'gobernador';

// ── Lookups: guardan el objeto { tabla, grafica } completo por nivel ────────
// alcaldeLookup["Provincia / Municipio"] = { tabla, grafica }
// concejalLookup["Provincia / Municipio"] = { tabla, grafica }
// asTerritLookup["Provincia"] = { tabla, grafica }
// asPoblData = { tabla, grafica }   (departamental)
let alcaldeLookup   = {};
let concejalLookup  = {};
let asTerritLookup  = {};
let asPoblData      = null;

function _ganadorDe(grafica) {
    if (!grafica || !grafica.length) return null;
    return grafica
        .filter(p => p.sigla && p.sigla.trim())
        .sort((a, b) => (b.porcien || 0) - (a.porcien || 0))[0] || null;
}

// Devuelve el color del ganador a partir de un objeto { tabla, grafica }
function _colorDeDatos(datos) {
    if (!datos || !datos.grafica) return '#cccccc';
    const g = _ganadorDe(datos.grafica);
    return g ? (g.color || '#cccccc') : '#cccccc';
}

async function cargarLookupsCargos() {
    try {
        const [rAlc, rCon, rAt, rAp] = await Promise.all([
            fetch('resultados/alcalde.json'),
            fetch('resultados/concejal.json'),
            fetch('resultados/asambleista_territorio.json'),
            fetch('resultados/asambleista_poblacion.json'),
        ]);
        const [alc, con, at, ap] = await Promise.all([
            rAlc.json(), rCon.json(), rAt.json(), rAp.json()
        ]);

        // Guardar data completa (tabla + grafica) por municipio/provincia
        for (const [k, v] of Object.entries(alc.municipios || {})) {
            if (v.data) alcaldeLookup[k] = v.data;
        }
        for (const [k, v] of Object.entries(con.municipios || {})) {
            if (v.data) concejalLookup[k] = v.data;
        }
        for (const [k, v] of Object.entries(at.provincias || {})) {
            if (v.data) asTerritLookup[k] = v.data;
        }
        asPoblData = ap.data || null;

        console.log('Lookups cargados:', Object.keys(alcaldeLookup).length, 'municipios,',
                    Object.keys(asTerritLookup).length, 'provincias');
    } catch (e) {
        console.error('Error cargando lookups:', e);
    }
}

// ── Color del ganador por recinto ──────────────────────────────────────────
function obtenerColorPorGanador(recinto) {
    switch (cargoActual) {
        case 'gobernador': {
            const g = recinto.gobernador;
            if (!g || !g.grafica) return '#cccccc';
            const gan = _ganadorDe(g.grafica);
            return gan ? (gan.color || '#cccccc') : '#cccccc';
        }
        case 'asambleista_poblacion':
            return _colorDeDatos(asPoblData);
        case 'asambleista_territorio':
            return _colorDeDatos(asTerritLookup[recinto.provincia]);
        case 'alcalde':
            return _colorDeDatos(alcaldeLookup[`${recinto.provincia} / ${recinto.municipio}`]);
        case 'concejal':
            return _colorDeDatos(concejalLookup[`${recinto.provincia} / ${recinto.municipio}`]);
        default:
            return '#cccccc';
    }
}

function calcularRadio(inscritos) {
    return Math.max(5, Math.min(14, 5 + Math.log10(inscritos || 100) * 2));
}

// ── Cargar recintos ────────────────────────────────────────────────────────
async function cargarDatosRecintos() {
    try {
        const response = await fetch('resultados/recintos_light.json');
        if (!response.ok) throw new Error('No se pudo cargar recintos_light.json');
        recintosData = await response.json();
        console.log(Object.keys(recintosData.recintos).length, 'recintos cargados');
        return true;
    } catch (error) {
        console.error('Error cargando recintos:', error);
        document.getElementById('mhint-txt').innerHTML =
            '<span style="color:var(--acento)">Error: No se pudo cargar los datos</span>';
        return false;
    }
}

// ── Renderizar recintos ────────────────────────────────────────────────────
function renderizarRecintos() {
    if (!recintosData || !mapa) return;
    marcadores.forEach(m => mapa.removeLayer(m));
    marcadores = [];

    Object.values(recintosData.recintos).forEach(recinto => {
        const marcador = L.circleMarker([recinto.lat, recinto.lon], {
            radius: calcularRadio(recinto.inscritos),
            fillColor: obtenerColorPorGanador(recinto),
            color: 'rgba(255,255,255,.85)',
            weight: 1.5,
            fillOpacity: 0.85,
            opacity: 0.9
        }).addTo(mapa);
        marcador._recinto = recinto;
        marcador.on('click', () => mostrarDetalleRecinto(recinto));
        marcadores.push(marcador);
    });

    actualizarLeyenda();
}

// ── Leyenda ────────────────────────────────────────────────────────────────
function actualizarLeyenda() {
    const leyendaDiv = document.getElementById('li');
    if (!leyendaDiv) return;
    const partidos = new Map();

    const _addGanadores = (lookup) => {
        Object.values(lookup).forEach(datos => {
            const g = _ganadorDe(datos.grafica);
            if (g && g.sigla && !partidos.has(g.sigla)) partidos.set(g.sigla, g.color);
        });
    };

    if (cargoActual === 'gobernador') {
        Object.values(recintosData.recintos).forEach(r => {
            if (r.gobernador && r.gobernador.grafica) {
                const g = _ganadorDe(r.gobernador.grafica);
                if (g && g.sigla && !partidos.has(g.sigla)) partidos.set(g.sigla, g.color);
            }
        });
    } else if (cargoActual === 'asambleista_poblacion' && asPoblData) {
        const g = _ganadorDe(asPoblData.grafica);
        if (g) partidos.set(g.sigla, g.color);
    } else if (cargoActual === 'asambleista_territorio') {
        _addGanadores(asTerritLookup);
    } else if (cargoActual === 'alcalde') {
        _addGanadores(alcaldeLookup);
    } else if (cargoActual === 'concejal') {
        _addGanadores(concejalLookup);
    }

    leyendaDiv.innerHTML = Array.from(partidos.entries()).slice(0, 12).map(([sigla, color]) => `
        <div class="li"><div class="ld" style="background:${color || '#ccc'}"></div><span>${sigla}</span></div>
    `).join('') + '<div class="li"><div class="ld" style="background:#ccc;border:1px solid #bbb"></div>Sin datos</div>';
}

// ── Panel derecho: mostrar resultados (misma lógica para todos los cargos) ─
function _renderResultados(datos) {
    if (!datos || !datos.grafica || datos.grafica.length === 0) {
        document.getElementById('rca').style.display = 'none';
        document.getElementById('rcs').innerHTML = '';
        document.getElementById('rcb').innerHTML =
            '<div class="est" style="padding:14px;font-size:12px">Sin resultados disponibles</div>';
        return;
    }

    // Actas
    if (datos.tabla) {
        const ac = datos.tabla.find(t => t.nombre === 'Total Actas Computadas');
        const ha = datos.tabla.find(t => t.nombre === 'Total Actas Habilitadas');
        if (ac && ha && ha.valor) {
            const pc = (ac.valor / ha.valor * 100).toFixed(1);
            document.getElementById('rca').style.display = 'block';
            document.getElementById('rcal').textContent =
                `${_fmtN(ac.valor)} / ${_fmtN(ha.valor)} (${pc}%)`;
            document.getElementById('rcaf').style.width = pc + '%';
        } else {
            document.getElementById('rca').style.display = 'none';
        }

        // Stats: Válidos, Emitidos, Blancos, Nulos
        const stats = ['Votos Válidos', 'Votos Emitidos', 'Votos Blancos', 'Total Votos Nulos'];
        document.getElementById('rcs').innerHTML = stats.map(k => {
            const item = datos.tabla.find(t => t.nombre === k);
            return item ? `<div class="rd-stat">
                <div class="l">${k.replace('Total ', '').replace('Votos ', '')}</div>
                <div class="v">${_fmtN(item.valor)}</div>
                ${item.porcentaje != null ? `<div class="p">${item.porcentaje}%</div>` : ''}
            </div>` : '';
        }).join('');
    } else {
        document.getElementById('rca').style.display = 'none';
        document.getElementById('rcs').innerHTML = '';
    }

    // Barras por organización
    const sorted = [...datos.grafica]
        .filter(x => x.sigla && x.sigla.trim())
        .sort((a, b) => (b.porcien || 0) - (a.porcien || 0));
    const maxPct = Math.max(...sorted.map(x => x.porcien || 0));

    document.getElementById('rcb').innerHTML = sorted.map(x => {
        const color = x.color || '#ccc';
        const width = maxPct > 0 ? (x.porcien / maxPct * 100) : 0;
        return `
            <div class="cr">
                <span class="cr-sigla" title="${x.nombre || x.sigla}">${x.sigla}</span>
                <div class="cr-track"><div class="cr-fill" style="width:${width}%;background:${color}"></div></div>
                <span class="cr-pct" style="color:${color}">${(x.porcien || 0).toFixed(1)}%</span>
            </div>
            <div class="cr-votos">${_fmtN(x.valor)} votos</div>`;
    }).join('');
}

function _fmtN(n) {
    if (n === null || n === undefined) return '–';
    return Number(n).toLocaleString('es-BO');
}

function mostrarDetalleRecinto(recinto) {
    document.getElementById('mhint').style.display = 'none';
    document.getElementById('rdet').style.display = 'flex';

    // Cabecera: nombre del recinto
    document.getElementById('rcn').textContent = recinto.nombre;
    document.getElementById('rcm').innerHTML = `
        ${recinto.municipio} · ${recinto.provincia}<br>
        <em>${recinto.mesas} mesas</em> &nbsp;·&nbsp; ${_fmtN(recinto.inscritos)} inscritos
    `;

    // Seleccionar el objeto de datos según el cargo
    let datos = null;
    let nivelLabel = '';

    switch (cargoActual) {
        case 'gobernador':
            datos = recinto.gobernador;
            break;
        case 'asambleista_poblacion':
            datos = asPoblData;
            nivelLabel = 'Datos a nivel departamental';
            break;
        case 'asambleista_territorio':
            datos = asTerritLookup[recinto.provincia] || null;
            nivelLabel = `Provincia ${recinto.provincia}`;
            break;
        case 'alcalde':
            datos = alcaldeLookup[`${recinto.provincia} / ${recinto.municipio}`] || null;
            nivelLabel = `Municipio de ${recinto.municipio}`;
            break;
        case 'concejal':
            datos = concejalLookup[`${recinto.provincia} / ${recinto.municipio}`] || null;
            nivelLabel = `Municipio de ${recinto.municipio}`;
            break;
    }

    // Para cargos distintos de gobernador, mostrar etiqueta de nivel
    if (cargoActual !== 'gobernador' && nivelLabel) {
        // Insertar etiqueta de nivel antes de las barras
        const rcb = document.getElementById('rcb');
        // Lo hacemos inyectando un wrapper; se limpia en _renderResultados
        document.getElementById('rc-nivel-lbl') && document.getElementById('rc-nivel-lbl').remove();
        const lbl = document.createElement('div');
        lbl.id = 'rc-nivel-lbl';
        lbl.style.cssText = 'font-family:var(--font-m);font-size:9px;letter-spacing:1.5px;color:var(--texto3);text-transform:uppercase;padding:10px 15px 0';
        lbl.textContent = nivelLabel;
        rcb.parentNode.insertBefore(lbl, rcb);
    } else {
        const lbl = document.getElementById('rc-nivel-lbl');
        if (lbl) lbl.remove();
    }

    _renderResultados(datos);
}

function cerrarDet() {
    marcadores.forEach(m => m.setStyle({ weight: 1.5, color: 'rgba(255,255,255,.85)' }));
    document.getElementById('mhint').style.display = 'flex';
    document.getElementById('rdet').style.display = 'none';
    const lbl = document.getElementById('rc-nivel-lbl');
    if (lbl) lbl.remove();
}

// ── Filtros ────────────────────────────────────────────────────────────────
function filtrarMapa() {
    const provincia = document.getElementById('fp').value;
    const municipio = document.getElementById('fm').value;

    if (provincia) {
        const municipios = [...new Set(
            Object.values(recintosData.recintos)
                .filter(r => r.provincia === provincia)
                .map(r => r.municipio)
        )].sort();
        const fm = document.getElementById('fm');
        fm.innerHTML = '<option value="">Todos los municipios</option>';
        municipios.forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m;
            fm.appendChild(o);
        });
    }

    const filtrados = Object.values(recintosData.recintos).filter(r => {
        if (provincia && r.provincia !== provincia) return false;
        if (municipio && r.municipio !== municipio) return false;
        return true;
    });

    marcadores.forEach(m => mapa.removeLayer(m));
    marcadores = [];

    filtrados.forEach(recinto => {
        const marcador = L.circleMarker([recinto.lat, recinto.lon], {
            radius: calcularRadio(recinto.inscritos),
            fillColor: obtenerColorPorGanador(recinto),
            color: 'rgba(255,255,255,.85)', weight: 1.5, fillOpacity: 0.85
        }).addTo(mapa);
        marcador._recinto = recinto;
        marcador.on('click', () => mostrarDetalleRecinto(recinto));
        marcadores.push(marcador);
    });

    if (filtrados.length > 0)
        mapa.fitBounds(L.latLngBounds(filtrados.map(r => [r.lat, r.lon])), { padding: [50, 50] });
}

async function cambiarCargoMapa() {
    cargoActual = document.getElementById('mc').value;
    document.querySelectorAll('.nb').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.cargo === cargoActual));
    if (recintosData) { renderizarRecintos(); cerrarDet(); }
}

function formatNumber(n) { return _fmtN(n); }

// ── Inicializar mapa ───────────────────────────────────────────────────────
async function iniciarMapa() {
    mapa = L.map('mapa').setView([-16.5, -68.15], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd', maxZoom: 19
    }).addTo(mapa);

    document.getElementById('mf').style.display = 'flex';
    document.getElementById('mleg').style.display = 'block';

    // Cargar recintos y lookups en paralelo
    const [cargado] = await Promise.all([
        cargarDatosRecintos(),
        cargarLookupsCargos()
    ]);
    if (!cargado) return;

    // Poblar filtro de provincias
    const provincias = [...new Set(
        Object.values(recintosData.recintos).map(r => r.provincia)
    )].sort();
    const fp = document.getElementById('fp');
    provincias.forEach(p => {
        const o = document.createElement('option');
        o.value = p; o.textContent = p;
        fp.appendChild(o);
    });

    renderizarRecintos();
}

// ── selTab / selCargo ──────────────────────────────────────────────────────
function selTab(tab) {
    document.getElementById('tt').classList.toggle('active', tab === 'tabla');
    document.getElementById('tm').classList.toggle('active', tab === 'mapa');
    document.getElementById('vt').classList.toggle('visible', tab === 'tabla');
    document.getElementById('vm').classList.toggle('visible', tab === 'mapa');
    if (tab === 'tabla') { if (typeof renderTabla === 'function') renderTabla(); }
    else { if (!mapa) iniciarMapa(); }
}

function selCargo(btn) {
    document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cargoActual = btn.dataset.cargo;
    const select = document.getElementById('mc');
    if (select) select.value = cargoActual;
    if (document.getElementById('vm').classList.contains('visible')) {
        if (recintosData) { renderizarRecintos(); cerrarDet(); }
    } else {
        if (typeof renderTabla === 'function') renderTabla();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('vm').classList.contains('visible')) iniciarMapa();
    if (typeof renderTabla === 'function') renderTabla();
});
