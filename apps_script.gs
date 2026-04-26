// ================================================================
// Club de Espeleología — Apps Script 
// ================================================================
 
var SB_URL  = 'https://xelwubhbvcxeiatnjods.supabase.co/rest/v1/';
var SB_KEY  = 'xx';
var EMAIL   = 'martaf.gonzalez02@gmail.com';
var F_PREST = '1XkOXKj5GsY7JHJ3cM8BOu2VXl8SLXzIjRvDQ4b_QEKc';
var F_DEVOL = '1-kOBO4JhIiL9O4LfQ9vMKKxfmFtjUOuPljswbV3Wa4w';
var GRID    = 'Material [';
 
 
// ================================================================
// TRIGGERS
// ================================================================
 
function onPrestamSubmit(e) {
  try {
    var r = namedVals(e);
    if (!r) return error('onPrestamSubmit: sin datos.');
 
    var dni  = (val(r,'DNI') || '').trim().toUpperCase();
    var fSal = fecha(val(r,'Fecha de salida'));
    var fRet = fecha(val(r,'Fecha de devolucion prevista'));
    var nota = val(r,'Notas');
 
    if (!dni) return error('DNI no recibido.');
 
    var socio = db('miembros?dni=eq.'+enc(dni)+'&activo=eq.true&select=id,nombre,apellidos,email,numero_socio')[0];
    if (!socio) return error('Socio no encontrado: '+dni);
 
    var items = [];
    Object.keys(r).forEach(function(k) {
      if (k.indexOf(GRID) !== 0) return;
      var qty = parseInt((r[k][0]||'').trim(), 10);
      if (!qty || qty <= 0) return;
      var nom = k.slice(GRID.length, -1);
      var mat = db('material?nombre=eq.'+enc(nom)+'&estado=neq.baja&select=id,nombre')[0];
      if (!mat) return error('Material no encontrado: '+nom);
      var disp = (db('v_material_disponible?nombre=eq.'+enc(nom)+'&select=cantidad_disponible')[0]||{}).cantidad_disponible||0;
      if (qty > disp) return error('Sin stock: '+nom+' (disp:'+disp+', sol:'+qty+')');
      items.push({material_id:mat.id, nombre:nom, cantidad:qty});
    });
 
    if (!items.length) return error('Sin material seleccionado. DNI: '+dni);
 
    var pid = dbPost('prestamos', {miembro_id:socio.id, fecha_salida:fSal, fecha_retorno_prevista:fRet, estado:'activo', notas:nota}, true)[0].id;
    items.forEach(function(i) { dbPost('prestamo_items', {prestamo_id:pid, material_id:i.material_id, cantidad:i.cantidad}); });
 
    var lineas = items.map(function(i){ return '  - '+i.nombre+' x'+i.cantidad; }).join('\n');
    var body   = 'Material:\n'+lineas+'\n\n  Salida: '+fSal+'\n  Devolución: '+fRet+(nota?'\n  Notas: '+nota:'');
 
    if (socio.email) mail(socio.email, 'Préstamo confirmado', 'Hola '+socio.nombre+',\n\n'+body+'\n\nSaludos,\nClub de Espeleología');
    mail(EMAIL, 'Nueva solicitud — '+socio.numero_socio, socio.nombre+' '+socio.apellidos+' ('+socio.numero_socio+')\n\n'+body);
 
    Logger.log('PRÉSTAMO OK — '+socio.numero_socio+' | '+items.length+' materiales');
  } catch(err) { Logger.log(err.stack); error('Error (préstamo): '+err.message); }
}
 
 
function onDevolucionSubmit(e) {
  try {
    var r = namedVals(e);
    if (!r) return error('onDevolucionSubmit: sin datos.');
 
    var dni   = (val(r,'DNI')||'').trim().toUpperCase();
    var fReal = fecha(val(r,'Fecha de devolucion'));
    var nota  = val(r,'Notas');
 
    if (!dni) return error('DNI no recibido en devolución.');
 
    var socio = db('miembros?dni=eq.'+enc(dni)+'&activo=eq.true&select=id,nombre,apellidos,email,numero_socio')[0];
    if (!socio) return error('Socio no encontrado: '+dni);
 
    var prestamos = db('prestamos?miembro_id=eq.'+socio.id+'&estado=in.(activo,vencido)&select=id,fecha_salida,fecha_retorno_prevista,prestamo_items(material_id,cantidad,material(nombre))&order=fecha_salida.asc');
    if (!prestamos.length) return error('Sin préstamos activos para '+socio.numero_socio);
 
    var p = prestamos[0];
    dbPatch('prestamos?id=eq.'+p.id, {fecha_retorno_real: fReal||hoy(), estado:'devuelto', notas:nota});
 
    var lineas = (p.prestamo_items||[]).map(function(pi){ return '  - '+(pi.material?pi.material.nombre:'#'+pi.material_id)+' x'+pi.cantidad; }).join('\n');
    var body   = 'Préstamo del '+p.fecha_salida+':\n'+lineas+'\n\n  Devuelto: '+(fReal||'hoy');
 
    if (socio.email) mail(socio.email, 'Devolución registrada', 'Hola '+socio.nombre+',\n\n'+body+'\n\n¡Gracias!\n\nSaludos,\nClub de Espeleología');
 
    var aviso = prestamos.length > 1 ? '\n\nATENCIÓN: '+( prestamos.length-1)+' préstamo(s) activo(s) pendientes.' : '';
    mail(EMAIL, 'Devolución — '+socio.numero_socio, socio.nombre+' '+socio.apellidos+'\n\n'+body+aviso);
 
    Logger.log('DEVOLUCIÓN OK — '+socio.numero_socio+' | préstamo #'+p.id);
  } catch(err) { Logger.log(err.stack); error('Error (devolución): '+err.message); }
}
 
 
function enviarRecordatoriosVencidos() {
  dbRpc('actualizar_prestamos_vencidos');
  var vencidos = db('v_prestamos_vencidos');
  if (!vencidos.length) return Logger.log('Sin vencidos.');
 
  var porSocio = {};
  vencidos.forEach(function(p){ (porSocio[p.socio] = porSocio[p.socio]||[]).push(p); });
 
  Object.keys(porSocio).forEach(function(ns) {
    var m = db('miembros?numero_socio=eq.'+enc(ns)+'&select=nombre,email')[0];
    if (!m||!m.email) return;
    var lineas = porSocio[ns].map(function(p){ return '  - '+p.material+' x'+p.cantidad+' — venció '+p.fecha_retorno_prevista+' ('+p.dias_retraso+'d)'; }).join('\n');
    mail(m.email, 'Material pendiente de devolución', 'Hola '+m.nombre+',\n\nTienes material pendiente:\n\n'+lineas+'\n\nPor favor devuélvelo pronto.\n\nSaludos,\nClub de Espeleología');
  });
 
  mail(EMAIL, 'Vencidos — '+vencidos.length+' ítem(s)', vencidos.map(function(p){ return p.socio+' | '+p.material+' | '+p.dias_retraso+'d'; }).join('\n'));
}
 
 
function actualizarListaMateriales() {
  var nombres = db('material?estado=neq.baja&select=nombre&order=nombre').map(function(m){ return m.nombre; });
  FormApp.openById(F_PREST).getItems(FormApp.ItemType.GRID)[0].asGridItem().setRows(nombres);
  Logger.log('Materiales actualizados: '+nombres.length);
}
 
 
function configurarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onPrestamSubmit').forForm(F_PREST).onFormSubmit().create();
  ScriptApp.newTrigger('onDevolucionSubmit').forForm(F_DEVOL).onFormSubmit().create();
  ScriptApp.newTrigger('enviarRecordatoriosVencidos').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  Logger.log('Triggers: '+ScriptApp.getProjectTriggers().length);
}
 
 
// ================================================================
// HELPERS
// ================================================================
 
