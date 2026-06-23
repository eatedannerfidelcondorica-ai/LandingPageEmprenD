// ============================================================
// SUPABASE CONFIG
// ============================================================
const SURL = 'https://juwvrmzgljvbzmhzrgzv.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1d3ZybXpnbGp2YnptaHpyZ3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTYxMzMsImV4cCI6MjA5NzM3MjEzM30.oeo3FHXGBVuelB3W6pMWywjV8ULrambdoziKwYJLpeI';
const sb = supabase.createClient(SURL, SKEY);
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';

// ============================================================
// SESIÓN
// ============================================================
function getSession() {
  const s = localStorage.getItem('emprend_session');
  return s ? JSON.parse(s) : null;
}
function setSession(data) {
  localStorage.setItem('emprend_session', JSON.stringify(data));
}
function cerrarSesion() {
  localStorage.removeItem('emprend_session');
  window.location.href = 'login.html';
}
function requireRol(rol) {
  const s = getSession();
  if (!s || s.rol !== rol) { window.location.href = 'login.html'; return null; }
  return s;
}

// ============================================================
// LOGIN
// ============================================================
function switchTab(tab, btn) {
  document.querySelectorAll('.ltab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.ltab-content').forEach(c => c.classList.remove('activo'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('activo');
}

async function iniciarSesion() {
  const correo = document.getElementById('loginCorreo')?.value.trim();
  const pass   = document.getElementById('loginPass')?.value.trim();
  const rol    = document.getElementById('loginRol')?.value;
  const msg    = document.getElementById('loginMsg');
  if (!correo || !pass) { msg.textContent = '⚠️ Completa todos los campos.'; return; }
  const { data, error } = await sb.from('usuario').select('*')
    .eq('correo', correo).eq('password_hash', pass).eq('rol', rol).eq('estado', true).single();
  if (error || !data) { msg.textContent = '❌ Credenciales incorrectas o rol no coincide.'; return; }
  setSession(data);
  if (data.rol === 'ADMINISTRADOR') window.location.href = 'admin.html';
  else if (data.rol === 'EMPRENDEDOR') window.location.href = 'emprendedor.html';
  else if (data.rol === 'COMPRADOR') window.location.href = 'comprador.html';
}

async function crearCuenta() {
  const nombre   = document.getElementById('regNombre')?.value.trim();
  const apellido = document.getElementById('regApellido')?.value.trim();
  const correo   = document.getElementById('regCorreo')?.value.trim();
  const pass     = document.getElementById('regPass')?.value.trim();
  const rol      = document.getElementById('regRol')?.value;
  const msg      = document.getElementById('regMsg');
  if (!nombre || !apellido || !correo || !pass) { msg.textContent = '⚠️ Completa todos los campos.'; return; }
  if (pass.length < 6) { msg.textContent = '⚠️ Mínimo 6 caracteres.'; return; }
  const { error } = await sb.from('usuario').insert([{ nombre, apellido, correo, password_hash: pass, rol }]);
  if (error) {
    msg.style.color = '#ef4444';
    msg.textContent = error.message.includes('unique') ? '❌ Ese correo ya está registrado.' : '❌ Error: ' + error.message;
    return;
  }
  msg.style.color = '#22c55e';
  msg.textContent = '✅ Cuenta creada. Inicia sesión.';
  setTimeout(() => switchTab('ingresar', document.querySelector('.ltab')), 1500);
}

// ============================================================
// UTILIDADES
// ============================================================
function fechaHoyISO() {
  return new Date().toISOString().split('T')[0];
}
function mesActual() {
  const d = new Date();
  return { mes: d.getMonth() + 1, anio: d.getFullYear() };
}
function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-BO', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function formatFechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-BO');
}
function formatMes(num) {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return meses[parseInt(num) - 1] || num;
}

// ============================================================
// LLAMADA A IA (Google Gemini API - ¡100% Gratuita!)
// ============================================================
async function llamarIA(prompt) {
  // Tu API key gratuita de Google AI Studio
  const API_KEY = 'AQ.Ab8RN6LN8-krV-dN5WQP8Y7RkujUwSE7jmW3xC923pTnf1CW6A';
  
  // Endpoint oficial para el modelo Gemini 2.5 Flash
  const URL_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

  // Estructura de la petición requerida por Google
  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };

  try {
    const res = await fetch(URL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    // Extrae el texto limpio que responde Gemini
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de la IA.';
  } catch (e) {
    console.error("Error al conectar con Gemini:", e);
    return '⚠️ No se pudo conectar con la IA de Google. Verifica tu API key.';
  }
}

// ============================================================
// SISTEMA DE PREDICCIÓN DE VENTAS (Conexión Supabase + IA)
// ============================================================
async function generarPrediccionVentas() {
  if (!empData) return "⚠️ No se han cargado los datos del emprendimiento.";

  // 1. Traer el historial de ingresos (ventas) desde tu Supabase
  const { data: ventas, error } = await sb
    .from('transaccion')
    .select('monto, fecha_transaccion, descripcion')
    .eq('id_emprendimiento', empData.id_emprendimiento)
    .eq('tipo', 'INGRESO')
    .order('fecha_transaccion', { ascending: true });

  if (error) {
    console.error("Error al obtener ventas de Supabase:", error);
    return "❌ Error al leer los datos de ventas.";
  }

  if (!ventas || ventas.length === 0) {
    return "📊 Aún no tienes un historial de ventas registrado en tu base de datos de Supabase para poder hacer una predicción.";
  }

  // 2. Estructurar la orden con tus datos reales para Gemini
  const promptEspecial = `
    Actúa como un experto en Business Intelligence y analítica de datos comerciales. 
    Analiza el siguiente historial real de transacciones de venta de mi negocio:
    ${JSON.stringify(ventas)}

    Con base en estos datos históricos, genera un informe de predicción breve para el próximo mes en español:
    1. Una estimación del total de ventas esperado (en Bs.).
    2. Tendencias identificadas (días fuertes, productos o descripciones frecuentes).
    3. Dos consejos comerciales específicos basados en los números para mejorar las ventas.
    Sé claro, directo y utiliza un tono profesional.
  `;

  // 3. Llamar a Gemini y retornar el análisis final
  const resultadoIA = await llamarIA(promptEspecial);
  return resultadoIA;
}

// ============================================================
// ══════════════════════════════════════════════════════════
//  EMPRENDEDOR
// ══════════════════════════════════════════════════════════
// ============================================================
let empData = null;
let estrellasSeleccionadas = 0;
let empIdActualModal = null;
let prodIdActualModal = null;

async function initEmprendedor() {
  const session = requireRol('EMPRENDEDOR');
  if (!session) return;

  // Bienvenida
  const bienEl = document.getElementById('bienvenidaNombre');
  if (bienEl) bienEl.textContent = '👋 Bienvenido, ' + session.nombre + ' ' + session.apellido;
  const fechaEl = document.getElementById('bienvenidaFecha');
  if (fechaEl) fechaEl.textContent = '📅 ' + new Date().toLocaleDateString('es-BO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Cargar o crear emprendimiento
  let { data } = await sb.from('emprendimiento').select('*').eq('id_usuario', session.id_usuario).single();
  if (!data) {
    const { data: nuevo } = await sb.from('emprendimiento').insert([{
      id_usuario: session.id_usuario,
      nombre_negocio: session.nombre + ' - Mi Negocio',
      descripcion: '', categoria: '', direccion: '', telefono: ''
    }]).select().single();
    data = nuevo;
    // Ir a configuración al primer login
    setTimeout(() => verSeccion('configuracion', document.querySelector('.snav:last-child')), 500);
  }
  empData = data;

  const subEl = document.getElementById('seccionSub');
  if (subEl) subEl.textContent = '🏪 ' + empData.nombre_negocio + (empData.categoria ? ' · ' + empData.categoria : '');
  const bienNeg = document.getElementById('bienvenidaNegocio');
  if (bienNeg) bienNeg.textContent = '🏪 ' + empData.nombre_negocio;

  // Cargar foto de perfil
  cargarFotoEmprendedorHeader();
  // Cargar config
  cargarConfigEmprendedor();
  // Cargar datos del resumen
  await cargarResumen();
  // Registrar visita propia (no contar, solo actualizar last_seen)
  await registrarVisitaEmprendedor(session.id_usuario);
}

async function registrarVisitaEmprendedor(idUsuario) {
  await sb.from('usuario').update({ ultimo_acceso: new Date().toISOString() }).eq('id_usuario', idUsuario);
}

async function cargarResumen() {
  if (!empData) return;
  const { data: trans } = await sb.from('transaccion').select('monto, tipo').eq('id_emprendimiento', empData.id_emprendimiento);
  let ingresos = 0, egresos = 0;
  (trans || []).forEach(t => { if (t.tipo === 'INGRESO') ingresos += parseFloat(t.monto); else egresos += parseFloat(t.monto); });
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('kpiIngresos', 'Bs. ' + ingresos.toFixed(2));
  setEl('kpiEgresos', 'Bs. ' + egresos.toFixed(2));
  setEl('kpiGanancia', 'Bs. ' + (ingresos - egresos).toFixed(2));

  const { count } = await sb.from('producto').select('*', { count: 'exact', head: true })
    .eq('id_emprendimiento', empData.id_emprendimiento).eq('estado', true);
  setEl('kpiProductos', count || 0);

  // Ventas hoy / mes / año
  const hoy = fechaHoyISO();
  const { mes, anio } = mesActual();
  const { data: ventas } = await sb.from('transaccion').select('monto, fecha_transaccion')
    .eq('id_emprendimiento', empData.id_emprendimiento).eq('tipo', 'INGRESO');
  let totalHoy = 0, totalMes = 0, totalAnio = 0;
  (ventas || []).forEach(v => {
    const f = new Date(v.fecha_transaccion);
    const monto = parseFloat(v.monto);
    if (v.fecha_transaccion.startsWith(hoy)) totalHoy += monto;
    if (f.getMonth() + 1 === mes && f.getFullYear() === anio) totalMes += monto;
    if (f.getFullYear() === anio) totalAnio += monto;
  });
  setEl('ventasDia', 'Bs. ' + totalHoy.toFixed(2));
  setEl('ventasMes', 'Bs. ' + totalMes.toFixed(2));
  setEl('ventasAnio', 'Bs. ' + totalAnio.toFixed(2));

  // Clientes únicos
  const { data: ordenes } = await sb.from('orden').select('id_comprador').eq('id_emprendimiento', empData.id_emprendimiento);
  const clientesUnicos = new Set((ordenes || []).map(o => o.id_comprador)).size;
  setEl('totalClientes', clientesUnicos);

  // Visitas hoy
  const { count: visitas } = await sb.from('visita_producto').select('*', { count: 'exact', head: true })
    .eq('id_emprendimiento', empData.id_emprendimiento).gte('fecha_visita', hoy);
  setEl('visitasHoy', visitas || 0);

  // Alertas resumen
  const ids = await getProductIds();
  const alertasEl = document.getElementById('alertasResumen');
  if (alertasEl) {
    if (!ids.length) { alertasEl.innerHTML = '<p style="color:var(--texto-suave)">Sin alertas aún.</p>'; return; }
    const { data: alertas } = await sb.from('alerta').select('*, producto(nombre_producto)')
      .in('id_producto', ids).eq('estado', 'PENDIENTE').order('fecha_alerta', { ascending: false }).limit(5);
    alertasEl.innerHTML = (!alertas || alertas.length === 0)
      ? '<p style="color:var(--texto-suave)">✅ Sin alertas pendientes.</p>'
      : alertas.map(a => `<div class="alerta-item">🔔 <strong>${a.producto?.nombre_producto || '—'}</strong>: ${a.mensaje || a.tipo_alerta}</div>`).join('');
  }
}

async function getProductIds() {
  if (!empData) return [];
  const { data } = await sb.from('producto').select('id_producto').eq('id_emprendimiento', empData.id_emprendimiento);
  return (data || []).map(p => p.id_producto);
}

// ── GESTIONAR PRODUCTOS ──
function toggleFormProducto() {
  document.getElementById('formProducto')?.classList.toggle('oculto');
}

function previsualizarFotoProducto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('prodFotoPreview');
    if (prev) prev.innerHTML = `<img src="${e.target.result}" style="width:140px;height:140px;object-fit:cover;border-radius:10px;">`;
  };
  reader.readAsDataURL(file);
}

