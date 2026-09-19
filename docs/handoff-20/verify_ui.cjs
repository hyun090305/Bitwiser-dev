/* Optional DOM check; npm install linkedom, then node verify_ui.cjs.
 * This verifies controls and simulation, not pixel rendering in a browser.
 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
let parseHTML;
try{({parseHTML}=require('linkedom'))}catch(e){
 if(process.env.BITWISER_LINKEDOM_PATH)({parseHTML}=require(process.env.BITWISER_LINKEDOM_PATH));else throw e;
}
const html=fs.readFileSync(path.join(__dirname,'Bitwiser_20_Final_Answers.html'),'utf8');
const {window}=parseHTML(html),{document}=window;
window.Option=function(label,value){const o=document.createElement('option');o.textContent=label;o.value=value;return o};
for(const s of document.querySelectorAll('select')){
 s.add=o=>s.appendChild(o);
 Object.defineProperty(s,'value',{get(){return this._value??this.options?.[0]?.value??''},set(v){this._value=String(v)}})
}
Object.defineProperty(window.SVGElement.prototype,'viewBox',{get(){const a=(this.getAttribute('viewBox')||'0 0 100 100').split(/\s+/).map(Number);return {baseVal:{x:a[0],y:a[1],width:a[2],height:a[3]}}}});
window.console=console;window.setTimeout=setTimeout;window.Blob=Blob;window.URL=URL;
const ctx=vm.createContext(window);
for(const s of document.querySelectorAll('script'))if(s.type!=='application/json')vm.runInContext(s.textContent,ctx);
const app=window.bitwiser20,$=id=>document.getElementById(id),plain=x=>JSON.parse(JSON.stringify(x));
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'catalog.json'),'utf8'));
assert.equal(app.items.length,20);assert.equal(document.querySelectorAll('#summary tr').length,20);
let selected=0,exampleTicks=0;
for(let i=0;i<20;i++){
 app.select(i);const item=app.items[i],entry=catalog[i];
 assert.equal(item.circuits.planar.net.nodes.length,entry.blocks);
 assert.deepStrictEqual(plain(item.circuits.planar.net),JSON.parse(fs.readFileSync(path.join(__dirname,entry.circuit),'utf8')));
 assert.equal(document.querySelectorAll('#diagram circle').length,entry.blocks);
 $('connection').onclick();assert($('diagram').querySelector('svg'));$('topology').onclick();
 $('example').onclick();assert.equal(app.snapshot().history.length,item.trace.length);
 app.snapshot().history.forEach((row,k)=>assert.deepStrictEqual(plain(row.outputs),plain(item.trace[k].outputs)));
 exampleTicks+=item.trace.length;selected++;
}
const divider=app.items[19];let dividerTicks=0;
for(const c of divider.meta.planar_verification.results){
 app.select(19);
 const u=c.trace[0].inputs;
 for(const el of $('inputs').querySelectorAll('input'))el.checked=!!u[el.dataset.input];
 $('restart').onclick();$('run-divider').onclick();
 const snap=app.snapshot();assert(snap.ended);assert.equal(snap.ticks,c.tick);assert($('judge-status').textContent.startsWith('통과'));
 assert($('tick').disabled);assert($('run-divider').disabled);
 assert([...$('inputs').querySelectorAll('input')].every(el=>el.disabled));
 snap.history.forEach((row,k)=>assert.deepStrictEqual(plain(row.outputs),plain(c.trace[k].outputs)));
 $('tick').onclick();assert.equal(app.snapshot().ticks,c.tick);dividerTicks+=c.tick;
 $('restart').onclick();assert([...$('inputs').querySelectorAll('input')].every(el=>!el.disabled));assert.equal(app.snapshot().ticks,0);
}
app.select(19);for(const el of $('inputs').querySelectorAll('input'))if(el.dataset.input.startsWith('B'))el.checked=false;
$('tick').onclick();assert.equal(app.snapshot().ticks,0);assert($('judge-status').textContent.includes('B=0'));
// An unfinished run must keep the original inputs even if a caller supplies new ones.
app.select(19);app.advance({A0:1,A1:1,A2:1,B0:1,B1:1});app.advance({A0:0,A1:0,A2:0,B0:1,B1:0});
assert.deepStrictEqual(plain(app.snapshot().history[1].inputs),{A0:1,A1:1,A2:1,B0:1,B1:1});
// Fresh run is not a RESET pin and does not sample COMPLETE at tick zero.
$('restart').onclick();assert.equal(app.snapshot().ticks,0);assert.equal(app.snapshot().ended,false);
const result={passed:true,stages_selected:selected,example_ticks:exampleTicks,divider_cases:24,divider_ticks:dividerTicks,
 controls:['selection','topology','pin_graph','example','step','run_to_complete','reset','fixed_divider_inputs','invalid_B_zero','stop_at_first_complete'],
 scope:'LinkeDOM behavior and embedded interpreter; no full-browser pixel rendering'};
fs.writeFileSync(path.join(__dirname,'viewer_verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
