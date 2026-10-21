const originals = [
  {name:'Firefox',version:'136.0',category:'Browsers',type:'exe',directory:'apps/browsers',description:'A fast, independent web browser.',testing:true,production:true,min:'10.0.19045',arch:'x64, arm64',exe:'firefox.exe',path:'%ProgramFiles%\Mozilla Firefox\firefox.exe'},
  {name:'Chrome',version:'134.0.6998.89',category:'Browsers',type:'msi',directory:'apps/browsers',description:'A browser built by Google.',testing:true,production:false,min:'10.0.19045',arch:'x64, arm64',exe:'chrome.exe',path:'%ProgramFiles%\Google\Chrome\Application\chrome.exe'},
  {name:'Blender',version:'4.3.2',category:'Creative',type:'msi',directory:'apps/creative',description:'Tools for 3D creation and animation.',testing:true,production:false,min:'10.0.19045',arch:'x64',exe:'blender.exe',path:'%ProgramFiles%\Blender Foundation\Blender 4.3\blender.exe'},
  {name:'Inkscape',version:'1.4',category:'Creative',type:'msi',directory:'apps/creative',description:'A vector graphics editor.',testing:true,production:true,min:'10.0.19045',arch:'x64',exe:'inkscape.exe',path:'%ProgramFiles%\Inkscape\bin\inkscape.exe'},
  {name:'VLC',version:'3.0.21',category:'Media',type:'exe',directory:'apps/media',description:'An open source media player.',testing:true,production:true,min:'10.0.17763',arch:'x64, arm64',exe:'vlc.exe',path:'%ProgramFiles%\VideoLAN\VLC\vlc.exe'},
  {name:'Notepad++',version:'8.7.8',category:'Utilities',type:'exe',directory:'apps/utilities',description:'A source code and text editor.',testing:true,production:false,min:'10.0.17763',arch:'x64, arm64',exe:'notepad++.exe',path:'%ProgramFiles%\Notepad++\notepad++.exe'},
  {name:'Git',version:'2.48.1',category:'Utilities',type:'nupkg',directory:'tools',description:'Distributed version control tools.',testing:true,production:true,min:'10.0.17763',arch:'x64, arm64',exe:'git.exe',path:'%ProgramFiles%\Git\cmd\git.exe'},
  {name:'PowerToys',version:'0.89.0',category:'Utilities',type:'msix',directory:'apps/utilities',description:'Utilities for power users.',testing:true,production:false,min:'10.0.22621',arch:'x64, arm64',exe:'PowerToys.exe',path:'%LocalAppData%\PowerToys\PowerToys.exe'}
];
let records=structuredClone(originals), selected=0, grouping='category';
const el=id=>document.getElementById(id);
const path=r=>'pkgsinfo/'+r.directory+'/'+r.name.replace(/\W/g,'')+'-'+r.version+'.yaml';
const changed=(a,b)=>['displayName','description','testing','production'].some(k=>(a[k]??a.name)!==(b[k]??b.name));
function dirty(){return records.filter((r,i)=>changed(r,originals[i])).length}
function updateStatus(){const n=dirty();el('draft-count').textContent=n?n+' draft '+(n===1?'change':'changes'):'No draft changes';el('change-count').textContent=n;el('status').textContent=n?'Draft updated in this browser. No files have been written.':'Sample workspace ready. No repository connected.'}
function choose(i){selected=i;renderList();renderEditor()}
function icon(name) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');
  use.setAttribute('href','#icon-'+name); svg.append(use); return svg;
}
function renderList() {
  const query=el('search').value.toLowerCase();
  el('package-list').replaceChildren(); el('package-rows').replaceChildren();
  const groups=new Map();
  records.forEach((r,i)=>{
    const row=document.createElement('tr'); row.className=i===selected?'selected':'';
    const cell=document.createElement('td'), button=document.createElement('button');
    button.textContent=r.name; button.addEventListener('click',()=>choose(i)); cell.append(button); row.append(cell);
    [r.version,r.category].forEach(v=>{const td=document.createElement('td');td.textContent=v;row.append(td)});
    el('package-rows').append(row);
    if(![r.name,r.version,r.category,r.directory].join(' ').toLowerCase().includes(query))return;
    const group=r[grouping]; if(!groups.has(group))groups.set(group,[]); groups.get(group).push({r,i});
  });
  groups.forEach((items,name)=>{
    const heading=document.createElement('div'); heading.className='group';
    heading.append(icon(grouping==='directory'?'folder':'grid'),document.createTextNode(name));
    const count=document.createElement('small');count.textContent=items.length;heading.append(count);el('package-list').append(heading);
    items.forEach(({r,i})=>{
      const button=document.createElement('button');button.className='package';button.setAttribute('aria-pressed',String(i===selected));
      button.append(icon('package'),document.createTextNode(r.name));
      const version=document.createElement('span');version.textContent=r.version;button.append(version);
      button.addEventListener('click',()=>choose(i));el('package-list').append(button);
    });
  });
  if(!groups.size){const p=document.createElement('p');p.className='empty-search';p.textContent='No matching packages';el('package-list').append(p)}
}
const payload=r=>'pkgs/'+r.directory+'/'+r.name.replace(/\W/g,'')+'-'+r.version+'.'+r.type;
function renderEditor(){const r=records[selected];el('package-name').textContent=r.name;el('record-name').value=r.name;el('installer-type').value=r.type;el('installer-location').value=payload(r);el('architectures').value=r.arch;el('package-path').textContent=path(r);el('display-name').value=r.displayName??r.name;el('description').value=r.description;el('version').value=r.version;el('category').value=r.category;el('minimum-os').value=r.min;el('testing').checked=r.testing;el('production').checked=r.production;renderSamplePanels(r)}
function capture(){const r=records[selected];r.displayName=el('display-name').value;r.description=el('description').value;r.testing=el('testing').checked;r.production=el('production').checked;updateStatus()}
['display-name','description','testing','production'].forEach(id=>el(id).addEventListener('input',capture));
el('search').addEventListener('input',renderList);
el('layout').addEventListener('change',()=>document.body.classList.toggle('table-mode',el('layout').value==='table'));
function navigate(area){el('workspace-title').textContent=area==='packages'?'Packages':'Manifests';el('workspace-subtitle').textContent=area==='packages'?'8 pkginfo files':'1 sample manifest';el('packages-view').hidden=area!=='packages';el('manifests-view').hidden=area!=='manifests';['packages','manifests'].forEach(n=>{if(n===area)el(n+'-nav').setAttribute('aria-current','page');else el(n+'-nav').removeAttribute('aria-current')})}
el('packages-nav').addEventListener('click',()=>navigate('packages'));el('manifests-nav').addEventListener('click',()=>navigate('manifests'));
function review(){const lines=[];records.forEach((r,i)=>{if(!changed(r,originals[i]))return;lines.push(path(r));for(const k of ['displayName','description','testing','production']){const before=originals[i][k]??originals[i].name,after=r[k]??r.name;if(before!==after){lines.push('- '+k+': '+JSON.stringify(before));lines.push('+ '+k+': '+JSON.stringify(after))}}lines.push('')});el('diff').textContent=lines.length?lines.join('\n'):'No changes yet. Edit a package to explore the review flow.';el('review-summary').textContent=dirty()?dirty()+' modified sample '+(dirty()===1?'record':'records'):'Sample workspace · no files changed';el('discard').disabled=!dirty();el('review-dialog').showModal()}
document.querySelectorAll('.review').forEach(b=>b.addEventListener('click',review));['close-review','continue'].forEach(id=>el(id).addEventListener('click',()=>el('review-dialog').close()));el('discard').addEventListener('click',()=>{records=structuredClone(originals);renderList();renderEditor();updateStatus();el('review-dialog').close()});
document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{
  grouping=button.dataset.group;
  document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  renderList();
}));
const catalogSection=document.querySelector('#testing').closest('.editor-section');
const descriptionSection=document.querySelector('#description').closest('.editor-section');
descriptionSection.before(catalogSection);
document.querySelectorAll('.editor-section').forEach(section=>{
  const heading=section.querySelector('h3');
  const card=document.createElement('div');card.className='card-fields';
  [...section.childNodes].filter(node=>node!==heading).forEach(node=>card.append(node));
  section.append(card);
});
renderList();renderEditor();updateStatus();