async function agregarProducto() {
  if (!empData) return;
  const nombre    = document.getElementById('prodNombre')?.value.trim();
  const desc      = document.getElementById('prodDesc')?.value.trim();
  const categoria = document.getElementById('prodCategoria')?.value;
  const precio    = parseFloat(document.getElementById('prodPrecio')?.value);
  const stock     = parseInt(document.getElementById('prodStock')?.value) || 0;
  const fileInput = document.getElementById('prodFoto');
  if (!nombre || isNaN(precio)) { alert('Nombre y precio son obligatorios.'); return; }

  let foto_url = null;
  if (fileInput?.files[0]) {
    const file = fileInput.files[0];
    const ext = file.name.split('.').pop();
    const path = `productos/${empData.id_emprendimiento}/${Date.now()}.${ext}`;
    const { data: up } = await sb.storage.from('emprendia').upload(path, file, { upsert: true });
    if (up) {
      const { data: url } = sb.storage.from('emprendia').getPublicUrl(path);
      foto_url = url?.publicUrl;
    }
  }

  const { data: prod, error } = await sb.from('producto').insert([{
    id_emprendimiento: empData.id_emprendimiento,
    nombre_producto: nombre, descripcion: desc, categoria, precio, foto_url
  }]).select().single();

  if (error) { alert('Error: ' + error.message); return; }

  await sb.from('inventario').insert([{ id_producto: prod.id_producto, stock_actual: stock, stock_minimo: 5, stock_maximo: 100 }]);
  if (stock === 0) {
    await sb.from('alerta').insert([{ id_producto: prod.id_producto, tipo_alerta: 'STOCK_BAJO', mensaje: `Producto "${nombre}" recién creado con stock 0. Actualiza tu inventario.` }]);
  }

  document.getElementById('prodNombre').value = '';
  document.getElementById('prodDesc').value = '';
  document.getElementById('prodPrecio').value = '';
  document.getElementById('prodStock').value = '';
  const prev = document.getElementById('prodFotoPreview');
  if (prev) prev.innerHTML = '<span>📷</span><p>Seleccionar foto<br><small>JPG, PNG, WEBP, GIF</small></p>';
  toggleFormProducto();
  await cargarCatalogoProductos();
}

