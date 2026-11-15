// Perfiles de la capa física (ver Etapa 2). pkt = bytes de carga por paquete DATA.
export const PROFILES=[
 {id:0,name:'Robusto',bits:3,ms:60,df:125,f0:1800,pkt:24},
 {id:1,name:'Normal',bits:4,ms:40,df:125,f0:1800,pkt:48},
 {id:2,name:'Rápido',bits:4,ms:25,df:150,f0:1800,pkt:64}];
export const CHIRP={f0:1500,f1:4500,ms:200};
export const SIL=0.05,TRAIN=6,AMP=0.6;
// Umbrales de SNR (dB) PROVISIONALES: deben ajustarse con las mediciones reales de la Etapa 4.
export const QUALITY=[[15,'Excelente'],[10,'Buena'],[6,'Regular'],[-99,'Mala']];
