const S = require('./js/engine.js'), V = require('./js/validate.js');
const sample = [
 {id:'P1',arrival:0,burst:6,priority:2,queue:0},{id:'P2',arrival:1,burst:4,priority:4,queue:1},
 {id:'P3',arrival:2,burst:7,priority:5,queue:2},{id:'P4',arrival:4,burst:3,priority:1,queue:0},
 {id:'P5',arrival:5,burst:2,priority:3,queue:1}];
const show = r => console.log(r.name, JSON.stringify(r.segments.map(s=>`${s.id||'idle'}:${s.start}-${s.end}`)), r.rows.map(x=>`${x.id} CT${x.ct} TAT${x.tat} WT${x.wt} RT${x.rt}`).join(' | '), r.metrics);
show(S.simulate(sample,{algorithm:'priority',preemptive:false}));
show(S.simulate(sample,{algorithm:'priority',preemptive:true}));
show(S.simulate(sample,{algorithm:'mlq',policies:['PRIORITY','RR','FCFS'],quantum:2}));
// edge: single process, idle gap at start, gap in middle
show(S.simulate([{id:'A',arrival:3,burst:2,priority:1,queue:0}],{algorithm:'priority'}));
show(S.simulate([{id:'A',arrival:0,burst:2,priority:1,queue:2},{id:'B',arrival:5,burst:1,priority:1,queue:0}],{algorithm:'mlq',policies:['FCFS','RR','FCFS'],quantum:1}));
console.log(V.validateProcesses([{pid:'P1',arrival:'-1',burst:'0',priority:'x',queue:'0'},{pid:'p1',arrival:'1.5',burst:'2',priority:'1',queue:'0'}]).errors.map(e=>e.message));