async function cargarCatalogoProductos() {
  if (!empData) return;
  const { data } = await sb.from('producto').select('*, inventario(stock_actual)')
    .eq('id_emprendimiento', empData.id_emprendimiento).order('fecha_registro', { ascending: false });
  const grid = document.getElementById('catalogoProductos');
  if (!grid) return;
  if (!data || data.length === 0) { grid.innerHTML = '<p class="cargando">Sin productos aún. ¡Agrega el primero!</p>'; return; }
  grid.innerHTML = data.map(p => {
    const stock = p.inventario?.[0]?.stock_actual ?? '—';
    const foto = p.foto_url ? `<img src="${p.foto_url}" style="width:100%;height:140px;object-fit:cover;">` : `<div class="catalogo-card-img" style="height:140px;">📦</div>`;
    return `
    <div class="catalogo-card">
      <div class="catalogo-card-img">${foto}</div>
      <div class="catalogo-card-body">
        <h4>${p.nombre_producto}</h4>
        <div class="cat">${p.categoria || '—'}</div>
        <div class="precio">Bs. ${parseFloat(p.precio).toFixed(2)}</div>
        <div style="font-size:0.78rem;color:var(--texto-suave)">Stock: ${stock}</div>
        <div style="font-size:0.78rem;color:var(--texto-suave);margin-top:4px">${p.descripcion || ''}</div>
      </div>
      <div class="catalogo-card-btns">
        <button onclick="abrirModalEditar(${JSON.stringify(p).replace(/"/g,'&quot;')})" style="background:var(--gris);color:var(--azul);border:1.5px solid var(--gris-borde);">✏️ Editar</button>
        <button onclick="eliminarProducto(${p.id_producto})" style="background:#fee2e2;color:#991b1b;">🗑️ Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

async function eliminarProducto(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  await sb.from('inventario').delete().eq('id_producto', id);
  await sb.from('alerta').delete().eq('id_producto', id);
  await sb.from('producto').delete().eq('id_producto', id);
  await cargarCatalogoProductos();
}

function abrirModalEditar(prod) {
  document.getElementById('editProdId').value = prod.id_producto;
  document.getElementById('editProdNombre').value = prod.nombre_producto || '';
  document.getElementById('editProdDesc').value = prod.descripcion || '';
  document.getElementById('editProdCategoria').value = prod.categoria || '';
  document.getElementById('editProdPrecio').value = prod.precio || '';
  const prev = document.getElementById('editProdFotoPreview');
  const ph   = document.getElementById('editProdFotoPlaceholder');
  if (prod.foto_url) {
    if (prev) { prev.src = prod.foto_url; prev.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
  } else {
    if (prev) prev.style.display = 'none';
    if (ph) ph.style.display = 'block';
  }
  document.getElementById('modalEditarProducto').style.display = 'flex';
}

function cerrarModalEditar() {
  document.getElementById('modalEditarProducto').style.display = 'none';
}

function previsualizarFotoEditar(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('editProdFotoPreview');
    const ph   = document.getElementById('editProdFotoPlaceholder');
    if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function guardarEdicionProducto() {
  const id        = document.getElementById('editProdId')?.value;
  const nombre    = document.getElementById('editProdNombre')?.value.trim();
  const desc      = document.getElementById('editProdDesc')?.value.trim();
  const categoria = document.getElementById('editProdCategoria')?.value;
  const precio    = parseFloat(document.getElementById('editProdPrecio')?.value);
  const fileInput = document.getElementById('editProdFoto');
  if (!nombre || isNaN(precio)) { alert('Nombre y precio son obligatorios.'); return; }

  let updates = { nombre_producto: nombre, descripcion: desc, categoria, precio };

  if (fileInput?.files[0]) {
    const file = fileInput.files[0];
    const ext = file.name.split('.').pop();
    const path = `productos/${empData.id_emprendimiento}/${id}_edit.${ext}`;
    const { data: up } = await sb.storage.from('emprendia').upload(path, file, { upsert: true });
    if (up) {
      const { data: url } = sb.storage.from('emprendia').getPublicUrl(path);
      updates.foto_url = url?.publicUrl;
    }
  }

  const { error } = await sb.from('producto').update(updates).eq('id_producto', id);
  if (error) { alert('Error: ' + error.message); return; }
  cerrarModalEditar();
  await cargarCatalogoProductos();
}

// ── ÓRDENES ──
async function cargarOrdenes() {
  if (!empData) return;
  const { data } = await sb.from('orden').select('*, usuario(nombre, apellido)')
    .eq('id_emprendimiento', empData.id_emprendimiento).order('fecha_orden', { ascending: false });
  const tbody = document.getElementById('cuerpoOrdenes');
  if (!tbody) return;
  if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="cargando">Sin órdenes aún</td></tr>'; return; }
  tbody.innerHTML = data.map(o => {
    const estadoClass = { en_espera: 'badge-amarillo', en_camino: 'badge-azul', completado: 'badge-verde', rechazado: 'badge-rojo' }[o.estado_envio] || 'badge-azul';
    return `<tr>
      <td><strong>#${o.id_orden}</strong></td>
      <td>${o.usuario?.nombre || '—'} ${o.usuario?.apellido || ''}</td>
      <td>${o.detalle_productos || '—'}</td>
      <td>${o.unidades || '—'}</td>
      <td><strong>Bs. ${parseFloat(o.total || 0).toFixed(2)}</strong></td>
      <td><span class="badge ${estadoClass}">${o.estado_envio || '—'}</span></td>
      <td>${o.metodo_entrega || '—'}</td>
      <td>${o.lugar_entrega || '—'}</td>
      <td>${o.fecha_entrega ? formatFechaHora(o.fecha_entrega) : '—'}</td>
      <td><button class="btn-azul" style="padding:6px 12px;font-size:0.8rem;" onclick="abrirModalOrden(${o.id_orden})">✏️ Gestionar</button></td>
    </tr>`;
  }).join('');
}

let ordenActualId = null;
async function abrirModalOrden(id) {
  ordenActualId = id;
  const { data: o } = await sb.from('orden').select('*, usuario(nombre, apellido)')
    .eq('id_orden', id).single();
  if (!o) return;
  document.getElementById('modalOrdenId').textContent = '#' + id;
  document.getElementById('modalOrdenComprador').textContent = (o.usuario?.nombre || '—') + ' ' + (o.usuario?.apellido || '');
  document.getElementById('modalOrdenProductos').innerHTML = o.detalle_productos || '—';
  document.getElementById('modalOrdenTotal').textContent = 'Bs. ' + parseFloat(o.total || 0).toFixed(2);
  document.getElementById('modalOrdenEstado').value = o.estado_envio || 'en_espera';
  document.getElementById('modalOrdenMetodo').value = o.metodo_entrega || 'Físico';
  document.getElementById('modalOrdenLugar').value = o.lugar_entrega || '';
  document.getElementById('modalOrdenFecha').value = o.fecha_entrega ? o.fecha_entrega.slice(0, 16) : '';
  document.getElementById('modalOrdenNota').value = o.nota || '';
  document.getElementById('modalOrden').style.display = 'flex';
}

function cerrarModalOrden() {
  document.getElementById('modalOrden').style.display = 'none';
}

async function guardarDetalleOrden() {
  if (!ordenActualId) return;
  const updates = {
    estado_envio:   document.getElementById('modalOrdenEstado')?.value,
    metodo_entrega: document.getElementById('modalOrdenMetodo')?.value,
    lugar_entrega:  document.getElementById('modalOrdenLugar')?.value,
    fecha_entrega:  document.getElementById('modalOrdenFecha')?.value || null,
    nota:           document.getElementById('modalOrdenNota')?.value
  };
  const { error } = await sb.from('orden').update(updates).eq('id_orden', ordenActualId);
  if (error) { alert('Error: ' + error.message); return; }
  cerrarModalOrden();
  await cargarOrdenes();
  alert('✅ Orden actualizada correctamente.');
}

// ── COMPRADORES ──
async function cargarCompradores() {
  if (!empData) return;
  const { data: ordenes } = await sb.from('orden').select('id_comprador').eq('id_emprendimiento', empData.id_emprendimiento);
  const ids = [...new Set((ordenes || []).map(o => o.id_comprador))].filter(Boolean);
  const grid = document.getElementById('gridCompradores');
  if (!grid) return;
  if (!ids.length) { grid.innerHTML = '<p class="cargando">Aún no tienes compradores.</p>'; return; }
  const { data: usuarios } = await sb.from('usuario').select('*').in('id_usuario', ids);
  if (!usuarios || usuarios.length === 0) { grid.innerHTML = '<p class="cargando">Sin compradores aún.</p>'; return; }
  grid.innerHTML = await Promise.all(usuarios.map(async u => {
    const { count: nCompras } = await sb.from('orden').select('*', { count: 'exact', head: true })
      .eq('id_comprador', u.id_usuario).eq('id_emprendimiento', empData.id_emprendimiento);
    const { data: ultimaOrden } = await sb.from('orden').select('total')
      .eq('id_comprador', u.id_usuario).eq('id_emprendimiento', empData.id_emprendimiento);
    const totalGastado = (ultimaOrden || []).reduce((s, o) => s + parseFloat(o.total || 0), 0);
    const ultimoAcceso = u.ultimo_acceso ? new Date(u.ultimo_acceso) : null;
    const ahora = new Date();
    const diffMin = ultimoAcceso ? Math.floor((ahora - ultimoAcceso) / 60000) : 9999;
    const activo = diffMin < 10;
    const diasAtras = ultimoAcceso ? Math.floor((ahora - ultimoAcceso) / 86400000) : null;
    const estadoTexto = activo ? '🟢 En línea' : (diasAtras !== null ? `⚫ Hace ${diasAtras} día${diasAtras !== 1 ? 's' : ''}` : '⚫ Sin acceso');
    return `
    <div class="comprador-card">
      <div class="comprador-card-header">
        <div class="comprador-avatar">${u.foto_url ? `<img src="${u.foto_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">` : '👤'}</div>
        <div>
          <div class="comprador-nombre">${u.nombre} ${u.apellido}</div>
          <div class="comprador-id">ID: ${u.id_usuario}</div>
          <div style="font-size:0.78rem;margin-top:2px;">${estadoTexto}</div>
        </div>
      </div>
      <div class="comprador-stats">
        <div class="comp-stat"><span class="comp-stat-num">${nCompras || 0}</span><span class="comp-stat-lab">Compras</span></div>
        <div class="comp-stat"><span class="comp-stat-num">Bs.${totalGastado.toFixed(0)}</span><span class="comp-stat-lab">Total</span></div>
      </div>
      <button class="btn-azul" style="width:100%;padding:8px;font-size:0.82rem;" onclick="abrirHistorialComprador(${u.id_usuario})">🔍 Ver Historial</button>
    </div>`;
  })).then(cards => cards.join(''));
}

async function abrirHistorialComprador(idUsuario) {
  const { data: u } = await sb.from('usuario').select('*').eq('id_usuario', idUsuario).single();
  if (!u) return;
  const { data: ordenes } = await sb.from('orden').select('*')
    .eq('id_comprador', idUsuario).eq('id_emprendimiento', empData.id_emprendimiento)
    .order('fecha_orden', { ascending: false });
  const total = (ordenes || []).reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const ultimoAcceso = u.ultimo_acceso ? new Date(u.ultimo_acceso) : null;
  const ahora = new Date();
  const diffMin = ultimoAcceso ? Math.floor((ahora - ultimoAcceso) / 60000) : 9999;
  const activo = diffMin < 10;

  document.getElementById('modalCompradorNombre').textContent = u.nombre + ' ' + u.apellido;
  document.getElementById('modalCompradorId').textContent = 'ID: ' + u.id_usuario;
  const estadoEl = document.getElementById('modalCompradorEstado');
  if (estadoEl) { estadoEl.textContent = activo ? '🟢 En línea' : '⚫ Inactivo'; estadoEl.style.background = activo ? '#dcfce7' : '#f1f5f9'; estadoEl.style.color = activo ? '#166534' : '#64748b'; estadoEl.style.padding = '3px 10px'; estadoEl.style.borderRadius = '100px'; estadoEl.style.fontSize = '0.78rem'; }
  document.getElementById('modalCompradorCompras').textContent = ordenes?.length || 0;
  document.getElementById('modalCompradorTotal').textContent = 'Bs. ' + total.toFixed(2);
  const fotoEl = document.getElementById('modalCompradorFoto');
  const iconEl = document.getElementById('modalCompradorFotoIcon');
  if (u.foto_url) { if (fotoEl) { fotoEl.src = u.foto_url; fotoEl.style.display = 'block'; } if (iconEl) iconEl.style.display = 'none'; }
  const tbody = document.getElementById('modalCompradorHistorial');
  if (tbody) {
    tbody.innerHTML = (!ordenes || ordenes.length === 0)
      ? '<tr><td colspan="6" class="cargando">Sin compras aún</td></tr>'
      : ordenes.map(o => {
          const estadoClass = { en_espera: 'badge-amarillo', en_camino: 'badge-azul', completado: 'badge-verde', rechazado: 'badge-rojo' }[o.estado_envio] || 'badge-azul';
          const f = new Date(o.fecha_orden);
          return `<tr>
            <td>${f.toLocaleDateString('es-BO')}</td>
            <td>${f.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
            <td>${o.detalle_productos || '—'}</td>
            <td>${o.unidades || '—'}</td>
            <td>Bs. ${parseFloat(o.total || 0).toFixed(2)}</td>
            <td><span class="badge ${estadoClass}">${o.estado_envio || '—'}</span></td>
          </tr>`;
        }).join('');
  }
  document.getElementById('modalComprador').style.display = 'flex';
}

function cerrarModalComprador() {
  document.getElementById('modalComprador').style.display = 'none';
}

// ── MÉTODOS DE PAGO ──
async function cargarMetodosPago() {
  if (!empData) return;
  const { data } = await sb.from('metodo_pago').select('*').eq('id_emprendimiento', empData.id_emprendimiento).single();
  const toggleEfec = document.getElementById('toggleEfectivo');
  if (toggleEfec && data) toggleEfec.checked = data.acepta_efectivo || false;
  await cargarQRs();
  await cargarLugaresEntrega();
}

async function cargarQRs() {
  if (!empData) return;
  const { data } = await sb.from('qr_pago').select('*').eq('id_emprendimiento', empData.id_emprendimiento);
  const lista = document.getElementById('listaQRs');
  if (!lista) return;
  lista.innerHTML = (!data || data.length === 0)
    ? '<p style="color:var(--texto-suave);font-size:0.85rem;">Sin QRs agregados aún.</p>'
    : data.map(q => `<div class="qr-item"><img src="${q.url_imagen}" alt="QR"><button class="qr-eliminar" onclick="eliminarQR(${q.id_qr})">✕</button></div>`).join('');
}

async function agregarQR(event) {
  if (!empData) return;
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop();
  const path = `qrs/${empData.id_emprendimiento}/${Date.now()}.${ext}`;
  const { data: up } = await sb.storage.from('emprendia').upload(path, file, { upsert: true });
  if (!up) { alert('Error subiendo QR'); return; }
  const { data: url } = sb.storage.from('emprendia').getPublicUrl(path);
  await sb.from('qr_pago').insert([{ id_emprendimiento: empData.id_emprendimiento, url_imagen: url.publicUrl }]);
  event.target.value = '';
  await cargarQRs();
}

async function eliminarQR(id) {
  await sb.from('qr_pago').delete().eq('id_qr', id);
  await cargarQRs();
}

async function guardarMetodoPago() {
  if (!empData) return;
  const acepta = document.getElementById('toggleEfectivo')?.checked || false;
  const { data: exist } = await sb.from('metodo_pago').select('id_metodo').eq('id_emprendimiento', empData.id_emprendimiento).single();
  if (exist) {
    await sb.from('metodo_pago').update({ acepta_efectivo: acepta }).eq('id_emprendimiento', empData.id_emprendimiento);
  } else {
    await sb.from('metodo_pago').insert([{ id_emprendimiento: empData.id_emprendimiento, acepta_efectivo: acepta }]);
  }
}

async function cargarLugaresEntrega() {
  if (!empData) return;
  const { data } = await sb.from('lugar_entrega').select('*').eq('id_emprendimiento', empData.id_emprendimiento);
  const lista = document.getElementById('listaEntregas');
  if (!lista) return;
  lista.innerHTML = (!data || data.length === 0)
    ? '<p style="color:var(--texto-suave);font-size:0.85rem;">Sin lugares de entrega aún.</p>'
    : data.map(l => `<div class="entrega-chip">${l.tipo} · ${l.lugar}<button onclick="eliminarLugar(${l.id_lugar})">✕</button></div>`).join('');
}

async function agregarLugarEntrega() {
  if (!empData) return;
  const tipo  = document.getElementById('tipoEntrega')?.value;
  const lugar = document.getElementById('lugarEntrega')?.value.trim();
  if (!lugar) { alert('Ingresa un lugar.'); return; }
  await sb.from('lugar_entrega').insert([{ id_emprendimiento: empData.id_emprendimiento, tipo, lugar }]);
  document.getElementById('lugarEntrega').value = '';
  await cargarLugaresEntrega();
}

async function eliminarLugar(id) {
  await sb.from('lugar_entrega').delete().eq('id_lugar', id);
  await cargarLugaresEntrega();
}

// ── INVENTARIO ──
async function cargarInventario() {
  const ids = await getProductIds();
  const tbody = document.getElementById('tablaInventario');
  if (!tbody) return;
  if (!ids.length) { tbody.innerHTML = '<tr><td colspan="5" class="cargando">Sin productos</td></tr>'; return; }
  const { data } = await sb.from('inventario').select('*, producto(nombre_producto)').in('id_producto', ids).order('ultima_actualizacion', { ascending: false });
  tbody.innerHTML = (!data || data.length === 0)
    ? '<tr><td colspan="5" class="cargando">Sin inventario aún</td></tr>'
    : data.map(i => `<tr>
        <td><strong>${i.producto?.nombre_producto || '—'}</strong></td>
        <td><span class="badge ${i.stock_actual <= i.stock_minimo ? 'badge-rojo' : 'badge-verde'}">${i.stock_actual}</span></td>
        <td>${i.stock_minimo}</td>
        <td>${i.stock_maximo ?? '—'}</td>
        <td>${formatFechaHora(i.ultima_actualizacion)}</td>
      </tr>`).join('');
}

// ── TRANSACCIONES ──
function toggleFormTrans() {
  document.getElementById('formTrans')?.classList.toggle('oculto');
}

async function agregarTransaccion() {
  if (!empData) return;
  const monto = parseFloat(document.getElementById('transMonto')?.value);
  const tipo  = document.getElementById('transTipo')?.value;
  const desc  = document.getElementById('transDesc')?.value.trim();
  if (isNaN(monto) || monto <= 0) { alert('Ingresa un monto válido.'); return; }
  const { error } = await sb.from('transaccion').insert([{ id_emprendimiento: empData.id_emprendimiento, monto, tipo, descripcion: desc }]);
  if (error) { alert('Error: ' + error.message); return; }
  document.getElementById('transMonto').value = '';
  document.getElementById('transDesc').value = '';
  toggleFormTrans();
  await cargarTransacciones();
  await cargarResumen();
}

async function cargarTransacciones() {
  if (!empData) return;
  const { data } = await sb.from('transaccion').select('*').eq('id_emprendimiento', empData.id_emprendimiento).order('fecha_transaccion', { ascending: false });
  const tbody = document.getElementById('tablaTransacciones');
  if (!tbody) return;
  tbody.innerHTML = (!data || data.length === 0)
    ? '<tr><td colspan="4" class="cargando">Sin transacciones aún</td></tr>'
    : data.map(t => `<tr>
        <td><span class="badge ${t.tipo === 'INGRESO' ? 'badge-verde' : 'badge-rojo'}">${t.tipo}</span></td>
        <td>Bs. ${parseFloat(t.monto).toFixed(2)}</td>
        <td>${t.descripcion || '—'}</td>
        <td>${formatFechaHora(t.fecha_transaccion)}</td>
      </tr>`).join('');
}

// ── ALERTAS ──
async function cargarAlertas() {
  const ids = await getProductIds();
  const tbody = document.getElementById('tablaAlertas');
  if (!tbody) return;
  if (!ids.length) { tbody.innerHTML = '<tr><td colspan="5" class="cargando">Sin alertas</td></tr>'; return; }
  const { data } = await sb.from('alerta').select('*, producto(nombre_producto)').in('id_producto', ids).order('fecha_alerta', { ascending: false });
  tbody.innerHTML = (!data || data.length === 0)
    ? '<tr><td colspan="5" class="cargando">Sin alertas</td></tr>'
    : data.map(a => `<tr>
        <td>${a.producto?.nombre_producto || '—'}</td>
        <td>${a.tipo_alerta || '—'}</td>
        <td>${a.mensaje || '—'}</td>
        <td><span class="badge ${a.estado === 'PENDIENTE' ? 'badge-amarillo' : 'badge-verde'}">${a.estado}</span></td>
        <td>${formatFechaHora(a.fecha_alerta)}</td>
      </tr>`).join('');
}

// ── PREDICCIONES ──
async function cargarPredicciones() {
  const ids = await getProductIds();
  const tbody = document.getElementById('tablaPredicciones');
  if (!tbody) return;
  if (!ids.length) { tbody.innerHTML = '<tr><td colspan="5" class="cargando">Sin predicciones</td></tr>'; return; }
  const { data } = await sb.from('prediccion_ia').select('*, producto(nombre_producto)').in('id_producto', ids).order('fecha_prediccion', { ascending: false });
  tbody.innerHTML = (!data || data.length === 0)
    ? '<tr><td colspan="5" class="cargando">Sin predicciones aún</td></tr>'
    : data.map(p => `<tr>
        <td>${p.producto?.nombre_producto || '—'}</td>
        <td>${p.ventas_estimadas ?? '—'}</td>
        <td>${p.stock_recomendado ?? '—'}</td>
        <td>${p.nivel_confianza ? p.nivel_confianza + '%' : '—'}</td>
        <td>${formatFecha(p.fecha_prediccion)}</td>
      </tr>`).join('');
}

// ── ANÁLISIS IA VENTAS EMPRENDEDOR ──
let chartDiaEmp = null;
let chartMesEmp = null;

async function cargarIAVentasEmprendedor() {
  if (!empData) return;
  const { data: ventas } = await sb.from('transaccion').select('monto, fecha_transaccion')
    .eq('id_emprendimiento', empData.id_emprendimiento).eq('tipo', 'INGRESO').order('fecha_transaccion', { ascending: false });

  // Últimos 7 días
  const dias7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric' });
    const total = (ventas || []).filter(v => v.fecha_transaccion?.startsWith(key)).reduce((s, v) => s + parseFloat(v.monto), 0);
    dias7.push({ label, total });
  }

  // Por mes
  const meses12 = [];
  const anio = new Date().getFullYear();
  for (let m = 1; m <= 12; m++) {
    const total = (ventas || []).filter(v => {
      const f = new Date(v.fecha_transaccion);
      return f.getFullYear() === anio && f.getMonth() + 1 === m;
    }).reduce((s, v) => s + parseFloat(v.monto), 0);
    meses12.push({ label: formatMes(m).substring(0, 3), total });
  }

  // Gráfico días
  const ctxDia = document.getElementById('chartVentasDia');
  if (ctxDia) {
    if (chartDiaEmp) chartDiaEmp.destroy();
    chartDiaEmp = new Chart(ctxDia, {
      type: 'bar',
      data: { labels: dias7.map(d => d.label), datasets: [{ label: 'Bs.', data: dias7.map(d => d.total), backgroundColor: '#f5a800', borderRadius: 6 }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  // Gráfico meses
  const ctxMes = document.getElementById('chartVentasMes');
  if (ctxMes) {
    if (chartMesEmp) chartMesEmp.destroy();
    chartMesEmp = new Chart(ctxMes, {
      type: 'line',
      data: { labels: meses12.map(m => m.label), datasets: [{ label: 'Bs.', data: meses12.map(m => m.total), borderColor: '#1a3a6b', backgroundColor: 'rgba(26,58,107,0.1)', fill: true, tension: 0.4 }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  // Análisis IA
  await analizarVentasIA();
}

async function analizarVentasIA() {
  const boxEl = document.getElementById('iaAnalisisEmprendedor');
  if (!boxEl) return;
  boxEl.innerHTML = '<div class="ia-loading">🤖 Analizando tus ventas con IA...</div>';
  if (!empData) return;
  const { data: ventas } = await sb.from('transaccion').select('monto, fecha_transaccion')
    .eq('id_emprendimiento', empData.id_emprendimiento).eq('tipo', 'INGRESO').limit(50);
  const prompt = `Eres un asesor de negocios para microemprendedores bolivianos. 
Analiza estos datos de ventas del emprendimiento "${empData.nombre_negocio}" (categoría: ${empData.categoria || 'general'}):
Ventas recientes: ${JSON.stringify((ventas || []).slice(0, 20))}
Indica en 3-4 párrafos cortos:
1. Tendencia actual (subiendo/bajando/estable)
2. Día o periodo de mayor venta
3. Recomendaciones concretas para mejorar
4. Advertencia si las ventas están muy bajas
Responde en español, de forma clara y motivadora.`;
  const respuesta = await llamarIA(prompt);
  boxEl.innerHTML = respuesta.split('\n').map(p => p.trim() ? `<p style="margin-bottom:8px;">${p}</p>` : '').join('');
}

// ── CONFIGURACIÓN EMPRENDEDOR ──
async function cargarConfigEmprendedor() {
  if (!empData) return;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
  el('confNombreNegocio', empData.nombre_negocio);
  el('confCategoriaNegocio', empData.categoria);
  el('confCelular', empData.telefono);

  if (empData.foto_url) {
    const prev = document.getElementById('fotoPreviewEmp');
    const ph   = document.getElementById('fotoPlaceholderEmp');
    if (prev) { prev.src = empData.foto_url; prev.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
  }
}

async function cargarFotoEmprendedorHeader() {
  if (empData?.foto_url) {
    // Si tienes foto en header, ponla aquí
  }
}

function previsualizarFotoEmp(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('fotoPreviewEmp');
    const ph   = document.getElementById('fotoPlaceholderEmp');
    if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function guardarFotoEmprendedor() {
  if (!empData) return;
  const fileInput = document.getElementById('inputFotoEmp');
  if (!fileInput?.files[0]) { alert('Selecciona una imagen primero.'); return; }
  const file = fileInput.files[0];
  const ext = file.name.split('.').pop();
  const path = `emprendedores/${empData.id_emprendimiento}/perfil.${ext}`;
  const { data: up, error } = await sb.storage.from('emprendia').upload(path, file, { upsert: true });
  if (error) { alert('Error: ' + error.message); return; }
  const { data: url } = sb.storage.from('emprendia').getPublicUrl(path);
  await sb.from('emprendimiento').update({ foto_url: url.publicUrl }).eq('id_emprendimiento', empData.id_emprendimiento);
  empData.foto_url = url.publicUrl;
  alert('✅ Foto guardada correctamente.');
}

async function guardarDatosNegocio() {
  if (!empData) return;
  const nombre    = document.getElementById('confNombreNegocio')?.value.trim();
  const categoria = document.getElementById('confCategoriaNegocio')?.value;
  const telefono  = document.getElementById('confCelular')?.value.trim();
  const msg = document.getElementById('msgDatosNegocio');
  if (!nombre) { if (msg) msg.textContent = '⚠️ El nombre es obligatorio.'; return; }
  const { error } = await sb.from('emprendimiento').update({ nombre_negocio: nombre, categoria, telefono }).eq('id_emprendimiento', empData.id_emprendimiento);
  if (error) { if (msg) { msg.style.color = '#ef4444'; msg.textContent = '❌ Error: ' + error.message; } return; }
  empData.nombre_negocio = nombre; empData.categoria = categoria; empData.telefono = telefono;
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = '✅ Datos guardados correctamente.'; }
  const subEl = document.getElementById('seccionSub');
  if (subEl) subEl.textContent = '🏪 ' + nombre + (categoria ? ' · ' + categoria : '');
}

async function cambiarCorreoEmp() {
  const correo = document.getElementById('confNuevoCorreo')?.value.trim();
  const msg    = document.getElementById('msgCorreoEmp');
  if (!correo) { if (msg) msg.textContent = '⚠️ Ingresa un correo.'; return; }
  const session = getSession();
  const { error } = await sb.from('usuario').update({ correo }).eq('id_usuario', session.id_usuario);
  if (error) { if (msg) { msg.style.color = '#ef4444'; msg.textContent = '❌ Error: ' + error.message; } return; }
  session.correo = correo; setSession(session);
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = '✅ Correo actualizado.'; }
}

async function cambiarPasswordEmp() {
  const pass1 = document.getElementById('confNuevaPass')?.value;
  const pass2 = document.getElementById('confConfirmarPass')?.value;
  const msg   = document.getElementById('msgPassEmp');
  if (!pass1 || !pass2) { if (msg) msg.textContent = '⚠️ Completa ambos campos.'; return; }
  if (pass1 !== pass2) { if (msg) msg.textContent = '⚠️ Las contraseñas no coinciden.'; return; }
  if (pass1.length < 6) { if (msg) msg.textContent = '⚠️ Mínimo 6 caracteres.'; return; }
  const session = getSession();
  const { error } = await sb.from('usuario').update({ password_hash: pass1 }).eq('id_usuario', session.id_usuario);
  if (error) { if (msg) { msg.style.color = '#ef4444'; msg.textContent = '❌ Error: ' + error.message; } return; }
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = '✅ Contraseña actualizada.'; }
  document.getElementById('confNuevaPass').value = '';
  document.getElementById('confConfirmarPass').value = '';
}

// ── NAVEGACIÓN EMPRENDEDOR ──
function verSeccion(nombre, el) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activo'));
  document.querySelectorAll('.snav').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + nombre);
  if (sec) sec.classList.add('activo');
  if (el) { el.classList.add('active'); el.blur(); }
  const titulos = {
    resumen: ['Mi Emprendimiento', ''],
    productos: ['Gestionar Productos', 'Catálogo de tu negocio'],
    ordenes: ['Estado de Órdenes', 'Flujo y auditoría de pedidos'],
    compradores: ['Perfiles de Compradores', 'Tus clientes'],
    pagos: ['Métodos de Pago', 'QR y efectivo'],
    inventario: ['Inventario', 'Control de stock'],
    transacciones: ['Transacciones', 'Ingresos y egresos'],
    alertas: ['Alertas', 'Notificaciones del sistema'],
    predicciones: ['Predicciones IA', 'Análisis inteligente'],
    'ia-ventas': ['Análisis IA Ventas', 'Tendencias de tu negocio'],
    normas: ['Normas del Sistema', 'Reglas de la plataforma'],
    configuracion: ['Configuración de Perfil', 'Datos de tu negocio']
  };
  const t = titulos[nombre];
  if (t) {
    const tEl = document.getElementById('seccionTitulo');
    const sEl = document.getElementById('seccionSub');
    if (tEl) tEl.textContent = t[0];
    if (sEl && nombre !== 'resumen') sEl.textContent = t[1];
  }
  if (nombre === 'resumen') cargarResumen();
  else if (nombre === 'productos') cargarCatalogoProductos();
  else if (nombre === 'ordenes') cargarOrdenes();
  else if (nombre === 'compradores') cargarCompradores();
  else if (nombre === 'pagos') cargarMetodosPago();
  else if (nombre === 'inventario') cargarInventario();
  else if (nombre === 'transacciones') cargarTransacciones();
  else if (nombre === 'alertas') cargarAlertas();
  else if (nombre === 'predicciones') cargarPredicciones();
  else if (nombre === 'ia-ventas') cargarIAVentasEmprendedor();
  else if (nombre === 'configuracion') cargarConfigEmprendedor();
}

// ============================================================
// ══════════════════════════════════════════════════════════
//  COMPRADOR
// ══════════════════════════════════════════════════════════
// ============================================================
let carrito = [];
let categoriaActiva = '';
let productoActualModal = null;
let pagoSeleccionado = '';
let entregaSeleccionada = '';
let emprendedorActualModal = null;

async function initComprador() {
  const session = requireRol('COMPRADOR');
  if (!session) return;
  const bienEl = document.getElementById('navBienvenida');
  if (bienEl) bienEl.textContent = '👋 Bienvenido, ' + session.nombre;
  const h2 = document.getElementById('bienvenidaCompradorNombre');
  if (h2) h2.textContent = '👋 Bienvenido, ' + session.nombre + ' ' + session.apellido;
  // Registrar visita
  await sb.from('usuario').update({ ultimo_acceso: new Date().toISOString() }).eq('id_usuario', session.id_usuario);
  await cargarProductosComprador();
  await cargarPerfilesEmprendedores();
}

async function cargarProductosComprador() {
  const { data } = await sb.from('producto').select('*, emprendimiento(nombre_negocio, categoria, telefono, foto_url, id_emprendimiento), inventario(stock_actual)')
    .eq('estado', true).order('fecha_registro', { ascending: false });
  window._todosProductos = data || [];
  renderProductos(data || []);
}

function renderProductos(lista) {
  const grid = document.getElementById('productosGrid');
  if (!grid) return;
  const filtro = document.getElementById('buscadorProducto')?.value.toLowerCase() || '';
  let filtrados = lista.filter(p => {
    const matchCat = !categoriaActiva || p.categoria === categoriaActiva || (p.emprendimiento?.categoria === categoriaActiva);
    const matchBusq = !filtro || p.nombre_producto.toLowerCase().includes(filtro) || (p.descripcion || '').toLowerCase().includes(filtro);
    return matchCat && matchBusq;
  });
  if (filtrados.length === 0) { grid.innerHTML = '<div class="cargando-cards">No se encontraron productos.</div>'; return; }
  grid.innerHTML = filtrados.map(p => {
    const inv = p.inventario?.[0];
    const hayStock = inv ? inv.stock_actual > 0 : true;
    const fotoHTML = p.foto_url
      ? `<div class="prod-card-img"><img src="${p.foto_url}" alt="${p.nombre_producto}"></div>`
      : `<div class="prod-card-img" style="background:var(--gris);display:flex;align-items:center;justify-content:center;height:160px;font-size:3rem;">📦</div>`;
    return `
    <div class="producto-card">
      ${fotoHTML}
      <div class="prod-card-body">
        <span class="prod-cat-badge">${p.categoria || p.emprendimiento?.categoria || 'General'}</span>
        <div class="prod-nombre">${p.nombre_producto}</div>
        <div class="prod-negocio">🏪 ${p.emprendimiento?.nombre_negocio || '—'}</div>
        <div class="prod-desc">${(p.descripcion || '').substring(0, 80)}${p.descripcion?.length > 80 ? '...' : ''}</div>
        <div class="prod-precio">Bs. ${parseFloat(p.precio).toFixed(2)} <span>bolivianos</span></div>
      </div>
      <div class="prod-card-btns">
        <button class="btn-ver-prod" onclick="abrirModalProducto(${p.id_producto})">👁️ Ver</button>
        ${hayStock ? `<button class="btn-agregar-prod" onclick='agregarAlCarrito(${JSON.stringify({id:p.id_producto,nombre:p.nombre_producto,precio:p.precio,empId:p.id_emprendimiento})})'>🛒 Agregar</button>` : '<button disabled style="background:#f1f5f9;color:#94a3b8;flex:1;border-radius:8px;border:none;padding:9px;font-size:0.82rem;">Agotado</button>'}
      </div>
    </div>`;
  }).join('');
}

function filtrarProductos() {
  renderProductos(window._todosProductos || []);
}

function filtrarPorCategoria(cat, btn) {
  categoriaActiva = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProductos(window._todosProductos || []);
}

async function abrirModalProducto(idProducto) {
  const { data: p } = await sb.from('producto').select('*, emprendimiento(nombre_negocio, categoria, id_emprendimiento, telefono)')
    .eq('id_producto', idProducto).single();
  if (!p) return;
  productoActualModal = p;
  // Registrar visita
  const session = getSession();
  if (session) {
    await sb.from('visita_producto').insert([{ id_producto: idProducto, id_emprendimiento: p.id_emprendimiento, id_usuario: session.id_usuario }]).then(() => {});
  }
  document.getElementById('modalProdNombre').textContent = p.nombre_producto;
  document.getElementById('modalProdCategoria').textContent = p.categoria || '—';
  document.getElementById('modalProdDesc').textContent = p.descripcion || 'Sin descripción.';
  document.getElementById('modalProdPrecio').textContent = 'Bs. ' + parseFloat(p.precio).toFixed(2);
  document.getElementById('modalProdEmprendedor').textContent = p.emprendimiento?.nombre_negocio || '—';
  const fotoEl = document.getElementById('modalProdFoto');
  const phEl   = document.getElementById('modalProdFotoPlaceholder');
  if (p.foto_url) { if (fotoEl) { fotoEl.src = p.foto_url; fotoEl.style.display = 'block'; } if (phEl) phEl.style.display = 'none'; }
  else { if (fotoEl) fotoEl.style.display = 'none'; if (phEl) phEl.style.display = 'flex'; }

  // Modos de entrega del emprendimiento
  const { data: lugares } = await sb.from('lugar_entrega').select('*').eq('id_emprendimiento', p.id_emprendimiento);
  const entregasEl = document.getElementById('modalEntregaOpciones');
  if (entregasEl) {
    entregasEl.innerHTML = (!lugares || lugares.length === 0)
      ? '<p style="color:var(--texto-suave);font-size:0.85rem;">El emprendedor no ha definido modos de entrega aún.</p>'
      : lugares.map(l => `<div class="entrega-opcion" onclick="seleccionarEntrega('${l.tipo} · ${l.lugar}', this)">${l.tipo === 'Físico' ? '🤝' : l.tipo === 'InDrive' ? '🚗' : '📦'} ${l.tipo} · ${l.lugar}</div>`).join('');
  }

  // Métodos de pago
  const { data: mp } = await sb.from('metodo_pago').select('*').eq('id_emprendimiento', p.id_emprendimiento).single();
  const { data: qrs } = await sb.from('qr_pago').select('*').eq('id_emprendimiento', p.id_emprendimiento);
  const btnEf = document.getElementById('btnEfectivo');
  const btnQR = document.getElementById('btnQR');
  if (btnEf) btnEf.style.display = (mp?.acepta_efectivo) ? 'block' : 'none';
  if (btnQR) btnQR.style.display = (qrs && qrs.length > 0) ? 'block' : 'none';
  document.getElementById('qrDisplay').style.display = 'none';
  document.getElementById('pagoEfectivoMsg').style.display = 'none';
  // Guardar QRs para mostrar al seleccionar
  window._qrsActuales = qrs || [];

  document.getElementById('modalVerProducto').style.display = 'flex';
}

function seleccionarEntrega(opcion, el) {
  entregaSeleccionada = opcion;
  document.querySelectorAll('.entrega-opcion').forEach(e => e.classList.remove('seleccionada'));
  if (el) el.classList.add('seleccionada');
}

function seleccionarPago(tipo) {
  pagoSeleccionado = tipo;
  document.querySelectorAll('.btn-metodo-pago').forEach(b => b.classList.remove('activo'));
  event?.target?.classList.add('activo');
  const qrDiv = document.getElementById('qrDisplay');
  const efDiv = document.getElementById('pagoEfectivoMsg');
  if (tipo === 'qr') {
    if (qrDiv) {
      qrDiv.style.display = 'block';
      const wrap = document.getElementById('qrImagenesWrap');
      if (wrap) wrap.innerHTML = (window._qrsActuales || []).map(q => `<img src="${q.url_imagen}" alt="QR" style="width:140px;height:140px;border-radius:9px;border:2px solid var(--amarillo);">`).join('');
    }
    if (efDiv) efDiv.style.display = 'none';
  } else {
    if (efDiv) efDiv.style.display = 'block';
    if (qrDiv) qrDiv.style.display = 'none';
  }
}

function seleccionarPagoFinal(tipo) {
  pagoSeleccionado = tipo;
  const qrDiv = document.getElementById('pedidoQRDisplay');
  const efDiv = document.getElementById('pedidoEfectivoMsg');
  if (tipo === 'qr') {
    if (qrDiv) {
      qrDiv.style.display = 'block';
      const wrap = document.getElementById('pedidoQRImagenes');
      if (wrap) wrap.innerHTML = (window._qrsActuales || []).map(q => `<img src="${q.url_imagen}" alt="QR">`).join('');
    }
    if (efDiv) efDiv.style.display = 'none';
  } else {
    if (efDiv) efDiv.style.display = 'block';
    if (qrDiv) qrDiv.style.display = 'none';
  }
}

function cerrarModalProducto() {
  document.getElementById('modalVerProducto').style.display = 'none';
}

function agregarAlCarritoDesdeModal() {
  if (!productoActualModal) return;
  agregarAlCarrito({ id: productoActualModal.id_producto, nombre: productoActualModal.nombre_producto, precio: productoActualModal.precio, empId: productoActualModal.id_emprendimiento });
  cerrarModalProducto();
}

function agregarAlCarrito(prod) {
  const existente = carrito.find(c => c.id === prod.id);
  if (existente) existente.qty++;
  else carrito.push({ ...prod, qty: 1 });
  actualizarCarrito();
}

function quitarDelCarrito(id) {
  carrito = carrito.filter(c => c.id !== id);
  actualizarCarrito();
}

function actualizarCarrito() {
  const count = carrito.reduce((s, c) => s + c.qty, 0);
  const el = document.getElementById('carritoCount');
  if (el) el.textContent = count;
  const items = document.getElementById('carritoItems');
  const total = carrito.reduce((s, c) => s + (parseFloat(c.precio) * c.qty), 0);
  if (items) {
    items.innerHTML = carrito.length === 0
      ? '<p class="carrito-vacio">Tu carrito está vacío</p>'
      : carrito.map(c => `
        <div class="carrito-item">
          <div class="carrito-item-info">
            <div class="carrito-item-nombre">${c.nombre} x${c.qty}</div>
            <div class="carrito-item-precio">Bs. ${parseFloat(c.precio).toFixed(2)} c/u · <strong>Bs. ${(parseFloat(c.precio) * c.qty).toFixed(2)}</strong></div>
          </div>
          <button class="btn-quitar" onclick="quitarDelCarrito(${c.id})">✕</button>
        </div>`).join('');
  }
  const totalEl = document.getElementById('carritoTotal');
  if (totalEl) totalEl.textContent = 'Bs. ' + total.toFixed(2);
}

function toggleCarrito() {
  const panel = document.getElementById('carritoPanel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'flex';
}

function abrirModalPedido() {
  if (carrito.length === 0) { alert('⚠️ Agrega productos al carrito primero.'); return; }
  const total = carrito.reduce((s, c) => s + (parseFloat(c.precio) * c.qty), 0);
  const resumen = document.getElementById('resumenPedidoItems');
  if (resumen) {
    resumen.innerHTML = carrito.map(c => `
      <div class="resumen-pedido-item">
        <span>${c.nombre} x${c.qty}</span>
        <span>Bs. ${(parseFloat(c.precio) * c.qty).toFixed(2)}</span>
      </div>`).join('');
  }
  const totalEl = document.getElementById('resumenPedidoTotal');
  if (totalEl) totalEl.textContent = 'Bs. ' + total.toFixed(2);
  // Cargar QRs del primer emprendedor del carrito
  if (carrito[0]?.empId) {
    sb.from('qr_pago').select('*').eq('id_emprendimiento', carrito[0].empId).then(({ data }) => { window._qrsActuales = data || []; });
  }
  document.getElementById('pedidoQRDisplay').style.display = 'none';
  document.getElementById('pedidoEfectivoMsg').style.display = 'none';
  document.getElementById('modalPedido').style.display = 'flex';
}

function cerrarModalPedido() {
  document.getElementById('modalPedido').style.display = 'none';
}

async function enviarPedidoFinal() {
  const session = getSession();
  if (!session) return;
  if (carrito.length === 0) { alert('Carrito vacío.'); return; }
  const modoEntrega = document.getElementById('pedidoModoEntrega')?.value;
  const nota        = document.getElementById('pedidoNota')?.value;
  const total       = carrito.reduce((s, c) => s + (parseFloat(c.precio) * c.qty), 0);
  const detalleStr  = carrito.map(c => `${c.nombre} x${c.qty}`).join(', ');
  const totalUnidades = carrito.reduce((s, c) => s + c.qty, 0);

  // Agrupar por emprendimiento
  const porEmp = {};
  carrito.forEach(c => {
    if (!porEmp[c.empId]) porEmp[c.empId] = [];
    porEmp[c.empId].push(c);
  });

  for (const empId in porEmp) {
    const items = porEmp[empId];
    const subtotal = items.reduce((s, c) => s + (parseFloat(c.precio) * c.qty), 0);
    await sb.from('orden').insert([{
      id_comprador: session.id_usuario,
      id_emprendimiento: parseInt(empId),
      detalle_productos: items.map(c => `${c.nombre} x${c.qty}`).join(', '),
      unidades: items.reduce((s, c) => s + c.qty, 0),
      total: subtotal,
      estado_envio: 'en_espera',
      metodo_entrega: modoEntrega || 'Físico',
      metodo_pago: pagoSeleccionado || 'efectivo',
      nota
    }]);
    // Registrar transacción de ingreso en el emprendimiento
    const { data: emprow } = await sb.from('emprendimiento').select('id_emprendimiento').eq('id_emprendimiento', parseInt(empId)).single();
    if (emprow) {
      await sb.from('transaccion').insert([{
        id_emprendimiento: parseInt(empId),
        monto: subtotal,
        tipo: 'INGRESO',
        descripcion: `Pedido de ${session.nombre}: ${items.map(c => c.nombre + ' x' + c.qty).join(', ')}`
      }]);
    }
  }

  carrito = [];
  actualizarCarrito();
  cerrarModalPedido();
  alert('✅ Pedido enviado correctamente. El emprendedor lo recibirá pronto.');
}

// ── PERFILES EMPRENDEDORES ──
async function cargarPerfilesEmprendedores() {
  const { data } = await sb.from('emprendimiento').select('*').order('nombre_negocio');
  const grid = document.getElementById('gridPerfilesEmp');
  if (!grid) return;
  if (!data || data.length === 0) { grid.innerHTML = '<div class="cargando-cards">Sin emprendedores registrados aún.</div>'; return; }
  grid.innerHTML = await Promise.all(data.map(async e => {
    const { data: resenas } = await sb.from('resena').select('puntuacion').eq('id_emprendimiento', e.id_emprendimiento);
    const promedio = resenas?.length ? (resenas.reduce((s, r) => s + r.puntuacion, 0) / resenas.length).toFixed(1) : '—';
    const fotoHTML = e.foto_url ? `<img src="${e.foto_url}" class="perfil-emp-avatar" alt="foto">` : `<div class="perfil-emp-avatar">🏪</div>`;
    return `
    <div class="perfil-emp-card" onclick="abrirModalPerfilEmp(${e.id_emprendimiento})">
      ${fotoHTML}
      <div class="perfil-emp-nombre">${e.nombre_negocio}</div>
      <span class="prod-cat-badge">${e.categoria || 'General'}</span>
      <div class="rating-mini">⭐ ${promedio} <span style="color:var(--texto-suave);font-weight:400;">(${resenas?.length || 0} reseñas)</span></div>
    </div>`;
  })).then(cards => cards.join(''));
}

async function abrirModalPerfilEmp(idEmp) {
  emprendedorActualModal = idEmp;
  const { data: e } = await sb.from('emprendimiento').select('*').eq('id_emprendimiento', idEmp).single();
  if (!e) return;
  document.getElementById('modalEmpNombre').textContent = e.nombre_negocio;
  document.getElementById('modalEmpCategoria').textContent = e.categoria || 'General';
  const fotoEl = document.getElementById('modalEmpFoto');
  const iconEl = document.getElementById('modalEmpFotoIcon');
  if (e.foto_url) { if (fotoEl) { fotoEl.src = e.foto_url; fotoEl.style.display = 'block'; } if (iconEl) iconEl.style.display = 'none'; }
  else { if (fotoEl) fotoEl.style.display = 'none'; if (iconEl) iconEl.style.display = 'flex'; }

  // Rating
  const { data: resenas } = await sb.from('resena').select('*, usuario(nombre, apellido)').eq('id_emprendimiento', idEmp).order('fecha_resena', { ascending: false });
  const promedio = resenas?.length ? (resenas.reduce((s, r) => s + r.puntuacion, 0) / resenas.length) : 0;
  document.getElementById('modalEmpRatingNum').textContent = promedio ? promedio.toFixed(1) : '—';
  document.getElementById('modalEmpTotalResenas').textContent = `(${resenas?.length || 0} reseñas)`;
  const estrellasEl = document.getElementById('modalEmpEstrellas');
  if (estrellasEl) {
    estrellasEl.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="estrella ${i < Math.round(promedio) ? 'llena' : ''}">★</span>`).join('');
  }
  const listaEl = document.getElementById('listaResenas');
  if (listaEl) {
    listaEl.innerHTML = (!resenas || resenas.length === 0)
      ? '<p style="color:var(--texto-suave);font-size:0.85rem;">Sin reseñas aún.</p>'
      : resenas.map(r => `
        <div class="resena-item">
          <div class="resena-header">
            <span class="resena-autor">${r.usuario?.nombre || '—'} ${'★'.repeat(r.puntuacion)}</span>
            <span class="resena-fecha">${formatFecha(r.fecha_resena)}</span>
          </div>
          <div class="resena-texto">${r.comentario || ''}</div>
        </div>`).join('');
  }
  // Reset estrellas input
  estrellasSeleccionadas = 0;
  document.querySelectorAll('.estrella-inp').forEach(e => e.classList.remove('seleccionada'));
  document.getElementById('resenaTexto').value = '';
  document.getElementById('msgResena').textContent = '';

  // Productos del emprendedor
  const { data: prods } = await sb.from('producto').select('*').eq('id_emprendimiento', idEmp).eq('estado', true);
  const prodsEl = document.getElementById('modalEmpProductos');
  if (prodsEl) {
    prodsEl.innerHTML = (!prods || prods.length === 0)
      ? '<p style="color:var(--texto-suave);padding:20px;">Sin productos disponibles.</p>'
      : prods.map(p => `
        <div class="producto-card" style="cursor:default;">
          <div class="prod-card-img">${p.foto_url ? `<img src="${p.foto_url}" alt="${p.nombre_producto}">` : `<div style="height:160px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--gris);">📦</div>`}</div>
          <div class="prod-card-body">
            <div class="prod-nombre">${p.nombre_producto}</div>
            <div class="prod-precio">Bs. ${parseFloat(p.precio).toFixed(2)}</div>
            <div class="prod-desc">${p.descripcion || ''}</div>
          </div>
          <div class="prod-card-btns">
            <button class="btn-agregar-prod" onclick='agregarAlCarrito(${JSON.stringify({id:p.id_producto,nombre:p.nombre_producto,precio:p.precio,empId:p.id_emprendimiento})})' style="width:100%;">🛒 Agregar</button>
          </div>
        </div>`).join('');
  }
  document.getElementById('modalPerfilEmp').style.display = 'flex';
}

function seleccionarEstrella(num) {
  estrellasSeleccionadas = num;
  document.querySelectorAll('.estrella-inp').forEach((e, i) => {
    e.classList.toggle('seleccionada', i < num);
  });
}

async function enviarResena() {
  const session = getSession();
  const msg = document.getElementById('msgResena');
  if (!session || !emprendedorActualModal) return;
  if (!estrellasSeleccionadas) { if (msg) msg.textContent = '⚠️ Selecciona una puntuación.'; return; }
  const comentario = document.getElementById('resenaTexto')?.value.trim();
  const { error } = await sb.from('resena').insert([{
    id_usuario: session.id_usuario,
    id_emprendimiento: emprendedorActualModal,
    puntuacion: estrellasSeleccionadas,
    comentario
  }]);
  if (error) { if (msg) { msg.style.color = '#ef4444'; msg.textContent = '❌ ' + error.message; } return; }
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = '✅ Reseña enviada. ¡Gracias!'; }
  await abrirModalPerfilEmp(emprendedorActualModal);
}

