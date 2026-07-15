const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');

const html = fs.readFileSync('app-preventivi.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

const classList = { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
const element = () => {
  const attributi = new Map();
  return {
    value:'', style:{}, className:'', classList, dataset:{}, innerHTML:'', textContent:'',
    src:'', srcdoc:'', href:'', files:[], disabled:false,
    addEventListener(){}, appendChild(){}, remove(){},
    setAttribute(nome, valore){ attributi.set(nome, String(valore)); },
    getAttribute(nome){ return attributi.has(nome) ? attributi.get(nome) : null; },
    removeAttribute(nome){ attributi.delete(nome); },
    querySelectorAll(){ return []; }, querySelector(){ return null; }, focus(){}, click(){}, select(){}
  };
};
const elements = new Map();
const document = {
  body:element(),
  querySelector(selector){
    if(!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  },
  querySelectorAll(){ return []; },
  addEventListener(){},
  createElement(){ return element(); },
  execCommand(){ return true; }
};
const storage = new Map();
const localStorage = {
  getItem(key){ return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value){ storage.set(key, value); }
};
const context = vm.createContext({
  console, document, localStorage, crypto:webcrypto, TextEncoder, TextDecoder, Uint8Array,
  atob:testo=>Buffer.from(testo, 'base64').toString('binary'),
  btoa:testo=>Buffer.from(testo, 'binary').toString('base64'),
  Blob, URL, setTimeout, clearTimeout, navigator:{ clipboard:{ writeText:async()=>{} } },
  fetch:async()=>{ throw new Error('fetch inatteso'); }, Image:function(){}, FileReader:function(){}
});

scripts.forEach((script, index) => {
  new vm.Script(script, { filename:`inline-${index + 1}.js` }).runInContext(context);
});
const run = expression => vm.runInContext(expression, context);

const adesso = new Date();
const dataLocaleAttesa = `${adesso.getFullYear()}-${String(adesso.getMonth()+1).padStart(2,'0')}-${String(adesso.getDate()).padStart(2,'0')}`;
assert.equal(run('oggiISO()'), dataLocaleAttesa);
assert.equal(run('importoVoce({qta:-2,prezzo:100,sconto:0})'), 0);
assert.equal(run('importoVoce({qta:2,prezzo:100,sconto:150})'), 0);
assert.equal(run('totaliPreventivo({voci:[{qta:2,prezzo:100,sconto:0}],scontoFinale:150,iva:22}).totale'), 0);
assert.equal(run("scadenzaISO({data:'2026-07-14',validita:-2})"), '2026-07-15');

run("globalThis.catalogoLegacy={prodotti:[{id:'legacy',nome:'Prodotto legacy'}],lapidi:[]}; normalizzaCatalogo(catalogoLegacy)");
assert.equal(run('catalogoLegacy.prodotti[0].costo'), 0);
assert.equal(run('catalogoLegacy.prodotti[0].allegati.length'), 0);
assert.equal(run('catalogoLegacy.fornitori.length'), 0);
for(const campo of ['fornitoreNome','fornitoreEmail','codiceFornitore','colore','noteFornitore','codiceIdentificativo'])
  assert.equal(run(`catalogoLegacy.prodotti[0].${campo}`), '');
run(`globalThis.catalogoLegacyFornitori={prodotti:[
  {id:'p1',fornitoreNome:'Ideal Standard',fornitoreEmail:'vecchia@fornitore.invalid',aggiornatoIl:10},
  {id:'p2',fornitoreNome:'  ideal   standard  ',fornitoreEmail:'nuova@fornitore.invalid',aggiornatoIl:20},
  {id:'p3',fornitoreNome:'Grohe',fornitoreEmail:'grohe@fornitore.invalid',aggiornatoIl:15}
],lapidi:[]}; normalizzaCatalogo(catalogoLegacyFornitori)`);
assert.equal(run('catalogoLegacyFornitori.fornitori.length'), 2);
assert.equal(run("catalogoLegacyFornitori.fornitori.find(f=>f.id==='ideal standard').email"), 'nuova@fornitore.invalid');
run(`globalThis.catalogoConRegistro={prodotti:[
  {id:'p1',fornitoreNome:'Ideal Standard',fornitoreEmail:'email-vecchia@fornitore.invalid',aggiornatoIl:100}
],fornitori:[{nome:'ideal standard',email:'email-salvata@fornitore.invalid',aggiornatoIl:30}],lapidi:[]}; normalizzaCatalogo(catalogoConRegistro)`);
assert.equal(run('catalogoConRegistro.fornitori.length'), 1);
assert.equal(run('catalogoConRegistro.fornitori[0].email'), 'email-salvata@fornitore.invalid');
assert.match(html, /<select id="p-fornitore-salvato">/);
assert.doesNotMatch(html, /<datalist id="p-fornitori-salvati">/);
run(`CAT={prodotti:[],fornitori:[],lapidi:[]};
  memorizzaFornitore('Ideal Standard','prima@fornitore.invalid');
  memorizzaFornitore('  IDEAL   STANDARD ','nuova@fornitore.invalid');
  disegnaFornitoriMemoria('ideal standard');
  salvaLS()`);
assert.equal(run('CAT.fornitori.length'), 1);
assert.equal(run('CAT.fornitori[0].email'), 'nuova@fornitore.invalid');
assert.equal(JSON.parse(storage.get('ap_catalogo')).fornitori.length, 1);
assert.ok(run("document.querySelector('#p-fornitore-salvato').innerHTML.toLowerCase()").includes('ideal standard'));
assert.equal(run("document.querySelector('#p-fornitore-salvato').value"), 'ideal standard');
run("document.querySelector('#p-fornitore-nome').value=''; document.querySelector('#p-fornitore-email').value=''; applicaFornitoreMemorizzato('ideal standard')");
assert.equal(run("document.querySelector('#p-fornitore-nome').value"), 'IDEAL STANDARD');
assert.equal(run("document.querySelector('#p-fornitore-email').value"), 'nuova@fornitore.invalid');
run("document.querySelector('#p-fornitore-email').value='manuale@fornitore.invalid'; globalThis.matchFornitoreSconosciuto=applicaFornitoreMemorizzato('Sconosciuto')");
assert.equal(run('matchFornitoreSconosciuto'), false);
assert.equal(run("document.querySelector('#p-fornitore-email').value"), 'manuale@fornitore.invalid');
run("globalThis.preventiviLegacy={preventivi:[{id:'legacy-prev',voci:[{id:'legacy-voce',ambiente:'   '}]}],lapidi:[]}; normalizzaPreventivi(preventiviLegacy)");
assert.equal(run('preventiviLegacy.preventivi[0].versione'), 1);
assert.equal(run('preventiviLegacy.preventivi[0].revisioni.length'), 0);
assert.equal(run('preventiviLegacy.preventivi[0].voci[0].ambiente'), 'Bagno 1');

run("PREV={preventivi:[{id:'x',numero:'Q-2026-001',clienteNome:'Prima',clienteTelefono:'',clienteEmail:'',clienteIndirizzo:'',venditore:'Fabio',data:'2026-07-14',validita:30,iva:22,scontoFinale:0,titolo:'',intro:'',nota:'',foto:[],voci:[],stato:'bozza',pubblicatoUrl:'',slug:'',aggiornatoIl:1}],lapidi:[]}; apriEditor('x'); Q.clienteNome='Dopo'");
assert.equal(run('PREV.preventivi[0].clienteNome'), 'Prima');
run('salvaPreventivo(true)');
assert.equal(run('PREV.preventivi[0].clienteNome'), 'Dopo');
assert.equal(run('PREV.preventivi[0].versione'), 2);
assert.equal(run('PREV.preventivi[0].revisioni.length'), 1);
assert.equal(run("PREV.preventivi[0].revisioni[0].modifiche.includes('Modifica: Cliente')"), true);
run('salvaPreventivo(true)');
assert.equal(run('PREV.preventivi[0].versione'), 2);
run("Q.clienteNome='Non salvato'");
assert.equal(run('PREV.preventivi[0].clienteNome'), 'Dopo');

run("GH={utente:'Acme',repoPagine:'acme.github.io'}");
assert.equal(run("urlPaginaPubblicata('p/a.html')"), 'https://Acme.github.io/p/a.html');
run("GH={utente:'Acme',repoPagine:'preventivi'}");
assert.equal(run("urlPaginaPubblicata('p/a.html')"), 'https://Acme.github.io/preventivi/p/a.html');
assert.match(html, /Q\.pubblicatoUrl\s*=\s*urlPaginaPubblicata\(percorso\)\s*\+\s*'\?v='/);
assert.match(html, /const percorso\s*=\s*'p\/'\s*\+\s*Q\.slug\s*\+\s*'-'\s*\+\s*Q\.pubblicazioneId\s*\+\s*'\.html'/);

run("CAT={prodotti:[{id:'originale',nome:'Rubinetto',categoria:CATEGORIE[0],descrizione:'Descrizione',costo:40,prezzo:100,unita:'pz',foto:'data:image/jpeg;base64,AAAA',allegati:[{id:'pdf1',nome:'scheda.pdf',dati:'data:application/pdf;base64,AAAA'}],fornitoreNome:'FORNITORE-RISERVATO',fornitoreEmail:'riservato@fornitore.invalid',codiceFornitore:'SKU-RISERVATO-42',colore:'FINITURA-RISERVATA',noteFornitore:'NOTA-RISERVATA-PER-FORNITORE',codiceIdentificativo:'ID-RISERVATO-77',aggiornatoIl:1}],fornitori:[{nome:'REGISTRO-FORNITORE-SEGRETO',email:'registro-segreto@fornitore.invalid',aggiornatoIl:1}],lapidi:[]}; apriModaleProdotto(CAT.prodotti[0], true)");
assert.equal(run('prodottoInModifica'), null);
assert.equal(run('duplicazioneProdottoAttiva'), true);
assert.equal(run("document.querySelector('#p-nome').value"), 'Rubinetto');
assert.equal(run("document.querySelector('#p-foto-anteprima').src"), 'data:image/jpeg;base64,AAAA');
assert.equal(run("document.querySelector('#p-fornitore-nome').value"), 'FORNITORE-RISERVATO');
assert.equal(run("document.querySelector('#p-codice-fornitore').value"), 'SKU-RISERVATO-42');
assert.equal(run("document.querySelector('#p-codice-identificativo').value"), '');
assert.equal(run('allegatiProdottoTemp.length'), 1);
run("globalThis.voceDaCatalogo=creaVoceDaProdotto(CAT.prodotti[0],'Bagno 2')");
assert.equal(run('voceDaCatalogo.ambiente'), 'Bagno 2');
assert.equal(run('voceDaCatalogo.codiceFornitore'), 'SKU-RISERVATO-42');
assert.equal(run('voceDaCatalogo.noteFornitore'), 'NOTA-RISERVATA-PER-FORNITORE');
run("registraProdotto({nome:'Rubinetto variante',categoria:CATEGORIE[0],descrizione:'Descrizione',costo:40,prezzo:100,unita:'pz',foto:'data:image/jpeg;base64,BBBB',allegati:allegatiProdottoTemp,fornitoreNome:'',fornitoreEmail:'',codiceFornitore:'',colore:'',noteFornitore:'',codiceIdentificativo:'',aggiornatoIl:2})");
assert.equal(run('CAT.prodotti.length'), 2);
assert.notEqual(run('CAT.prodotti[1].id'), 'originale');
assert.equal(run('CAT.prodotti[0].foto'), 'data:image/jpeg;base64,AAAA');
assert.equal(run('CAT.prodotti[1].foto'), 'data:image/jpeg;base64,BBBB');

run("CAT.prodotti[0].costo=999; CAT.prodotti[0].allegati=[{id:'pdf1',nome:'dimensioni.pdf',dati:'data:application/pdf;base64,AAAA'}]");
const paginaCliente = run("paginaCliente({id:'p1',numero:'Q-2026-999',versione:3,pubblicazioneId:'BUILD-PUBBLICAZIONE-123',clienteNome:'Mario',venditore:'Fabio',data:'2026-07-14',validita:30,iva:22,scontoFinale:0,titolo:'',intro:'Introduzione',nota:'Nota iniziale',foto:['data:image/jpeg;base64,AAAA'],voci:[{id:'v1',prodottoId:CAT.prodotti[0].id,descrizione:CAT.prodotti[0].nome,categoria:CAT.prodotti[0].categoria,ambiente:'Bagno 1',qta:1,unita:'pz',prezzo:100,sconto:0}]},IMP)");
assert.ok(paginaCliente.indexOf('Nota iniziale') < paginaCliente.indexOf('La tua selezione'));
assert.ok(paginaCliente.indexOf('Rendering del progetto') > paginaCliente.indexOf('Voci e importi'));
assert.ok(paginaCliente.includes('dimensioni.pdf'));
assert.ok(paginaCliente.includes('Scegli gli articoli che vuoi confermare'));
assert.ok(paginaCliente.includes('@page{size:A4;margin:14mm 13mm 16mm}'));
assert.ok(!paginaCliente.includes('Costo interno'));
assert.ok(!paginaCliente.includes('€ 999,00'));
for(const segreto of ['FORNITORE-RISERVATO','riservato@fornitore.invalid','SKU-RISERVATO-42','FINITURA-RISERVATA','NOTA-RISERVATA-PER-FORNITORE','ID-RISERVATO-77','REGISTRO-FORNITORE-SEGRETO','registro-segreto@fornitore.invalid'])
  assert.ok(!paginaCliente.includes(segreto), `Il campo interno ${segreto} non deve apparire nella pagina cliente`);
assert.ok(paginaCliente.includes('<meta name="preventivo-build" content="BUILD-PUBBLICAZIONE-123">'));
const scriptPaginaCliente = [...paginaCliente.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
scriptPaginaCliente.forEach((script, index) => new vm.Script(script, { filename:`cliente-${index + 1}.js` }));

const paginaDueBagni = run("paginaCliente({id:'p-bagni',numero:'Q-2026-BAGNI',versione:1,clienteNome:'Cliente',venditore:'Fabio',data:'2026-07-14',validita:30,iva:22,scontoFinale:0,titolo:'',intro:'Introduzione',nota:'',foto:[],voci:[{id:'v2',prodottoId:'originale',descrizione:'Prodotto bagno due',categoria:CATEGORIE[0],ambiente:'Bagno 2',qta:1,unita:'pz',prezzo:100,sconto:0},{id:'v1',prodottoId:'originale',descrizione:'Prodotto bagno uno',categoria:CATEGORIE[0],ambiente:'Bagno 1',qta:1,unita:'pz',prezzo:100,sconto:0}]},IMP)");
const dettaglioDueBagni = paginaDueBagni.slice(paginaDueBagni.indexOf('<tbody>'), paginaDueBagni.indexOf('</tbody>'));
const posizioneBagno1 = dettaglioDueBagni.indexOf('Bagno 1');
const posizioneProdotto1 = dettaglioDueBagni.indexOf('Prodotto bagno uno');
const posizioneBagno2 = dettaglioDueBagni.indexOf('Bagno 2');
const posizioneProdotto2 = dettaglioDueBagni.indexOf('Prodotto bagno due');
assert.ok(posizioneBagno1 >= 0 && posizioneBagno1 < posizioneProdotto1);
assert.ok(posizioneProdotto1 < posizioneBagno2 && posizioneBagno2 < posizioneProdotto2);
assert.equal((paginaDueBagni.match(/class="selezione-ambiente"/g)||[]).length, 2);
assert.equal((paginaDueBagni.match(/class="selezione-card"/g)||[]).length, 2);
assert.ok(dettaglioDueBagni.includes('data-ambiente="Bagno 1"'));
assert.ok(dettaglioDueBagni.includes('data-ambiente="Bagno 2"'));

run(`CAT={prodotti:[
  {id:'alfa-1',fornitoreNome:'Fornitore Alfa',fornitoreEmail:'alfa@fornitore.invalid',codiceFornitore:'ALFA-SKU-001',colore:'Nero opaco',noteFornitore:'Imballo rinforzato',codiceIdentificativo:'INT-ALFA-001',costo:12345.67},
  {id:'alfa-2',fornitoreNome:'Fornitore Alfa',fornitoreEmail:'alfa@fornitore.invalid',codiceFornitore:'ALFA-SKU-002',colore:'Cromo',noteFornitore:'Con piletta coordinata',codiceIdentificativo:'INT-ALFA-002',costo:23456.78},
  {id:'beta-1',fornitoreNome:'Fornitore Beta',fornitoreEmail:'beta@fornitore.invalid',codiceFornitore:'BETA-SKU-001',colore:'Bianco',noteFornitore:'Consegna separata',codiceIdentificativo:'INT-BETA-001',costo:34567.89}
],lapidi:[]};
globalThis.preventivoFornitori={id:'prev-fornitori',numero:'Q-2026-FORNITORI',versione:4,clienteNome:'CLIENTE-SEGRETO-ROSSI',clienteTelefono:'339-SEGRETO',clienteEmail:'cliente-segreto@example.invalid',clienteIndirizzo:'VIA-SEGRETA-99',voci:[
  {id:'fa1',prodottoId:'alfa-1',descrizione:'Miscelatore Alfa',categoria:CATEGORIE[0],ambiente:'Bagno 2',qta:2,unita:'pz',prezzo:98765.43,sconto:17,margine:45678.91},
  {id:'fa2',prodottoId:'alfa-2',descrizione:'Soffione Alfa',categoria:CATEGORIE[0],ambiente:'Bagno 1',qta:1,unita:'pz',prezzo:87654.32,sconto:13,margine:56789.12},
  {id:'fb1',prodottoId:'beta-1',descrizione:'Sanitario Beta',categoria:CATEGORIE[1],ambiente:'Bagno 1',qta:3,unita:'pz',prezzo:76543.21,sconto:11,margine:67891.23}
]};
globalThis.gruppiFornitoriTest=creaGruppiFornitori(preventivoFornitori);
globalThis.testiFornitoriTest=gruppiFornitoriTest.map(g=>testoRichiestaFornitore(preventivoFornitori,g));`);
assert.equal(run('gruppiFornitoriTest.length'), 2);
assert.equal(run('gruppiFornitoriTest[0].nome'), 'Fornitore Alfa');
assert.equal(run('gruppiFornitoriTest[0].email'), 'alfa@fornitore.invalid');
assert.equal(run('gruppiFornitoriTest[0].articoli.length'), 2);
assert.equal(run('gruppiFornitoriTest[1].nome'), 'Fornitore Beta');
const richiesteFornitori = run("testiFornitoriTest.join('\\n---\\n')");
for(const datoInterno of ['ALFA-SKU-001','ALFA-SKU-002','BETA-SKU-001','INT-ALFA-001','INT-ALFA-002','INT-BETA-001','Nero opaco','Cromo','Bianco','Imballo rinforzato','Con piletta coordinata','Consegna separata'])
  assert.ok(richiesteFornitori.includes(datoInterno), `La richiesta deve includere ${datoInterno}`);
assert.ok(richiesteFornitori.indexOf('BAGNO 1') < richiesteFornitori.indexOf('BAGNO 2'));
for(const datoCliente of ['CLIENTE-SEGRETO-ROSSI','339-SEGRETO','cliente-segreto@example.invalid','VIA-SEGRETA-99'])
  assert.ok(!richiesteFornitori.includes(datoCliente), `La richiesta non deve includere ${datoCliente}`);
for(const valoreEconomico of ['98765.43','87654.32','76543.21','12345.67','23456.78','34567.89','45678.91','56789.12','67891.23'])
  assert.ok(!richiesteFornitori.includes(valoreEconomico), `La richiesta non deve includere il valore economico ${valoreEconomico}`);

run("CAT={prodotti:[{id:'storico',fornitoreNome:'Fornitore nuovo',fornitoreEmail:'nuova@fornitore.invalid',codiceFornitore:'SKU-NUOVO',colore:'Cromo nuovo',noteFornitore:'Nota nuova',codiceIdentificativo:'ID-NUOVO'}],lapidi:[]}; globalThis.voceStorica={prodottoId:'storico',fornitoreNome:'Fornitore storico',fornitoreEmail:'vecchia@fornitore.invalid',codiceFornitore:'SKU-STORICO',colore:'Nero storico',noteFornitore:'Nota storica',codiceIdentificativo:'ID-STORICO'}");
assert.equal(run("valoreFornitoreVoce(voceStorica,'codiceFornitore')"), 'SKU-STORICO');
assert.equal(run("valoreFornitoreVoce(voceStorica,'colore')"), 'Nero storico');
assert.equal(run("valoreFornitoreVoce(voceStorica,'fornitoreEmail')"), 'nuova@fornitore.invalid');
run("globalThis.gruppiFiltrati=creaGruppiFornitori({voci:[{prodottoId:'storico',descrizione:'Zero',qta:0,unita:'pz'},{prodottoId:'',descrizione:'Voce libera',qta:1,unita:'pz'},{prodottoId:'storico',descrizione:'Valida',qta:1,unita:'pz'}]})");
assert.equal(run('gruppiFiltrati.length'), 1);
assert.equal(run('gruppiFiltrati[0].articoli.length'), 1);
assert.equal(run('gruppiFiltrati[0].articoli[0].descrizione'), 'Valida');

async function verificaRecuperoConflittoGitHub(){
  const richieste = [];
  const remoto = JSON.stringify({prodotti:[],lapidi:[]}, null, 2);
  let letture = 0;
  let scritture = 0;
  context.fetch = async (url, opzioni={}) => {
    richieste.push({url, opzioni});
    if(!opzioni.method){
      letture++;
      return {ok:true,status:200,json:async()=>({content:Buffer.from(remoto).toString('base64'),sha:letture===1?'sha-vecchio':'sha-nuovo'})};
    }
    scritture++;
    if(scritture===1) return {ok:false,status:409,json:async()=>({message:'data/catalogo.json does not match sha-vecchio'})};
    return {ok:true,status:200,json:async()=>({content:{sha:'sha-salvato'}})};
  };
  run("GH={attivo:true,token:'token',utente:'acme',repoDati:'dati',branch:'main'}; CAT={prodotti:[{id:'p1',nome:'Prodotto',aggiornatoIl:2}],lapidi:[]}");
  await run('sincronizzaCatalogo()');

  const get = richieste.filter(r=>!r.opzioni.method);
  const put = richieste.filter(r=>r.opzioni.method==='PUT');
  assert.equal(get.length, 2);
  assert.notEqual(get[0].url, get[1].url);
  assert.equal(get[1].opzioni.cache, undefined);
  assert.equal(get[1].opzioni.headers['Cache-Control'], undefined);
  assert.equal(JSON.parse(put[1].opzioni.body).sha, 'sha-nuovo');
}

async function verificaLetturaFileGitHubGrande(){
  const richieste = [];
  const remoto = JSON.stringify({prodotti:[{id:'grande',aggiornatoIl:1}],lapidi:[]});
  context.fetch = async (url, opzioni={}) => {
    richieste.push({url, opzioni});
    if(opzioni.headers.Accept === 'application/vnd.github.raw+json')
      return {ok:true,status:200,text:async()=>remoto};
    return {ok:true,status:200,json:async()=>({content:'',encoding:'none',sha:'sha-grande'})};
  };
  run("GH={attivo:true,token:'token',utente:'acme',repoDati:'dati',branch:'main'}");
  const letto = await run("ghLeggi('dati','data/catalogo.json')");
  assert.equal(letto.testo, remoto);
  assert.equal(letto.sha, 'sha-grande');
  assert.equal(richieste.length, 2);
  assert.equal(richieste[1].opzioni.headers.Accept, 'application/vnd.github.raw+json');
}

async function verificaSincronizzazioneFornitori(){
  const richieste = [];
  const remoto = JSON.stringify({
    prodotti:[],
    fornitori:[
      {id:'ideal standard',nome:'IDEAL STANDARD',email:'remota-vecchia@fornitore.invalid',aggiornatoIl:10},
      {id:'fornitore remoto',nome:'Fornitore Remoto',email:'remoto@fornitore.invalid',aggiornatoIl:15}
    ],
    lapidi:[]
  });
  context.fetch = async (url, opzioni={}) => {
    richieste.push({url, opzioni});
    if(opzioni.method==='PUT') return {ok:true,status:200,json:async()=>({content:{sha:'sha-salvato'}})};
    return {ok:true,status:200,json:async()=>({content:Buffer.from(remoto).toString('base64'),encoding:'base64',sha:'sha-remoto'})};
  };
  run(`GH={attivo:true,token:'token',utente:'acme',repoDati:'dati',branch:'main'};
    CAT={prodotti:[],fornitori:[
      {id:'ideal standard',nome:'Ideal Standard',email:'locale-nuova@fornitore.invalid',aggiornatoIl:20},
      {id:'fornitore locale',nome:'Fornitore Locale',email:'locale@fornitore.invalid',aggiornatoIl:12}
    ],lapidi:[]}`);
  await run('sincronizzaCatalogo()');
  assert.equal(run('CAT.fornitori.length'), 3);
  assert.equal(run("CAT.fornitori.filter(f=>f.id==='ideal standard').length"), 1);
  assert.equal(run("CAT.fornitori.find(f=>f.id==='ideal standard').email"), 'locale-nuova@fornitore.invalid');
  assert.equal(run("CAT.fornitori.some(f=>f.nome==='Fornitore Locale')"), true);
  assert.equal(run("CAT.fornitori.some(f=>f.nome==='Fornitore Remoto')"), true);
  const put = richieste.find(r=>r.opzioni.method==='PUT');
  assert.ok(put);
  const inviato = JSON.parse(Buffer.from(JSON.parse(put.opzioni.body).content, 'base64').toString('utf8'));
  assert.equal(inviato.fornitori.length, 3);
  assert.equal(inviato.fornitori.find(f=>f.id==='ideal standard').email, 'locale-nuova@fornitore.invalid');
}

async function verificaNessunaScritturaPerSoloFormattazione(){
  let scritture = 0;
  const remoto = '{"lapidi": [], "fornitori": [], "prodotti": [{"noteFornitore":"", "aggiornatoIl":2, "fornitoreNome":"", "nome":"Prodotto", "allegati":[], "codiceFornitore":"", "id":"p1", "fornitoreEmail":"", "costo":0, "colore":"", "codiceIdentificativo":""}]}';
  context.fetch = async (url, opzioni={}) => {
    if(opzioni.method === 'PUT'){ scritture++; throw new Error('scrittura inattesa'); }
    return {ok:true,status:200,json:async()=>({content:Buffer.from(remoto).toString('base64'),encoding:'base64',sha:'sha'})};
  };
  run("GH={attivo:true,token:'token',utente:'acme',repoDati:'dati',branch:'main'}; CAT={prodotti:[{id:'p1',nome:'Prodotto',costo:0,allegati:[],fornitoreNome:'',fornitoreEmail:'',codiceFornitore:'',colore:'',noteFornitore:'',codiceIdentificativo:'',aggiornatoIl:2}],fornitori:[],lapidi:[]}");
  await run('sincronizzaCatalogo()');
  assert.equal(scritture, 0);
}

async function verificaPollingPaginaPubblicata(){
  const richieste = [];
  context.fetch = async (url, opzioni={}) => {
    richieste.push({url, opzioni});
    return {
      ok:true,
      status:206,
      text:async()=>'<html><head><meta name="preventivo-build" content="BUILD-ONLINE-456"></head></html>'
    };
  };
  run("preparaVerificaLink('https://acme.github.io/preventivi/p/q.html?v=BUILD-ONLINE-456','BUILD-ONLINE-456')");
  assert.equal(await run('verificaPaginaOnline(1)'), true);
  assert.equal(richieste.length, 1);
  assert.match(richieste[0].url, /\?v=BUILD-ONLINE-456&probe=1-\d+$/);
  assert.equal(richieste[0].opzioni.cache, 'no-store');
  assert.equal(richieste[0].opzioni.headers.Range, 'bytes=0-4095');
  assert.equal(run("document.querySelector('#link-pubblicato-stato').className"), 'pubblicazione-stato ok');
  assert.equal(run("document.querySelector('#btn-copia-link').disabled"), false);
  assert.equal(run("document.querySelector('#btn-apri-link').getAttribute('aria-disabled')"), 'false');

  context.fetch = async () => ({ok:true,status:200,text:async()=>'<meta name="preventivo-build" content="VERSIONE-VECCHIA">'});
  assert.equal(await run("controllaVersioneOnline('https://acme.github.io/p/q.html','BUILD-ONLINE-456',2)"), false);
}

Promise.resolve().then(verificaRecuperoConflittoGitHub).then(verificaLetturaFileGitHubGrande).then(verificaSincronizzazioneFornitori).then(verificaNessunaScritturaPerSoloFormattazione).then(verificaPollingPaginaPubblicata).then(()=>{
  console.log(`OK: sintassi di ${scripts.length} script e test di regressione superati`);
}).catch(errore=>{
  console.error(errore);
  process.exitCode = 1;
});
