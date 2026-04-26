// ================================================================
// CONFIGURAR TRIGGERS 
// ================================================================
function configurarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('onPrestamSubmit')
    .forForm(ID_FORM_PRESTAMO)
    .onFormSubmit()
    .create();

  ScriptApp.newTrigger('onDevolucionSubmit')
    .forForm(ID_FORM_DEVOLUCION)
    .onFormSubmit()
    .create();

  ScriptApp.newTrigger('enviarRecordatoriosVencidos')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  Logger.log('Triggers configurados: ' + ScriptApp.getProjectTriggers().length);
}