function cerrarModalPerfilEmp() {
  document.getElementById('modalPerfilEmp').style.display = 'none';
}

function cambiarTab(nombre, btn) {
  document.querySelectorAll('.tab-contenido').forEach(t => t.classList.remove('activo'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + nombre)?.classList.add('activo');
  if (btn) btn.classList.add('active');
  if (nombre === 'perfiles') cargarPerfilesEmprendedores();
}

// ============================================================
// ══════════════════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════════════════
// ============================================================
let empActualAdmin = null;
let chartTorta = null;

async function initAdmin() {
  const session = requireRol('ADMINISTRADOR');
  if (!session) return;
  cargarFotoAdmin(session);
  await cargarUsuariosAdmin();
}

async function cargarFotoAdmin(session) {
  const el = document.getElementById('adminNombreMini');
  if (el) el.textContent = session.nombre + ' ' + session.apellido;
  const correoEl = document.getElementById('adminCorreoMini');
  if (correoEl) correoEl.textContent = session.correo;
}

async function cargarUsuariosAdmin() {
  const { data } = await sb.from('usuario').select('*').order('fecha_registro', { ascending: false });
  const total = data?.length || 0;
  const emp   = data?.filter(u => u.rol === 'EMPRENDEDOR').length || 0;
  const comp  = data?.filter(u => u.rol === 'COMPRADOR').length || 0;
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('totalUsuarios', total);
  setEl('totalEmprendedores', emp);
  setEl('totalCompradores', comp);
  const tbody = document.getElementById('tablaUsuarios');
  if (tbody) {
    tbody.innerHTML = (data || []).map(u => `
      <tr>
        <td>${u.nombre} ${u.apellido}</td>
        <td>${u.correo}</td>
        <td><span class="badge badge-azul">${u.rol}</span></td>
        <td><span class="badge ${u.estado ? 'badge-verde' : 'badge-rojo'}">${u.estado ? 'Activo' : 'Inactivo'}</span></td>
        <td>${formatFecha(u.fecha_registro)}</td>
      </tr>`).join('');
  }
}

async function cargarEmprendimientosAdmin() {
  const { data } = await sb.from('emprendimiento').select('*, usuario(nombre, apellido)').order('fecha_creacion', { ascending: false });
  const tbody = document.getElementById('tablaEmprendimientos');
  if (!tbody) return;
  tbody.innerHTML = (!data || data.length === 0)
    ? '<tr><td colspan="6" class="cargando">Sin emprendimientos</td></tr>'
    : data.map(e => {
        const suspendido = e.estado === false || e.suspendido === true;
        return `<tr>
          <td><strong>${e.nombre_negocio}</strong></td>
          <td>${e.usuario?.nombre || '—'} ${e.usuario?.apellido || ''}</td>
          <td>${e.categoria || '—'}</td>
          <td><span class="badge ${e.infraccion ? 'badge-rojo' : 'badge-verde'}">${e.infraccion || '✅ Sin infracciones'}</span></td>
          <td><span class="badge ${suspendido ? 'badge-rojo' : 'badge-verde'}">${suspendido ? 'Suspendido' : 'Activo'}</span></td>
          <td><button class="btn-azul" style="padding:6px 12px;font-size:0.8rem;" onclick="verAccionesEmp(${e.id_emprendimiento})">👁️ Ver Acciones</button></td>
        </tr>`;
      }).join('');
}

async function verAccionesEmp(id) {
  empActualAdmin = id;
  const { data: e } = await sb.from('emprendimiento').select('*, usuario(nombre, apellido)').eq('id_emprendimiento', id).single();
  if (!e) return;
  document.getElementById('modalEmpNombre').textContent = e.nombre_negocio + ' — ' + (e.usuario?.nombre || '');
  const { data: prods } = await sb.from('producto').select('*').eq('id_emprendimiento', id);
  const modalProds = document.getElementById('modalProductos');
  if (modalProds) {
    modalProds.innerHTML = (!prods || prods.length === 0)
      ? '<p style="color:var(--texto-suave);">Sin productos.</p>'
      : prods.map(p => `<div style="padding:8px;background:var(--gris);border-radius:8px;margin-bottom:6px;font-size:0.88rem;"><strong>${p.nombre_producto}</strong> — Bs. ${parseFloat(p.precio).toFixed(2)} — ${p.categoria || 'Sin categoría'}</div>`).join('');
  }
  const suspendido = e.estado === false || e.suspendido === true;
  const btnS = document.getElementById('btnSuspender');
  const btnA = document.getElementById('btnActivar');
  if (btnS) btnS.style.display = suspendido ? 'none' : 'block';
  if (btnA) btnA.style.display = suspendido ? 'block' : 'none';

  // Análisis IA infracciones
  const iaEl = document.getElementById('modalIAAnalisis');
  if (iaEl) {
    iaEl.innerHTML = '🤖 Analizando con IA...';
    const productosStr = (prods || []).map(p => p.nombre_producto + ' (' + (p.categoria || '') + ')').join(', ');
    const prompt = `Eres un auditor de una plataforma de microemprendedores boliviana. 
Analiza los siguientes productos de la tienda "${e.nombre_negocio}" (categoría: ${e.categoria}):
Productos: ${productosStr || 'Sin productos'}
Detecta si hay posibles infracciones como: productos ilegales, nombres sospechosos, posible falsificación, o algo que viole las normas de la plataforma.
Responde en 2-3 oraciones concisas indicando si hay riesgo BAJO, MEDIO o ALTO de infracción y por qué.`;
    const respuesta = await llamarIA(prompt);
    iaEl.textContent = respuesta;
  }
  document.getElementById('modalAcciones').style.display = 'flex';
}

async function cambiarEstadoEmprendimiento() {
  if (!empActualAdmin) return;
  const { data: e } = await sb.from('emprendimiento').select('suspendido, estado').eq('id_emprendimiento', empActualAdmin).single();
  const nuevoEstado = !(e?.suspendido || e?.estado === false);
  await sb.from('emprendimiento').update({ suspendido: nuevoEstado, estado: !nuevoEstado }).eq('id_emprendimiento', empActualAdmin);
  cerrarModal();
  await cargarEmprendimientosAdmin();
  alert(nuevoEstado ? '⛔ Emprendimiento suspendido.' : '✅ Emprendimiento activado.');
}

function cerrarModal() {
  document.getElementById('modalAcciones').style.display = 'none';
}

// ── VENTAS GLOBALES ADMIN ──
async function cargarVentasGlobalesAdmin() {
  const { data: ventas } = await sb.from('transaccion').select('monto, fecha_transaccion, tipo').eq('tipo', 'INGRESO').order('fecha_transaccion', { ascending: false });
  const hoy = fechaHoyISO();
  const { mes, anio } = mesActual();

  let ventasHoyN = 0, montoHoy = 0, ventasMesN = 0, montoMes = 0;
  (ventas || []).forEach(v => {
    const f = new Date(v.fecha_transaccion);
    const monto = parseFloat(v.monto);
    if (v.fecha_transaccion?.startsWith(hoy)) { ventasHoyN++; montoHoy += monto; }
    if (f.getMonth() + 1 === mes && f.getFullYear() === anio) { ventasMesN++; montoMes += monto; }
  });

  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('ventasHoy', ventasHoyN);
  setEl('totalVentasHoy', 'Bs. ' + montoHoy.toFixed(2));
  setEl('ventasMes', ventasMesN);
  setEl('totalVentasMes', 'Bs. ' + montoMes.toFixed(2));

  const fi = document.getElementById('exportFechaHora');
  if (fi) fi.textContent = 'Última actualización: ' + new Date().toLocaleString('es-BO');

  // Por día
  const porDia = {};
  (ventas || []).forEach(v => {
    const key = v.fecha_transaccion?.split('T')[0];
    if (!key) return;
    if (!porDia[key]) porDia[key] = { n: 0, total: 0 };
    porDia[key].n++;
    porDia[key].total += parseFloat(v.monto);
  });
  const tbody1 = document.getElementById('cuerpoVentasDia');
  if (tbody1) {
    const keys = Object.keys(porDia).sort().reverse().slice(0, 30);
    tbody1.innerHTML = keys.length === 0
      ? '<tr><td colspan="4" class="cargando">Sin ventas</td></tr>'
      : keys.map(k => `<tr><td>${k}</td><td>${porDia[k].n}</td><td>Bs. ${porDia[k].total.toFixed(2)}</td><td>${new Date().toLocaleString('es-BO')}</td></tr>`).join('');
  }

  // Por mes
  const porMes = {};
  (ventas || []).forEach(v => {
    const f = new Date(v.fecha_transaccion);
    const key = f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0');
    if (!porMes[key]) porMes[key] = { n: 0, total: 0, mes: f.getMonth() + 1, anio: f.getFullYear() };
    porMes[key].n++;
    porMes[key].total += parseFloat(v.monto);
  });
  const tbody2 = document.getElementById('cuerpoVentasMes');
  if (tbody2) {
    const keys = Object.keys(porMes).sort().reverse();
    tbody2.innerHTML = keys.length === 0
      ? '<tr><td colspan="4" class="cargando">Sin ventas</td></tr>'
      : keys.map(k => `<tr><td>${formatMes(porMes[k].mes)}</td><td>${porMes[k].anio}</td><td>${porMes[k].n}</td><td>Bs. ${porMes[k].total.toFixed(2)}</td></tr>`).join('');
  }

  // Por año
  const porAnio = {};
  (ventas || []).forEach(v => {
    const a = new Date(v.fecha_transaccion).getFullYear();
    if (!porAnio[a]) porAnio[a] = { n: 0, total: 0 };
    porAnio[a].n++;
    porAnio[a].total += parseFloat(v.monto);
  });
  const tbody3 = document.getElementById('cuerpoVentasAnual');
  if (tbody3) {
    const keys = Object.keys(porAnio).sort().reverse();
    tbody3.innerHTML = keys.length === 0
      ? '<tr><td colspan="3" class="cargando">Sin ventas</td></tr>'
      : keys.map(k => `<tr><td>${k}</td><td>${porAnio[k].n}</td><td>Bs. ${porAnio[k].total.toFixed(2)}</td></tr>`).join('');
  }

  // Gráfico torta
  const ctx = document.getElementById('chartVentasTorta');
  if (ctx) {
    if (chartTorta) chartTorta.destroy();
    const mesesLabels = Object.keys(porMes).sort().slice(-6);
    chartTorta = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: mesesLabels.map(k => formatMes(porMes[k].mes).substring(0, 3) + ' ' + porMes[k].anio),
        datasets: [{ data: mesesLabels.map(k => porMes[k].total), backgroundColor: ['#1a3a6b','#2255a4','#f5a800','#22c55e','#ef4444','#8b5cf6'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  // Análisis IA ventas globales
  const iaEl = document.getElementById('iaAnalisisVentas');
  if (iaEl) {
    iaEl.innerHTML = '<div class="ia-loading">🤖 Analizando ventas globales con IA...</div>';
    const prompt = `Eres un analista financiero de una plataforma de microemprendedores boliviana llamada EmprenD IA.
Datos de ventas globales:
- Ventas hoy: ${ventasHoyN} (Bs. ${montoHoy.toFixed(2)})
- Ventas este mes: ${ventasMesN} (Bs. ${montoMes.toFixed(2)})
- Meses con más ventas: ${Object.entries(porMes).sort((a,b) => b[1].total - a[1].total).slice(0,3).map(([k,v]) => formatMes(v.mes) + ' Bs.' + v.total.toFixed(0)).join(', ')}
Analiza la situación en 3 párrafos: tendencia general, mes más fuerte, y recomendaciones para el administrador.`;
    const respuesta = await llamarIA(prompt);
    iaEl.innerHTML = respuesta.split('\n').map(p => p.trim() ? `<p style="margin-bottom:8px;">${p}</p>` : '').join('');
  }
}

// ── EXPORTAR PDF / EXCEL ──
async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('EmprenD IA - Reporte de Ventas Globales', 14, 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Generado: ' + new Date().toLocaleString('es-BO'), 14, 26);

  const { data: ventas } = await sb.from('transaccion').select('monto, fecha_transaccion').eq('tipo', 'INGRESO').order('fecha_transaccion', { ascending: false }).limit(50);
  let y = 36;
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha', 14, y); doc.text('Monto (Bs.)', 80, y); y += 8;
  doc.setFont('helvetica', 'normal');
  (ventas || []).forEach(v => {
    doc.text(formatFechaHora(v.fecha_transaccion), 14, y);
    doc.text(parseFloat(v.monto).toFixed(2), 80, y);
    y += 7;
    if (y > 270) { doc.addPage(); y = 20; }
  });
  doc.save('ventas_emprend_ia_' + fechaHoyISO() + '.pdf');
}

async function exportarExcel() {
  const { data: ventas } = await sb.from('transaccion').select('monto, fecha_transaccion, descripcion').eq('tipo', 'INGRESO').order('fecha_transaccion', { ascending: false });
  const filas = (ventas || []).map(v => ({
    'Fecha y Hora': formatFechaHora(v.fecha_transaccion),
    'Monto (Bs.)': parseFloat(v.monto).toFixed(2),
    'Descripción': v.descripcion || '—'
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
  XLSX.writeFile(wb, 'ventas_emprend_ia_' + fechaHoyISO() + '.xlsx');
}

// ── REPORTES ADMIN ──
async function cargarReportesAdmin() {
  const { data } = await sb.from('reporte_ia').select('*, emprendimiento(nombre_negocio)').order('fecha_generacion', { ascending: false });
  const tbody = document.getElementById('tablaReportes');
  if (!tbody) return;
  tbody.innerHTML = (!data || data.length === 0)
    ? '<tr><td colspan="4" class="cargando">Sin reportes aún</td></tr>'
    : data.map(r => `<tr>
        <td>${r.emprendimiento?.nombre_negocio || '—'}</td>
        <td>${r.titulo || '—'}</td>
        <td>${r.resultado ? r.resultado.substring(0, 80) + '...' : '—'}</td>
        <td>${formatFecha(r.fecha_generacion)}</td>
      </tr>`).join('');
}

// ── DOCUMENTOS ADMIN ──
async function cargarDocumentosAdmin() {
  const { data } = await sb.from('documento').select('*').order('capitulo');
  const tbody = document.getElementById('tablaDocumentos');
  if (!tbody) return;
  tbody.innerHTML = (!data || data.length === 0)
    ? '<tr><td colspan="4" class="cargando">Sin documentos</td></tr>'
    : data.map(d => `<tr>
        <td>Cap. ${d.capitulo}</td>
        <td>${d.titulo}</td>
        <td>${d.descripcion || '—'}</td>
        <td>${formatFecha(d.fecha_subida)}</td>
      </tr>`).join('');
}

// ── CONFIGURACIÓN ADMIN ──
function previsualizarFoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('fotoPreview');
    const ph   = document.getElementById('fotoPlaceholder');
    if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function guardarFotoPerfil() {
  const session = getSession();
  const fileInput = document.getElementById('inputFoto');
  if (!fileInput?.files[0]) { alert('Selecciona una imagen.'); return; }
  const file = fileInput.files[0];
  const ext = file.name.split('.').pop();
  const path = `admins/${session.id_usuario}/perfil.${ext}`;
  const { data: up, error } = await sb.storage.from('emprendia').upload(path, file, { upsert: true });
  if (error) { alert('Error: ' + error.message); return; }
  const { data: url } = sb.storage.from('emprendia').getPublicUrl(path);
  await sb.from('usuario').update({ foto_url: url.publicUrl }).eq('id_usuario', session.id_usuario);
  // Mostrar en header y mini
  const fotoMini = document.getElementById('adminFotoMini');
  const iconoMini = document.getElementById('adminIconoMini');
  const fotoHeader = document.getElementById('adminFotoHeader');
  const iconoHeader = document.getElementById('adminIconoHeader');
  if (fotoMini) { fotoMini.src = url.publicUrl; fotoMini.style.display = 'block'; }
  if (iconoMini) iconoMini.style.display = 'none';
  if (fotoHeader) { fotoHeader.src = url.publicUrl; fotoHeader.style.display = 'inline-block'; }
  if (iconoHeader) iconoHeader.style.display = 'none';
  alert('✅ Foto guardada.');
}

async function cambiarPassword() {
  const pass1 = document.getElementById('nuevaPassword')?.value;
  const pass2 = document.getElementById('confirmarPassword')?.value;
  const msg   = document.getElementById('msgPassword');
  if (!pass1 || !pass2) { if (msg) msg.textContent = '⚠️ Completa ambos campos.'; return; }
  if (pass1 !== pass2) { if (msg) msg.textContent = '⚠️ Las contraseñas no coinciden.'; return; }
  if (pass1.length < 6) { if (msg) msg.textContent = '⚠️ Mínimo 6 caracteres.'; return; }
  const session = getSession();
  const { error } = await sb.from('usuario').update({ password_hash: pass1 }).eq('id_usuario', session.id_usuario);
  if (error) { if (msg) { msg.style.color = '#ef4444'; msg.textContent = '❌ Error: ' + error.message; } return; }
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = '✅ Contraseña actualizada.'; }
  document.getElementById('nuevaPassword').value = '';
  document.getElementById('confirmarPassword').value = '';
}

async function cambiarCorreo() {
  const correo = document.getElementById('nuevoCorreo')?.value.trim();
  const msg    = document.getElementById('msgCorreo');
  if (!correo) { if (msg) msg.textContent = '⚠️ Ingresa un correo.'; return; }
  const session = getSession();
  const { error } = await sb.from('usuario').update({ correo }).eq('id_usuario', session.id_usuario);
  if (error) { if (msg) { msg.style.color = '#ef4444'; msg.textContent = '❌ Error: ' + error.message; } return; }
  session.correo = correo; setSession(session);
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = '✅ Correo actualizado.'; }
}

// ── NAVEGACIÓN ADMIN ──
function verSeccion(nombre, el) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activo'));
  document.querySelectorAll('.snav').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + nombre);
  if (sec) sec.classList.add('activo');
  if (el) { el.classList.add('active'); el.blur(); }
  const titulos = {
    usuarios:        ['Panel Administrador', 'Gestión general del sistema EmprenD IA'],
    emprendimientos: ['Emprendimientos', 'Negocios registrados en la plataforma'],
    ventas:          ['Ventas Globales', 'Reporte financiero de la plataforma'],
    reportes:        ['Reportes IA', 'Análisis generados por inteligencia artificial'],
    documentos:      ['Documentos', 'Archivos del proyecto'],
    configuracion:   ['Configuración', 'Ajustes del administrador']
  };
  const t = titulos[nombre];
  if (t) {
    const tEl = document.getElementById('seccionTitulo');
    const sEl = document.getElementById('seccionSub');
    if (tEl) tEl.textContent = t[0];
    if (sEl) sEl.textContent = t[1];
  }
  if (nombre === 'usuarios')        cargarUsuariosAdmin();
  else if (nombre === 'emprendimientos') cargarEmprendimientosAdmin();
  else if (nombre === 'ventas')         cargarVentasGlobalesAdmin();
  else if (nombre === 'reportes')        cargarReportesAdmin();
  else if (nombre === 'documentos')      cargarDocumentosAdmin();
}

// ============================================================
// AUTO-INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop();
  if (page === 'emprendedor.html') initEmprendedor();
  else if (page === 'comprador.html') initComprador();
  else if (page === 'admin.html') initAdmin();
});