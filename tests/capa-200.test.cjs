'use strict';
// 0.3.200: capa de pagina - reduzida ao enviar, e a capa antiga e apagada ao trocar (servidor e Drive).
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const jpeg=require('jpeg-js');const {shrinkJpeg,exifOrientation}=require('../src/services/thumb');
function photo(W=3000,H=1000,q=78){const data=Buffer.alloc(W*H*4);for(let i=0;i<W*H;i++){data[i*4]=(i%W)%256;data[i*4+1]=Math.floor(i/W)%256;data[i*4+2]=(i*7)%256;data[i*4+3]=255;}return Buffer.from(jpeg.encode({data,width:W,height:H},q).data);}
function withExif(buf,orientation){ // insere um APP1 EXIF minimo com a orientacao
 const tiff=Buffer.alloc(26);tiff.write('MM',0,'latin1');tiff.writeUInt16BE(42,2);tiff.writeUInt32BE(8,4);tiff.writeUInt16BE(1,8);tiff.writeUInt16BE(0x0112,10);tiff.writeUInt16BE(3,12);tiff.writeUInt32BE(1,14);tiff.writeUInt16BE(orientation,18);
 const exif=Buffer.concat([Buffer.from('Exif\0\0','latin1'),tiff]),seg=Buffer.alloc(4);seg[0]=0xff;seg[1]=0xe1;seg.writeUInt16BE(exif.length+2,2);
 return Buffer.concat([buf.subarray(0,2),seg,exif,buf.subarray(2)]);}
test('shrinkJpeg: reduz capa larga, ignora o que nao precisa e nao gira foto com EXIF',()=>{
 const big=photo(),small=shrinkJpeg(big),d=jpeg.decode(small);
 assert.equal(d.width,1600);assert.equal(d.height,533);assert.ok(small.length<big.length*0.6,'bem menor que o original');
 assert.equal(shrinkJpeg(photo(800,200,80)),null,'ja pequena');assert.equal(shrinkJpeg(Buffer.from('nao e jpeg')),null);
 assert.equal(exifOrientation(withExif(big,6)),6);assert.equal(shrinkJpeg(withExif(big,6)),null,'orientacao 6: nao mexe');
 assert.ok(shrinkJpeg(withExif(big,1)),'orientacao 1 (normal): pode reduzir');
});
function setup(t){const {core}=fixture(t);const w=core.workspace;
 const page=w.save({kind:'user_page',title:'Minha pagina',area:'Pessoal',data:{cover_type:'gradient',cover_value:'',cover_attachment_id:''}});
 const up=(name='capa.jpg',buf=photo())=>w.attach(page.id,{name,mime:'image/jpeg',base64:buf.toString('base64')});
 const setCover=(id,type='attachment')=>{const cur=w.get(page.id);return w.save({...cur,data:{...cur.data,cover_type:type,cover_attachment_id:id}},page.id);};
 return {w,page,up,setCover};
}
test('a capa enviada fica reduzida no servidor (1600 px), e outros arquivos nao sao mexidos',t=>{
 const {w,up,page}=setup(t);
 const att=up();assert.ok(att.bytes<photo().length*0.6);
 const row=w.attachment(att.id);assert.equal(jpeg.decode(Buffer.from(row.blob)).width,1600);
 const outro=w.attach(page.id,{name:'foto.jpg',mime:'image/jpeg',base64:photo().toString('base64')});
 assert.equal(jpeg.decode(Buffer.from(w.attachment(outro.id).blob)).width,3000,'so "capa.*" e reduzida');
});
test('a capa antiga fica nas versoes recentes (desfazer volta a abrir); sem versoes ela e apagada; arquivo de outra pagina/registro nao e apagado',t=>{
 const {w,page,up,setCover}=setup(t);
 const a=up(),b=up();
 setCover(a.id);assert.ok(w.attachment(a.id),'a primeira capa fica');
 setCover(b.id);assert.ok(w.attachment(a.id),'a antiga fica: esta nas versoes recentes e o desfazer precisa dela');assert.ok(w.attachment(b.id),'a nova fica');
 setCover('', 'gradient');assert.ok(w.attachment(b.id),'tirar a capa tambem guarda o arquivo para o desfazer');
 w.db.prepare('DELETE FROM entity_versions WHERE entity_id=?').run(page.id);assert.equal(w.dropOldCover(page.id,a.id),true);assert.throws(()=>w.attachment(a.id),/n.o encontrado/i,'sem versoes que a citem, a antiga e apagada');
 // compartilhada: outra pagina aponta para o mesmo arquivo -> nao apaga
 const c=up(),other=w.save({kind:'user_page',title:'Outra',area:'Pessoal',data:{cover_type:'attachment',cover_value:'',cover_attachment_id:c.id}});
 setCover(c.id);setCover('', 'gradient');assert.ok(w.attachment(c.id),'a outra pagina ainda usa: fica');
 // anexo comum da pagina (nao e capa) nunca e apagado por troca de capa
 const doc=w.attach(page.id,{name:'contrato.pdf',mime:'application/pdf',base64:Buffer.from('x').toString('base64')});
 const d=up();setCover(d.id);setCover('', 'gradient');assert.ok(w.attachment(doc.id));
});
test('faxina das capas que sobraram de trocas antigas (so as com mais de 1 hora)',t=>{
 const {w,page,up,setCover}=setup(t);
 const velha=up(),atual=up(),recente=up();
 setCover(atual.id);
 const old=new Date(Date.now()-3*3600*1000).toISOString();
 w.db.prepare('UPDATE attachments SET created_at=? WHERE id IN (?,?)').run(old,velha.id,atual.id);
 const r=w.cleanupOrphanCovers();
 assert.equal(r.removed,1,'so a velha');assert.throws(()=>w.attachment(velha.id));
 assert.ok(w.attachment(atual.id),'a capa atual fica');assert.ok(w.attachment(recente.id),'a recente fica (o app ainda pode estar salvando a pagina)');
 assert.equal(w.cleanupOrphanCovers().removed,0,'rodar de novo nao muda nada');
});
test('o servico do Google apaga tambem a copia da capa no Drive',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const g=fs.readFileSync(path.join(__dirname,'..','src/services/google.js'),'utf8'),sv=fs.readFileSync(path.join(__dirname,'..','src/server.js'),'utf8');
 assert.ok(g.includes("workspace.dropAttachment = (attId) => { const a = dropOriginal(attId); if (a && a.drive_id) this.call('DELETE', DRIVE + '/files/' + a.drive_id)"));
 assert.ok(sv.includes('ws.cleanupOrphanCovers();await ws.shrinkExistingCovers('),'faxina e reducao ligadas no servidor');
});