function namedVals(e) {
  if (!e) return null;
  if (e.namedValues) return e.namedValues;
  if (!e.response) return null;
  var r = {};
  e.response.getItemResponses().forEach(function(ir) {
    var item = ir.getItem(), resp = ir.getResponse(), title = item.getTitle();
    if (item.getType() === FormApp.ItemType.GRID) {
      item.asGridItem().getRows().forEach(function(row, i){ r[title+' ['+row+']'] = [(resp||[])[i]||'']; });
    } else {
      r[title] = [resp ? String(resp) : ''];
    }
  });
  return r;
}
 
function val(r, clave) {
  var norm = function(s){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); };
  var k = Object.keys(r).find(function(k){ return norm(k)===norm(clave); });
  return k && r[k][0] ? r[k][0] : null;
}
 
function fecha(str) {
  if (!str) return null;
  var d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  var p = str.trim().split('/');
  return p.length===3 ? p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') : str;
}
 
function hoy() { return new Date().toISOString().split('T')[0]; }
function enc(s) { return encodeURIComponent(s); }
function mail(to, sub, body) { GmailApp.sendEmail(to, '[Espeleología] '+sub, body); }
function error(msg) { Logger.log('ERROR: '+msg); mail(EMAIL, 'Error en gestión de material', msg); }
 
function hdrs(extra) { return Object.assign({'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'}, extra||{}); }
 
function db(q) {
  var r = UrlFetchApp.fetch(SB_URL+q, {method:'GET', headers:hdrs(), muteHttpExceptions:true});
  if (r.getResponseCode()!==200) throw new Error('GET '+q+' → '+r.getContentText());
  return JSON.parse(r.getContentText());
}
 
function dbPost(tabla, datos, ret) {
  var r = UrlFetchApp.fetch(SB_URL+tabla, {method:'POST', headers:hdrs({'Prefer':ret?'return=representation':'return=minimal'}), payload:JSON.stringify(datos), muteHttpExceptions:true});
  if (r.getResponseCode()!==201) throw new Error('POST '+tabla+' → '+r.getContentText());
  return ret ? JSON.parse(r.getContentText()) : null;
}
 
function dbPatch(q, datos) {
  var r = UrlFetchApp.fetch(SB_URL+q, {method:'PATCH', headers:hdrs({'Prefer':'return=minimal'}), payload:JSON.stringify(datos), muteHttpExceptions:true});
  if (r.getResponseCode()!==204) throw new Error('PATCH '+q+' → '+r.getContentText());
}
 
function dbRpc(fn) {
  var r = UrlFetchApp.fetch(SB_URL+'rpc/'+fn, {method:'POST', headers:hdrs(), payload:'{}', muteHttpExceptions:true});
  if (r.getResponseCode()!==200) throw new Error('RPC '+fn+' → '+r.getContentText());
} 
