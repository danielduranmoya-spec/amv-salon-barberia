/**
 * AMV Salón barbería · Reservas online
 * ─────────────────────────────────────
 * Guarda cada reserva como un evento en Google Calendar y envía al cliente
 * un correo de confirmación con su nombre. La web consulta aquí las horas
 * ocupadas para mostrar solo las libres.
 *
 * Instalación (5 minutos): mira el apartado «Reservas» de LEEME.md.
 */

const AJUSTES = {
  CALENDAR_ID: 'primary',       // 'primary' = calendario principal de la cuenta, o el ID de un calendario «Reservas AMV»
  ZONA: 'Europe/Madrid',
  NEGOCIO: 'AMV Salón barbería',
  DIRECCION: 'C. San Salvador, 35, 06800 Mérida, Badajoz',
  TELEFONO: '628 51 22 94',
  AVISAR_A: '',                 // correo del negocio para recibir un aviso de cada reserva (opcional)
  DIAS: 30,                     // días que se pueden reservar por adelantado (igual que en la web)
  ANTELACION: 60,               // minutos mínimos de antelación
  PASO: 15                      // minutos entre horas ofrecidas
};

// Igual que HORARIO en index.html (0 = domingo … 6 = sábado)
const HORARIO = {
  1: [['10:00', '14:00'], ['16:30', '20:30']],
  2: [['10:00', '14:00'], ['16:30', '20:30']],
  3: [['10:00', '14:00'], ['16:30', '20:30']],
  4: [['10:00', '14:00'], ['16:30', '20:30']],
  5: [['10:00', '14:00'], ['16:30', '20:30']],
  6: [['09:30', '14:00']],
  0: []
};

// Igual que SERVICIOS en index.html (la duración manda aquí, no la que envíe el navegador)
const SERVICIOS = {
  corte:    { nombre: 'Corte de pelo',     min: 30, precio: '12 €' },
  barba:    { nombre: 'Arreglo de barba',  min: 20, precio: '8 €' },
  lavado:   { nombre: 'Lavado de cabeza',  min: 15, precio: '4 €' },
  tinte:    { nombre: 'Tinte',             min: 45, precio: 'desde 18 €' },
  completo: { nombre: 'Servicio completo', min: 90, precio: '30 €' }
};

/* ───────────────────────── Puntos de entrada ───────────────────────── */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.accion === 'disponibilidad') return json_(disponibilidad_(p.desde, p.hasta));
    return json_({ ok: true, negocio: AJUSTES.NEGOCIO });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, codigo: 'error', mensaje: 'No se ha podido consultar la agenda.' });
  }
}

function doPost(e) {
  let datos;
  try { datos = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, codigo: 'datos', mensaje: 'Petición no válida.' }); }
  try {
    if (datos.accion === 'reservar') return json_(reservar_(datos));
    return json_({ ok: false, codigo: 'datos', mensaje: 'Acción desconocida.' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, codigo: 'error', mensaje: 'No se ha podido guardar la reserva. Llámanos al ' + AJUSTES.TELEFONO + '.' });
  }
}

/* ───────────────────────── Disponibilidad ───────────────────────── */

// Devuelve, por día, los tramos ocupados en minutos: { '2026-10-22': [[600, 630], ...] }
function disponibilidad_(desde, hasta) {
  if (!esFecha_(desde) || !esFecha_(hasta) || hasta < desde) throw new Error('Fechas no válidas');
  const dias = [];
  for (let d = desde; d <= hasta && dias.length < 62; d = sumarDia_(d)) dias.push(d);
  const ini = Utilities.parseDate(dias[0] + ' 00:00', AJUSTES.ZONA, 'yyyy-MM-dd HH:mm');
  const fin = Utilities.parseDate(sumarDia_(dias[dias.length - 1]) + ' 00:00', AJUSTES.ZONA, 'yyyy-MM-dd HH:mm');
  const eventos = calendario_().getEvents(ini, fin).filter(ocupa_);
  const ocupado = {};
  dias.forEach(function (dia) {
    const lista = [];
    eventos.forEach(function (ev) {
      const tramo = tramoEnDia_(ev, dia);
      if (tramo) lista.push(tramo);
    });
    ocupado[dia] = lista;
  });
  return { ok: true, ocupado: ocupado };
}

function tramoEnDia_(ev, dia) {
  if (ev.isAllDayEvent()) {
    const a = Utilities.formatDate(ev.getAllDayStartDate(), AJUSTES.ZONA, 'yyyy-MM-dd');
    const b = Utilities.formatDate(ev.getAllDayEndDate(), AJUSTES.ZONA, 'yyyy-MM-dd');
    return (dia >= a && dia < b) ? [0, 1440] : null;
  }
  const s = minutos_(ev.getStartTime(), dia), t = minutos_(ev.getEndTime(), dia);
  return t > s ? [s, t] : null;
}

