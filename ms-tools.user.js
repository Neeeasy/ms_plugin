// ==UserScript==
// @name         MS Tools
// @namespace    ms-tools
// @version      1.0
// @description  Инструменты для работы с ролями
// @author       Kirill
// @match        http://*/*
// @match        https://*/*
// @icon         https://app.mstroy.tech/favicon.ico
// @updateURL    https://raw.githubusercontent.com/79829893218n-netizen/ms_plugin/main/ms-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/79829893218n-netizen/ms_plugin/main/ms-tools.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

const TARGET_ROLE = 'Возможность вносить изменения в сменные задания за прошлый период';

let actionBtn=null;
let statusText=null;
let panel=null;
let lastUrl=location.href;
let intervalId=null;
let filterEnabled=false;

function isCorrectPage(){
return location.pathname.startsWith('/settings/userscontrol');
}

function getRolesModal(){
const candidates=[...document.querySelectorAll('div,section')];

for(const el of candidates){

const text=el.innerText||'';

if(
text.includes('Редактирование пользователя') &&
text.includes('Назначение ролей') &&
text.includes('ПОЛЬЗОВАТЕЛЬ') &&
text.includes('РОЛИ') &&
text.includes('ИНТЕГРАЦИИ')
){
return el;
}

}

return null;
}

function isRolesModalOpen(){

if(!isCorrectPage()) return false;

const modal=getRolesModal();
if(!modal) return false;

return modal.querySelectorAll('.q-checkbox__label').length>0;
}

function getUserName(modal){

if(!modal) return '';

const text=modal.innerText||'';

const match=text.match(/Редактирование пользователя\s+([^\n]+)/i);

if(match && match[1]){
return match[1].trim();
}

return '';
}

function getRoleItems(modal){

const labels=[...modal.querySelectorAll('.q-checkbox__label')];

return labels.map(label=>{

const checkbox=label.closest('.q-checkbox');
const inner=checkbox?.querySelector('.q-checkbox__inner');

return{
label,
checkbox,
inner,
row:checkbox?.parentElement,
text:label.textContent.trim(),
checked:inner?.classList.contains('q-checkbox__inner--truthy')
};

}).filter(Boolean);

}

function getRoleItem(modal,roleName){

const items=getRoleItems(modal);

return items.find(i=>i.text===roleName)||null;

}

async function copyToClipboard(text){

try{

await navigator.clipboard.writeText(text);
return true;

}catch{

const textarea=document.createElement('textarea');

textarea.value=text;
textarea.style.position='fixed';
textarea.style.opacity='0';

document.body.appendChild(textarea);

textarea.focus();
textarea.select();

const ok=document.execCommand('copy');

textarea.remove();

return ok;

}

}

function buildTelegramText(action,fio){

return `${action} ${TARGET_ROLE}\n\n\`${fio}\``;

}

function showCopied(){

statusText.textContent='✔ Скопировано для Telegram';
statusText.className='mstroy-status mstroy-status-copy';

setTimeout(updateControls,1600);

}

async function toggleTargetRole(){

const modal=getRolesModal();
if(!modal) return;

const roleItem=getRoleItem(modal,TARGET_ROLE);

if(!roleItem){
setStatus('Роль не найдена');
return;
}

const fio=getUserName(modal)||'ФИО не найдено';

const isGiveAction=actionBtn.textContent.includes('Выдать');

roleItem.checkbox.click();

if(isGiveAction){

const message=buildTelegramText('Забрать',fio);

const copied=await copyToClipboard(message);

if(copied){
showCopied();
}else{
setStatus('Ошибка копирования');
}

}else{

setStatus('Роль забрана');

}

setTimeout(updateControls,200);
setTimeout(updateControls,500);

}

function setStatus(text){

if(statusText){
statusText.textContent=text;
}

}

function updateControls(){

const modal=getRolesModal();
if(!modal||!actionBtn) return;

const roleItem=getRoleItem(modal,TARGET_ROLE);

if(!roleItem){

actionBtn.textContent='Роль не найдена';
actionBtn.disabled=true;

return;
}

actionBtn.disabled=false;

if(roleItem.checked){

actionBtn.textContent='Забрать прошлый период';

statusText.textContent='Сейчас роль включена';
statusText.className='mstroy-status mstroy-status-on';

}else{

actionBtn.textContent='Выдать прошлый период';

statusText.textContent='Сейчас роль выключена';
statusText.className='mstroy-status mstroy-status-off';

}

updateFilter();

}

