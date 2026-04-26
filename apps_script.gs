// ================================================================
// Club de Espeleología — Google Apps Script
// Conecta Google Forms con Supabase
// ================================================================
 
var SUPABASE_URL      = 'https://xelwubhbvcxeiatnjods.supabase.co';
var SUPABASE_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlbHd1YmhidmN4ZWlhdG5qb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzEyOTk1OCwiZXhwIjoyMDkyNzA1OTU4fQ.dcCrVWbEB8dBvLOgahMM4ZApeoHm9sVx25P_SCqxgCA';
var EMAIL_RESPONSABLE = 'martaf.gonzalez02@gmail.com';
var ID_FORM_PRESTAMO   = '1XkOXKj5GsY7JHJ3cM8BOu2VXl8SLXzIjRvDQ4b_QEKc';
var ID_FORM_DEVOLUCION = '1-kOBO4JhIiL9O4LfQ9vMKKxfmFtjUOuPljswbV3Wa4w';
 
// Prefijo que coincide con el título EXACTO de la cuadrícula en el formulario de préstamo
var PREFIJO_GRID = 'Material [';
 
 
// ================================================================
// TRIGGER 1 — Formulario de PRÉSTAMO
// ================================================================
function onPrestamSubmit(e) {
  try {
    Logger.log('onPrestamSubmit ejecutado.');
 
    var r = getNamedValues(e);
    if (!r) return notificarError('onPrestamSubmit: no se recibieron datos del formulario.');
 
    Logger.log('Campos recibidos: ' + JSON.stringify(Object.keys(r)));
 
    var dni          = getValor(r, 'DNI') ? getValor(r, 'DNI').trim().toUpperCase() : null;
    var fechaSalida  = parseFecha(getValor(r, 'Fecha de salida'));
    var fechaRetorno = parseFecha(getValor(r, 'Fecha de devolucion prevista'));
    var notas        = getValor(r, 'Notas');
 
    if (!dni) return notificarError('DNI no recibido. Campos: ' + JSON.stringify(Object.keys(r)));
 
    // 1 — Verificar que el socio existe y está activo
    var miembros = dbGet('miembros?dni=eq.' + encodeURIComponent(dni) + '&activo=eq.true&select=id,nombre,apellidos,email,numero_socio');
    if (!miembros.length) return notificarError('Socio no encontrado o inactivo. DNI: ' + dni);
    var socio = miembros[0];
 
    // 2 — Leer la cuadrícula de material
    // El usuario solo marca cantidad en los materiales que necesita;
    // el resto llega como string vacío y se ignora.
    var items = [];
 
    Object.keys(r).forEach(function(clave) {
      if (clave.indexOf(PREFIJO_GRID) !== 0) return;
 
      var valorStr = r[clave][0];
 
      // Ignorar filas que el usuario dejó en blanco
      if (!valorStr || valorStr.trim() === '') return;
 
      var cantidad = parseInt(valorStr.trim(), 10);
      if (isNaN(cantidad) || cantidad <= 0) return;
 
      // Extrae el nombre del material entre "Material [" y "]"
      var nombreMat = clave.slice(PREFIJO_GRID.length, -1);
 
      Logger.log('Material seleccionado: ' + nombreMat + ' x' + cantidad);
 
      var mats = dbGet('material?nombre=eq.' + encodeURIComponent(nombreMat) + '&estado=neq.baja&select=id,nombre');
      if (!mats.length) return notificarError('Material no encontrado en BD: ' + nombreMat);
 
      var disp = dbGet('v_material_disponible?nombre=eq.' + encodeURIComponent(nombreMat) + '&select=cantidad_disponible');
      var disponible = disp.length ? disp[0].cantidad_disponible : 0;
      if (cantidad > disponible) {
        return notificarError('Sin stock suficiente: ' + nombreMat + '\nDisponible: ' + disponible + ' | Solicitado: ' + cantidad);
      }
 
      items.push({ material_id: mats[0].id, nombre: nombreMat, cantidad: cantidad });
    });
 
    if (!items.length) return notificarError('No se ha seleccionado ningún material. DNI: ' + dni);
 
    // 3 — Crear la cabecera del préstamo
    var respPrestamo = dbPostReturn('prestamos', {
      miembro_id:             socio.id,
      fecha_salida:           fechaSalida,
      fecha_retorno_prevista: fechaRetorno,
      estado:                 'activo',
      notas:                  notas
    });
    var prestamoId = respPrestamo[0].id;
 
    // 4 — Insertar un item por cada material seleccionado
    items.forEach(function(item) {
      dbPost('prestamo_items', {
        prestamo_id: prestamoId,
        material_id: item.material_id,
        cantidad:    item.cantidad
      });
    });
 
    // 5 — Email de confirmación al socio
    var lineas = items.map(function(it) {
      return '  - ' + it.nombre + ' x' + it.cantidad;
    }).join('\n');
 
    if (socio.email) {
      GmailApp.sendEmail(
        socio.email,
        '[Espeleología] Préstamo confirmado',
        'Hola ' + socio.nombre + ',\n\n' +
        'Tu préstamo ha quedado registrado:\n\n' +
        lineas + '\n\n' +
        '  Fecha de salida:     ' + fechaSalida + '\n' +
        '  Devolución prevista: ' + fechaRetorno + '\n' +
        (notas ? '  Notas: ' + notas + '\n' : '') +
        '\nRecuerda devolver el material en la fecha indicada.\n\n' +
        'Saludos,\nClub de Espeleología'
      );
    }
 
    // 6 — Notificación al responsable
    GmailApp.sendEmail(
      EMAIL_RESPONSABLE,
      '[Espeleología] Nueva solicitud de préstamo — ' + socio.numero_socio,
      'El socio ' + socio.nombre + ' ' + socio.apellidos + ' (' + socio.numero_socio + ') ha solicitado material:\n\n' +
      lineas + '\n\n' +
      '  Fecha de salida:     ' + fechaSalida + '\n' +
      '  Devolución prevista: ' + fechaRetorno + '\n' +
      (notas ? '  Notas: ' + notas + '\n' : '') +
      '\nPuedes gestionar los préstamos en Supabase.'
    );
 
    Logger.log('PRÉSTAMO OK — ' + socio.numero_socio + ' | ' + items.length + ' materiales');
 
  } catch (err) {
    Logger.log('ERROR onPrestamSubmit: ' + err.message + '\n' + err.stack);
    notificarError('Error inesperado (préstamo): ' + err.message);
  }
}
 
 
// ================================================================
// TRIGGER 2 — Formulario de DEVOLUCIÓN (Opción A1)
//
// El formulario solo pide:
//   - DNI
//   - Fecha de devolución
//   - Notas (opcional)
//
// El script busca el préstamo activo más reciente del socio y lo cierra.
// Si tiene más de un préstamo activo, cierra el más antiguo y avisa
// al responsable para que revise si hay más pendientes.
// ================================================================
function onDevolucionSubmit(e) {
  try {
    Logger.log('onDevolucionSubmit ejecutado.');
 
    var r = getNamedValues(e);
    if (!r) return notificarError('onDevolucionSubmit: no se recibieron datos del formulario.');
 
    Logger.log('Campos recibidos: ' + JSON.stringify(Object.keys(r)));
 
    var dni       = getValor(r, 'DNI') ? getValor(r, 'DNI').trim().toUpperCase() : null;
    var fechaReal = parseFecha(getValor(r, 'Fecha de devolucion'));
    var notas     = getValor(r, 'Notas');
 
    if (!dni) return notificarError('DNI no recibido en formulario de devolución.');
 
    // 1 — Verificar socio
    var miembros = dbGet('miembros?dni=eq.' + encodeURIComponent(dni) + '&activo=eq.true&select=id,nombre,apellidos,email,numero_socio');
    if (!miembros.length) return notificarError('Devolución — Socio no encontrado o inactivo. DNI: ' + dni);
    var socio = miembros[0];
 
    // 2 — Buscar préstamos activos o vencidos, ordenados del más antiguo al más reciente
    var prestamos = dbGet(
      'prestamos?miembro_id=eq.' + socio.id +
      '&estado=in.(activo,vencido)' +
      '&select=id,fecha_salida,fecha_retorno_prevista,prestamo_items(material_id,cantidad,material(nombre))' +
      '&order=fecha_salida.asc'
    );
 
    if (!prestamos.length) {
      return notificarError('Devolución — No hay préstamos activos para el socio ' + socio.numero_socio + ' (DNI: ' + dni + ')');
    }
 
    // 3 — Cierra el préstamo más antiguo (primero de la lista)
    var prestamo = prestamos[0];
 
    dbPatch('prestamos?id=eq.' + prestamo.id, {
      fecha_retorno_real: fechaReal || new Date().toISOString().split('T')[0],
      estado:             'devuelto',
      notas:              notas
    });
 
    Logger.log('DEVOLUCIÓN OK — ' + socio.numero_socio + ' | préstamo #' + prestamo.id);
 
    // 4 — Construir resumen del material devuelto para el email
    var lineas = '';
    if (prestamo.prestamo_items && prestamo.prestamo_items.length) {
      lineas = prestamo.prestamo_items.map(function(pi) {
        var nombreMat = pi.material ? pi.material.nombre : 'Material #' + pi.material_id;
        return '  - ' + nombreMat + ' x' + pi.cantidad;
      }).join('\n');
    }
 
    // 5 — Email de confirmación al socio
    if (socio.email) {
      GmailApp.sendEmail(
        socio.email,
        '[Espeleología] Devolución registrada',
        'Hola ' + socio.nombre + ',\n\n' +
        'Hemos registrado la devolución de tu préstamo del ' + prestamo.fecha_salida + ':\n\n' +
        lineas + '\n\n' +
        '  Fecha de devolución: ' + (fechaReal || 'hoy') + '\n\n' +
        '¡Gracias por cuidar el material del club!\n\n' +
        'Saludos,\nClub de Espeleología'
      );
    }
 
    // 6 — Si tiene más préstamos activos, avisar al responsable
    if (prestamos.length > 1) {
      var pendientes = prestamos.slice(1).map(function(p) {
        return '  - Préstamo #' + p.id + ' (salida: ' + p.fecha_salida + ', previsto: ' + p.fecha_retorno_prevista + ')';
      }).join('\n');
 
      GmailApp.sendEmail(
        EMAIL_RESPONSABLE,
        '[Espeleología] Devolución registrada — ' + socio.numero_socio + ' tiene más préstamos activos',
        'Se ha registrado la devolución del préstamo #' + prestamo.id + ' de ' +
        socio.nombre + ' ' + socio.apellidos + ' (' + socio.numero_socio + ').\n\n' +
        'Material devuelto:\n' + lineas + '\n\n' +
        'ATENCIÓN: Este socio todavía tiene ' + (prestamos.length - 1) + ' préstamo(s) activo(s):\n\n' +
        pendientes + '\n\nRevisa Supabase para más detalles.'
      );
    }
 
  } catch (err) {
    Logger.log('ERROR onDevolucionSubmit: ' + err.message + '\n' + err.stack);
    notificarError('Error inesperado (devolución): ' + err.message);
  }
}
 
 
// ================================================================
// RECORDATORIOS SEMANALES — ejecutar los lunes automáticamente
// ================================================================
function enviarRecordatoriosVencidos() {
  dbRpc('actualizar_prestamos_vencidos');
 
  var vencidos = dbGet('v_prestamos_vencidos');
  if (!vencidos.length) {
    Logger.log('Sin préstamos vencidos.');
    return;
  }
 
  var porSocio = {};
  vencidos.forEach(function(p) {
    if (!porSocio[p.socio]) porSocio[p.socio] = [];
    porSocio[p.socio].push(p);
  });
 
  Object.keys(porSocio).forEach(function(numSocio) {
    var items   = porSocio[numSocio];
    var miembro = dbGet('miembros?numero_socio=eq.' + encodeURIComponent(numSocio) + '&select=nombre,email');
    if (!miembro.length || !miembro[0].email) return;
 
    var lineas = items.map(function(p) {
      return '  - ' + p.material + ' (x' + p.cantidad + ') — venció el ' + p.fecha_retorno_prevista + ' (' + p.dias_retraso + ' días)';
    }).join('\n');
 
    GmailApp.sendEmail(
      miembro[0].email,
      '[Espeleología] Recordatorio: material pendiente de devolución',
      'Hola ' + miembro[0].nombre + ',\n\n' +
      'Tienes material pendiente de devolución:\n\n' +
      lineas +
      '\n\nPor favor devuélvelo lo antes posible.\n\n' +
      'Saludos,\nClub de Espeleología'
    );
  });
 
  var resumen = vencidos.map(function(p) {
    return p.socio + ' | ' + p.material + ' | ' + p.dias_retraso + 'd de retraso';
  }).join('\n');
 
  GmailApp.sendEmail(
    EMAIL_RESPONSABLE,
    '[Espeleología] Préstamos vencidos — ' + vencidos.length + ' ítem(s)',
    resumen
  );
}
 
 
// ================================================================
// ACTUALIZAR LISTAS DESPLEGABLES DE LOS FORMULARIOS
// ================================================================
function actualizarListaMateriales() {
  var materiales = dbGet('material?estado=neq.baja&select=nombre&order=nombre');
  var nombres    = materiales.map(function(m) { return m.nombre; });
 
  var formP      = FormApp.openById(ID_FORM_PRESTAMO);
  var cuadricula = formP.getItems(FormApp.ItemType.GRID)[0].asGridItem();
  cuadricula.setRows(nombres);
 
  Logger.log('Materiales actualizados: ' + nombres.length);
}
 
 
// ================================================================
// HELPERS
// ================================================================
 