function renderSamplePanels(record) {
  const application=record.type!=='Package';
  const section=(panel,title,rows)=>{
    const section=document.createElement('section');section.className='editor-section';
    const heading=document.createElement('h3');heading.textContent=title;
    const card=document.createElement('div');card.className='card-fields';
    rows.forEach(([label,value])=>{
      const dl=document.createElement('dl');dl.className='sample-value';
      const dt=document.createElement('dt');dt.textContent=label;
      const dd=document.createElement('dd');dd.textContent=value;dl.append(dt,dd);card.append(dl);
    });
    section.append(heading,card);panel.append(section);
  };
  for(const name of ['detection','install','uninstall','advanced']){
    const panel=el('panel-'+name);panel.replaceChildren();
    const note=document.createElement('p');note.className='sample-note';
    note.textContent='Read-only sample metadata for '+record.name+'. No commands or scripts are executed.';panel.append(note);
  }
  const msi=record.type==='msi';
  section(el('panel-detection'),'Installs',msi?[
    ['Type','msi'],['Product code','{00000000-0000-0000-0000-'+String(record.name.length).padStart(12,'0')+'}'],['Version',record.version]
  ]:[['Type','file'],['Path',record.path],['Version',record.version]]);
  section(el('panel-detection'),'Check scripts',[['Installcheck script','Not configured'],['Uninstallcheck script','Not configured']]);
  section(el('panel-install'),'Installer',[
    ['Type',record.type],['Location',payload(record)],['Arguments',msi?'/qn /norestart':record.type==='exe'?'/S':'None']
  ]);
  section(el('panel-install'),'Installation behavior',[['Unattended install','true'],['Blocking applications',record.exe],['Preinstall script','Not configured'],['Postinstall script','Not configured']]);
  section(el('panel-uninstall'),'Uninstaller',[
    ['Uninstallable','true'],['Type',msi?'msi':record.type],['Target',msi?'Product code from installs':record.path]
  ]);
  section(el('panel-uninstall'),'Removal scripts',[['Preuninstall script','Not configured'],['Postuninstall script','Not configured']]);
  section(el('panel-advanced'),'Compatibility',[['Minimum OS version',record.min],['Supported architectures',record.arch],['Restart action','Not specified'],['On demand','Not specified']]);
  section(el('panel-advanced'),'File',[['Relative path',path(record)],['Format','YAML'],['Source','Invented sample record']]);
}
const editorTabs=[...document.querySelectorAll('[role="tab"]')];
function activateTab(tab,focus=false){
  editorTabs.forEach(button=>{
    const selected=button===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
    el(button.getAttribute('aria-controls')).hidden=!selected;
  });
  if(focus)tab.focus();
}
editorTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>activateTab(tab));
  tab.addEventListener('keydown',event=>{
    let next;
    if(event.key==='ArrowRight')next=(index+1)%editorTabs.length;
    if(event.key==='ArrowLeft')next=(index-1+editorTabs.length)%editorTabs.length;
    if(event.key==='Home')next=0;
    if(event.key==='End')next=editorTabs.length-1;
    if(next!==undefined){event.preventDefault();activateTab(editorTabs[next],true)}
  });
});
