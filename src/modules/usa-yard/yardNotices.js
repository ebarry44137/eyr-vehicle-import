export const stages = [
  ['RECEIVED_USA','En yarda'], ['LOADED_IN_CONTAINER','Cargado'],
  ['DEPARTED_USA','Exportado'], ['ARRIVED_GUATEMALA','Arribo GT'], ['EMPTIED','Vaciado']
];

export function noticeText(stage, name, vehicle) {
  const model = [vehicle.model_year,vehicle.vehicle_make,vehicle.vehicle_model].filter(Boolean).join(' ');
  const description = (model || 'vehículo')+' (VIN '+vehicle.vin+')';
  const messages = {
    RECEIVED_USA:'Recibimos tu '+description+' en '+(vehicle.yard_name || 'nuestra yarda de USA')+'.',
    LOADED_IN_CONTAINER:'Tu '+description+' ya fue cargado en el contenedor. Te avisaremos cuando salga hacia Guatemala.',
    DEPARTED_USA:'Tu '+description+' salió de Estados Unidos rumbo a Guatemala. Te avisaremos cuando arribe el buque.',
    ARRIVED_GUATEMALA:'Tu '+description+' está arribando al puerto de Santo Tomás de Castilla. 🚢\n\nPara preparar la documentación, necesitamos los siguientes datos de la persona que recibirá el vehículo en Guatemala:\n\n• Nombre completo, tal como aparece en el DPI.\n• Fotos legibles del DPI, de ambos lados.\n• NIT.\n• Dirección fiscal completa, incluyendo municipio y departamento.\n• Número de celular.\n\nSi nos podés compartir la información hoy por este medio, te lo agradeceríamos mucho. ¡Gracias por tu apoyo!',
    EMPTIED:'El '+description+' ya fue descargado del contenedor en Santo Tomás de Castilla.\n\nPara iniciar la gestión aduanal y tramitar el despacho del vehículo en puerto, te pedimos realizar el depósito y enviarnos el comprobante por este medio. ¡Gracias por tu apoyo!'
  };
  return '¡Hola'+(name?', '+name:'')+'! ¡Dios te bendiga! 👷🏽‍♂️\n\n'+messages[stage]+'\n\nEyR Solutions · Agencia Aduanal';
}