/**
 * Normaliza el acceso a campos ignorando tildes y mayúsculas.
 */
function getValor(r, clave) {
  var claveNorm = clave.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  var keyReal = Object.keys(r).find(function(k) {
    return k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === claveNorm;
  });
  return keyReal && r[keyReal][0] ? r[keyReal][0] : null;
}
 
/**
 * Obtiene los valores del formulario como objeto {campo: [valor]}.
 * Compatible con e.namedValues (simple trigger) y e.response (installable trigger).
 */
function getNamedValues(e) {
  if (!e) return null;
 
  // Caso 1: namedValues disponible directamente (simple trigger)
  if (e.namedValues) return e.namedValues;
 
  // Caso 2: usar e.response (installable trigger)
  if (!e.response) return null;
 
  var r = {};
  e.response.getItemResponses().forEach(function(ir) {
    var item  = ir.getItem();
    var resp  = ir.getResponse();
    var title = item.getTitle();
 
    if (item.getType() === FormApp.ItemType.GRID) {
      // Cuadrícula: resp es String[] con un valor por fila (o null si no se marcó)
      // Construye claves como "Material [Nombre del material]"
      var rows = item.asGridItem().getRows();
      var vals = resp || [];
      rows.forEach(function(row, i) {
        r[title + ' [' + row + ']'] = [vals[i] || ''];
      });
    } else {
      r[title] = [typeof resp === 'string' ? resp : (resp ? String(resp) : '')];
    }
  });
 
  return r;
}
 