test('capas que JA estavam no servidor tambem sao reduzidas (so as largas, sem mexer em outros arquivos)',async t=>{
 const {w,page}=setup(t);
 const grande=w.attach(page.id,{name:'foto.jpg',mime:'image/jpeg',base64:photo().toString('base64')});          // vem do jeito antigo: sem reducao
 const pequena=w.attach(page.id,{name:'foto2.jpg',mime:'image/jpeg',base64:photo(1200,400,80).toString('base64')});
 const naoCapa=w.attach(page.id,{name:'foto3.jpg',mime:'image/jpeg',base64:photo().toString('base64')});
 w.db.prepare("UPDATE attachments SET name='capa.jpg' WHERE id IN (?,?)").run(grande.id,pequena.id);
 const antes=w.attachment(grande.id).bytes,antesPeq=w.attachment(pequena.id).bytes;
 assert.equal((await w.shrinkExistingCovers({isBusy:()=>true})).shrunk,0,'enquanto o envio ao Drive roda, nao mexe');
 const r=await w.shrinkExistingCovers();
 assert.equal(r.shrunk,1);assert.ok(r.saved>0);
 const row=w.attachment(grande.id);assert.equal(jpeg.decode(Buffer.from(row.blob)).width,1600);assert.ok(row.bytes<antes*0.6);assert.equal(row.bytes,row.blob.length,'o tamanho gravado acompanha');
 assert.equal(w.attachment(pequena.id).bytes,antesPeq,'capa ja pequena: intacta');
 assert.equal(jpeg.decode(Buffer.from(w.attachment(naoCapa.id).blob)).width,3000,'anexo que nao e capa: intacto');
 assert.equal((await w.shrinkExistingCovers()).shrunk,0,'rodar de novo nao refaz');
});