function updateFilter(){

const modal=getRolesModal();
if(!modal) return;

const items=getRoleItems(modal);

items.forEach(item=>{

if(filterEnabled && !item.checked){
item.row.style.display='none';
}else{
item.row.style.display='';
}

});

}

function createStyles(){

if(document.getElementById('mstroy-style')) return;

const style=document.createElement('style');

style.id='mstroy-style';

style.textContent=`

.mstroy-panel{
display:flex;
align-items:center;
justify-content:space-between;
gap:12px;
margin:8px 0;
padding:8px 10px;
border:1px solid rgba(0,0,0,0.12);
border-radius:6px;
background:#fafafa;
}

.mstroy-btn{
border:1px solid #1976d2;
background:#fff;
color:#1976d2;
border-radius:6px;
padding:6px 10px;
font-size:13px;
cursor:pointer;
}

.mstroy-btn:hover{
background:rgba(25,118,210,0.08);
}

.mstroy-status{
font-size:12px;
font-weight:600;
}

.mstroy-status-on{
color:#2e7d32;
}

.mstroy-status-off{
color:#c62828;
}

.mstroy-status-copy{
color:#1565c0;
}

`;

document.head.appendChild(style);

}

function createControls(){

createStyles();

const modal=getRolesModal();
if(!modal) return false;

const listContainer=modal.querySelector('.q-checkbox')?.parentElement?.parentElement;

if(!listContainer) return false;

panel=modal.querySelector('#mstroy-panel');

if(!panel){

panel=document.createElement('div');

panel.id='mstroy-panel';
panel.className='mstroy-panel';

const left=document.createElement('div');

const filterBtn=document.createElement('button');
filterBtn.className='mstroy-btn';
filterBtn.textContent='Только выбранные';

filterBtn.onclick=()=>{

filterEnabled=!filterEnabled;

filterBtn.style.background=filterEnabled?'#1976d2':'#fff';
filterBtn.style.color=filterEnabled?'#fff':'#1976d2';

updateFilter();

};

left.appendChild(filterBtn);

actionBtn=document.createElement('button');
actionBtn.className='mstroy-btn';
actionBtn.textContent='...';

statusText=document.createElement('div');
statusText.className='mstroy-status';

actionBtn.addEventListener('click',toggleTargetRole);

panel.appendChild(left);
panel.appendChild(actionBtn);
panel.appendChild(statusText);

listContainer.parentElement.insertBefore(panel,listContainer);

}else{

actionBtn=panel.querySelectorAll('.mstroy-btn')[1];
statusText=panel.querySelector('.mstroy-status');

}

updateControls();

return true;

}

function removeControls(){

document.getElementById('mstroy-panel')?.remove();

panel=null;
actionBtn=null;
statusText=null;

}

function tick(){

if(!isCorrectPage()){
removeControls();
return;
}

if(!isRolesModalOpen()){
removeControls();
return;
}

createControls();
updateControls();

}

function onUrlChange(){

if(location.href===lastUrl) return;

lastUrl=location.href;

removeControls();

setTimeout(tick,100);
setTimeout(tick,500);
setTimeout(tick,1200);

}

function patchHistoryMethods(){

const push=history.pushState;
const replace=history.replaceState;

history.pushState=function(...args){
const result=push.apply(this,args);
window.dispatchEvent(new Event('tm-location-change'));
return result;
};

history.replaceState=function(...args){
const result=replace.apply(this,args);
window.dispatchEvent(new Event('tm-location-change'));
return result;
};

}

function start(){

if(intervalId) return;

document.addEventListener('click',()=>{
setTimeout(tick,50);
setTimeout(tick,200);
},true);

document.addEventListener('change',()=>{
setTimeout(updateControls,100);
},true);

window.addEventListener('popstate',onUrlChange);
window.addEventListener('tm-location-change',onUrlChange);

intervalId=setInterval(()=>{
onUrlChange();
tick();
},700);

setTimeout(tick,300);
setTimeout(tick,1000);

console.log('MSTroy Tools loaded');

}

patchHistoryMethods();
start();

})();