function dbGet(query) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + query, {
    method: 'GET',
    headers: headers(),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200)
    throw new Error('GET ' + query + ' → ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}
 
function dbPost(tabla, datos) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + tabla, {
    method: 'POST',
    headers: Object.assign(headers(), { 'Prefer': 'return=minimal' }),
    payload: JSON.stringify(datos),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 201)
    throw new Error('POST ' + tabla + ' → ' + resp.getContentText());
}
 
function dbPostReturn(tabla, datos) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + tabla, {
    method: 'POST',
    headers: Object.assign(headers(), { 'Prefer': 'return=representation' }),
    payload: JSON.stringify(datos),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 201)
    throw new Error('POST ' + tabla + ' → ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}
 
function dbPatch(query, datos) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + query, {
    method: 'PATCH',
    headers: Object.assign(headers(), { 'Prefer': 'return=minimal' }),
    payload: JSON.stringify(datos),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 204)
    throw new Error('PATCH ' + query + ' → ' + resp.getContentText());
}
 
function dbRpc(fn) {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: headers(),
    payload: '{}',
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200)
    throw new Error('RPC ' + fn + ' → ' + resp.getContentText());
}
 
function headers() {
  return {
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type':  'application/json'
  };
}
 
/**
 * Convierte fecha al formato ISO que espera Supabase (YYYY-MM-DD).
 * Maneja tanto "DD/MM/YYYY" como objetos Date serializados.
 */
function parseFecha(str) {
  if (!str) return null;
  // Si viene como Date serializado: "Sat Apr 26 2026 00:00:00 GMT+0100"
  var d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  // Si viene como "DD/MM/YYYY"
  var p = str.trim().split('/');
  if (p.length === 3) {
    return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
  }
  return str;
}
 
function notificarError(msg) {
  Logger.log('ERROR: ' + msg);
  GmailApp.sendEmail(EMAIL_RESPONSABLE, '[Espeleología] Error en gestión de material', msg);
}
 