// Minutos desde las 00:00 de «dia» (0 si es antes, 1440 si es después)
function minutos_(fecha, dia) {
  const f = Utilities.formatDate(fecha, AJUSTES.ZONA, 'yyyy-MM-dd');
  if (f < dia) return 0;
  if (f > dia) return 1440;
  const hm = Utilities.formatDate(fecha, AJUSTES.ZONA, 'HH:mm').split(':');
  return Number(hm[0]) * 60 + Number(hm[1]);
}

// Los eventos marcados como «Disponible» en Calendar no bloquean la agenda
function ocupa_(ev) {
  try {
    if (typeof ev.getTransparency === 'function' && ev.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) return false;
  } catch (e) { /* versiones antiguas: se considera ocupado */ }
  return true;
}

/* ───────────────────────── Reserva ───────────────────────── */

function reservar_(d) {
  if (d.web) return { ok: true };                       // campo trampa para bots: se ignora en silencio
  const svc = SERVICIOS[d.servicio];
  if (!svc) return error_('datos', 'Servicio no válido.');
  const nombre = String(d.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const email = String(d.email || '').trim().slice(0, 120);
  const telefono = String(d.telefono || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (nombre.length < 2) return error_('datos', 'Falta el nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return error_('datos', 'El correo no es válido.');
  if (telefono.replace(/\D/g, '').length < 9) return error_('datos', 'El teléfono no es válido.');
  if (!esFecha_(d.fecha) || !/^\d{2}:\d{2}$/.test(String(d.hora))) return error_('datos', 'Fecha u hora no válidas.');

  const ini = Utilities.parseDate(d.fecha + ' ' + d.hora, AJUSTES.ZONA, 'yyyy-MM-dd HH:mm');
  const fin = new Date(ini.getTime() + svc.min * 60000);
  const diaSemana = Number(Utilities.formatDate(ini, AJUSTES.ZONA, 'u')) % 7;   // 1 = lunes … 7 = domingo → 0
  const m0 = aMin_(d.hora), m1 = m0 + svc.min;
  const dentro = (HORARIO[diaSemana] || []).some(function (t) { return m0 >= aMin_(t[0]) && m1 <= aMin_(t[1]) && (m0 - aMin_(t[0])) % AJUSTES.PASO === 0; });
  if (!dentro) return error_('fuera_horario', 'Esa hora está fuera de nuestro horario.');
  if (ini.getTime() < Date.now() + AJUSTES.ANTELACION * 60000) return error_('fuera_horario', 'Las citas se piden con al menos ' + AJUSTES.ANTELACION + ' minutos de antelación.');
  if (ini.getTime() > Date.now() + (AJUSTES.DIAS + 1) * 86400000) return error_('fuera_horario', 'Solo se puede reservar con ' + AJUSTES.DIAS + ' días de antelación.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);                                  // dos personas no pueden coger la misma hora a la vez
  try {
    const cal = calendario_();
    if (cal.getEvents(ini, fin).filter(ocupa_).length) return error_('ocupado', 'Esa hora acaba de ocuparse.');
    const ev = cal.createEvent(svc.nombre + ' · ' + nombre, ini, fin, {
      location: AJUSTES.DIRECCION,
      description: 'Cliente: ' + nombre + '\nTeléfono: ' + telefono + '\nCorreo: ' + email +
        '\nServicio: ' + svc.nombre + ' (' + svc.min + ' min, ' + svc.precio + ')\nReservado desde la web.'
    });
    ev.setTag('origen', 'web');
    const r = { nombre: nombre, email: email, telefono: telefono, servicio: svc, ini: ini };
    enviarConfirmacion_(r);
    if (AJUSTES.AVISAR_A) avisarNegocio_(r);
    return { ok: true, id: ev.getId() };
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── Correos ───────────────────────── */

function enviarConfirmacion_(r) {
  const dia = fechaLarga_(r.ini), hora = Utilities.formatDate(r.ini, AJUSTES.ZONA, 'HH:mm');
  const nombre = r.nombre.split(' ')[0];
  const asunto = 'Tu cita en ' + AJUSTES.NEGOCIO + ' está confirmada';
  const texto =
    'Hola ' + nombre + ':\n\n' +
    '¡Gracias por reservar con nosotros! Tu cita ha quedado confirmada.\n\n' +
    '· Servicio: ' + r.servicio.nombre + ' (' + r.servicio.min + ' min)\n' +
    '· Día: ' + dia + '\n' +
    '· Hora: ' + hora + '\n\n' +
    'Te esperamos en ' + AJUSTES.DIRECCION + '. Si necesitas cambiar o anular la cita, llámanos al ' + AJUSTES.TELEFONO + '.\n\n' +
    'Un saludo,\n' + AJUSTES.NEGOCIO;
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#0b1a26">' +
    '<div style="background:#0b1a26;color:#fff;padding:22px 26px;border-radius:16px 16px 0 0;font-size:20px;font-weight:bold;letter-spacing:.5px">' + esc_(AJUSTES.NEGOCIO) + '</div>' +
    '<div style="border:1px solid #dde3e7;border-top:0;padding:26px;border-radius:0 0 16px 16px;line-height:1.55">' +
    '<p style="font-size:18px;margin:0 0 12px">Hola <strong>' + esc_(nombre) + '</strong>:</p>' +
    '<p style="margin:0 0 18px">¡Gracias por reservar con nosotros! Tu cita ha quedado confirmada.</p>' +
    '<table style="border-collapse:collapse;width:100%;margin:0 0 18px">' +
    fila_('Servicio', esc_(r.servicio.nombre) + ' (' + r.servicio.min + ' min)') + fila_('Día', esc_(dia)) + fila_('Hora', hora) +
    '</table>' +
    '<p style="margin:0 0 6px">Te esperamos en ' + esc_(AJUSTES.DIRECCION) + '.</p>' +
    '<p style="margin:0 0 18px">Si necesitas cambiar o anular la cita, llámanos al <a href="tel:+34' + AJUSTES.TELEFONO.replace(/\s/g, '') + '">' + AJUSTES.TELEFONO + '</a>.</p>' +
    '<p style="margin:0">Un saludo,<br>' + esc_(AJUSTES.NEGOCIO) + '</p></div></div>';
  const opciones = { to: r.email, subject: asunto, body: texto, htmlBody: html, name: AJUSTES.NEGOCIO };
  if (AJUSTES.AVISAR_A) opciones.replyTo = AJUSTES.AVISAR_A;
  MailApp.sendEmail(opciones);
}

function avisarNegocio_(r) {
  MailApp.sendEmail({
    to: AJUSTES.AVISAR_A,
    subject: 'Nueva reserva: ' + r.servicio.nombre + ' · ' + fechaLarga_(r.ini) + ' ' + Utilities.formatDate(r.ini, AJUSTES.ZONA, 'HH:mm'),
    body: 'Cliente: ' + r.nombre + '\nTeléfono: ' + r.telefono + '\nCorreo: ' + r.email + '\nServicio: ' + r.servicio.nombre,
    name: 'Reservas web'
  });
}

/* ───────────────────────── Utilidades ───────────────────────── */

function calendario_() {
  const cal = AJUSTES.CALENDAR_ID === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(AJUSTES.CALENDAR_ID);
  if (!cal) throw new Error('No encuentro el calendario ' + AJUSTES.CALENDAR_ID);
  return cal;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function error_(codigo, mensaje) { return { ok: false, codigo: codigo, mensaje: mensaje }; }
function esFecha_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function aMin_(hhmm) { const p = String(hhmm).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function sumarDia_(s) {
  const p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1, 12));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
function fechaLarga_(fecha) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = Number(Utilities.formatDate(fecha, AJUSTES.ZONA, 'u')) % 7;
  return dias[d] + ' ' + Number(Utilities.formatDate(fecha, AJUSTES.ZONA, 'd')) + ' de ' + meses[Number(Utilities.formatDate(fecha, AJUSTES.ZONA, 'M')) - 1];
}
function fila_(k, v) { return '<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f3;color:#5b7080">' + k + '</td><td style="padding:8px 0;border-bottom:1px solid #eef1f3;text-align:right"><strong>' + v + '</strong></td></tr>'; }
function esc_(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/**
 * Ejecuta esta función una vez desde el editor (botón ▶) para conceder permisos
 * y comprobar que el calendario responde. No crea ninguna reserva.
 */
function probar() {
  const hoy = Utilities.formatDate(new Date(), AJUSTES.ZONA, 'yyyy-MM-dd');
  const r = disponibilidad_(hoy, sumarDia_(hoy));
  console.log('Calendario: ' + calendario_().getName());
  console.log(JSON.stringify(r));
  console.log('Correos disponibles hoy: ' + MailApp.getRemainingDailyQuota());
}
