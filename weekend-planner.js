/* NASZA KUCHNIA | A&B — Planer weekendowy, wersja lokalna. */
(function(){
"use strict";
var recipes=Array.isArray(window.NKWeekendRecipes)?window.NKWeekendRecipes:[];
var recipeMap={};
recipes.forEach(function(r){recipeMap[r.id]=r;});
var KEY="nasza-kuchnia-weekend-plan-v1";
var CHECK_KEY="nasza-kuchnia-weekend-zakupy-v1";
var MEALS=[{id:"sniadanie",label:"Śniadanie",icon:"☀"},{id:"obiad",label:"Obiad",icon:"♨"},{id:"kolacja",label:"Kolacja",icon:"☾"}];
var DAY_NAMES=["Piątek","Sobota","Niedziela"];
var MONTHS=["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
var WEEKDAYS=["Pn","Wt","Śr","Cz","Pt","Sb","Nd"];
var modalRecipe=null,modalDate=null,modalMonth=null,calendarState=null,detailFriday=null,detailShoppingVisible=false;
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function parse(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||""))return null;var d=new Date(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10),12);return isNaN(d.getTime())||iso(d)!==s?null:d;}
function plus(d,n){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate()+n,12);return x;}
function today(){var x=new Date();return new Date(x.getFullYear(),x.getMonth(),x.getDate(),12);}
function friday(d){var day=d.getDay();if(day===5)return plus(d,0);if(day===6)return plus(d,-1);if(day===0)return plus(d,-2);return plus(d,5-day);}
function format(d,opt){return new Intl.DateTimeFormat("pl-PL",opt||{day:"numeric",month:"long",year:"numeric"}).format(d);}
function compactWeekend(f){return format(f,{day:"numeric",month:"short"})+" – "+format(plus(f,2),{day:"numeric",month:"short",year:"numeric"});}
function slotKey(date,meal){return iso(date)+"|"+meal;}
function storageRead(key){try{var x=JSON.parse(localStorage.getItem(key)||"{}");return x&&typeof x==="object"&&!Array.isArray(x)?x:{};}catch(e){return {};}}
function storageSave(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){alert("Nie można zapisać planu w tej przeglądarce. Sprawdź ustawienia pamięci strony.");return false;}}
function plan(){return storageRead(KEY);}
function planCount(f){var p=plan(),n=0;for(var d=0;d<3;d++)for(var m=0;m<3;m++)if(recipeMap[p[slotKey(plus(f,d),MEALS[m].id)]])n++;return n;}
function mealExists(date){var p=plan();return MEALS.some(function(m){return !!recipeMap[p[slotKey(date,m.id)]];});}
function clearChecked(f){var c=storageRead(CHECK_KEY);delete c[iso(f)];storageSave(CHECK_KEY,c);}
function saveRecipe(recipeId,date,meal){if(!recipeMap[recipeId]||![5,6,0].includes(date.getDay())||!MEALS.some(function(m){return m.id===meal;}))return false;
var p=plan(),k=slotKey(date,meal);
if(p[k]&&p[k]!==recipeId&&!confirm("Na tę porę jest już zaplanowane inne danie. Zastąpić je nowym?"))return false;
p[k]=recipeId;
if(!storageSave(KEY,p))return false;
clearChecked(friday(date));
return true;}
function removeRecipe(date,meal){var p=plan();delete p[slotKey(date,meal)];if(storageSave(KEY,p)){clearChecked(friday(date));return true;}return false;}
function notify(text,weekend){var old=document.getElementById("nk-weekend-toast");if(old)old.remove();var toast=document.createElement("div");toast.className="nk-toast";toast.id="nk-weekend-toast";toast.innerHTML=esc(text)+(weekend?' <a style="color:#fff;text-decoration:underline;display:block;margin-top:7px" href="weekend-menu.html?weekend='+encodeURIComponent(iso(weekend))+'">Zobacz menu weekendowe →</a>':"");document.body.appendChild(toast);setTimeout(function(){if(toast.parentNode)toast.remove();},7500);}
function calendarHtml(month,selected,onlyWeekend){
var year=month.getFullYear(),m=month.getMonth(),first=new Date(year,m,1,12),start=plus(first,-((first.getDay()+6)%7)),out='<div class="nk-month-grid">';
WEEKDAYS.forEach(function(n){out+='<div class="nk-weekday">'+n+'</div>';});
for(var i=0;i<42;i++){var d=plus(start,i),isWeekend=[0,5,6].includes(d.getDay()),same=d.getMonth()===m,sel=selected&&iso(d)===iso(selected),can=isWeekend&&(same||!onlyWeekend);
out+='<button type="button" class="nk-day'+(isWeekend?" is-weekend":"")+(sel?" is-selected":"")+(same?"":" is-outside")+(mealExists(d)?" has-meal":"")+'" data-nk-date="'+iso(d)+'" aria-label="'+esc(format(d,{weekday:"long",day:"numeric",month:"long",year:"numeric"}))+'" aria-pressed="'+(sel?"true":"false")+'" '+(can?"":"disabled")+">"+d.getDate()+"</button>";
}return out+"</div>";
}
function modalEnsure(){var dialog=document.getElementById("nk-add-dialog");if(dialog)return dialog;dialog=document.createElement("dialog");dialog.id="nk-add-dialog";dialog.setAttribute("aria-labelledby","nk-dialog-title");
dialog.innerHTML='<div class="nk-dialog-head"><div><div class="nk-eyebrow">NASZA KUCHNIA · PLANOWANIE</div><h2 id="nk-dialog-title">Dodaj do menu weekendowego</h2><p class="nk-dim" style="margin:0;font-size:13px">Piątek, sobota lub niedziela — wybierz dzień i porę posiłku.</p></div><button type="button" class="nk-dialog-close" id="nk-dialog-close" aria-label="Zamknij">×</button></div>'+
'<div class="nk-dialog-content"><div class="nk-recipe-selected" id="nk-selected-recipe"></div>'+
'<div class="nk-field-title">1. Wybierz posiłek</div><div class="nk-meals" id="nk-meals">'+MEALS.map(function(x,i){return '<label><input type="radio" name="nk-meal" value="'+x.id+'" '+(i===1?"checked":"")+'/><span>'+x.icon+' '+x.label+'</span></label>';}).join("")+'</div>'+
'<div class="nk-field-title">2. Wybierz dzień weekendu</div><div class="nk-calendar-toolbar"><button class="nk-icon-button" type="button" data-nk-shift="-1" aria-label="Poprzedni miesiąc">‹</button><strong class="nk-calendar-title" id="nk-dialog-month"></strong><button class="nk-icon-button" type="button" data-nk-shift="1" aria-label="Następny miesiąc">›</button></div><div id="nk-dialog-days"></div>'+
'<p class="nk-dialog-info" id="nk-selection-summary" aria-live="polite"></p><button class="nk-button nk-dialog-submit" id="nk-confirm-add" type="button">+ Dodaj do menu</button>'+
'<p class="nk-footnote">Plan jest zapisany w tej przeglądarce. Na innym urządzeniu nie pojawi się automatycznie.</p></div>';
document.body.appendChild(dialog);
dialog.querySelector("#nk-dialog-close").addEventListener("click",function(){dialog.close();});
dialog.querySelectorAll("[data-nk-shift]").forEach(function(b){b.addEventListener("click",function(){modalMonth=new Date(modalMonth.getFullYear(),modalMonth.getMonth()+Number(b.dataset.nkShift),1,12);renderModalCalendar();});});
dialog.querySelector("#nk-dialog-days").addEventListener("click",function(e){var b=e.target.closest("[data-nk-date]");if(!b||b.disabled)return;modalDate=parse(b.dataset.nkDate);renderModalCalendar();});
dialog.querySelectorAll('input[name="nk-meal"]').forEach(function(x){x.addEventListener("change",renderModalCalendar);});
dialog.querySelector("#nk-confirm-add").addEventListener("click",function(){
var meal=dialog.querySelector('input[name="nk-meal"]:checked');
if(!modalDate||!meal||!modalRecipe)return;
if(saveRecipe(modalRecipe.id,modalDate,meal.value)){var f=friday(modalDate);dialog.close();notify("Dodano: "+modalRecipe.title+" — "+format(modalDate,{weekday:"long",day:"numeric",month:"long"})+", "+MEALS.find(function(m){return m.id===meal.value;}).label.toLowerCase()+".",f);if(calendarState)renderCalendarPage();if(detailFriday)renderDetail();}
});
return dialog;}
function renderModalCalendar(){var dlg=modalEnsure();dlg.querySelector("#nk-dialog-month").textContent=MONTHS[modalMonth.getMonth()]+" "+modalMonth.getFullYear();dlg.querySelector("#nk-dialog-days").innerHTML=calendarHtml(modalMonth,modalDate,true);
var m=dlg.querySelector('input[name="nk-meal"]:checked'),meal=MEALS.find(function(x){return m&&x.id===m.value;});
dlg.querySelector("#nk-selection-summary").textContent=modalDate?DAY_NAMES[[5,6,0].indexOf(modalDate.getDay())]+", "+format(modalDate)+" · "+(meal?meal.label:""):"Wybierz piątek, sobotę lub niedzielę.";
}
function openAdd(recipeId,selectedDate,selectedMeal){var recipe=recipeMap[recipeId];if(!recipe)return;
var dlg=modalEnsure();modalRecipe=recipe;modalDate=selectedDate&&[5,6,0].includes(selectedDate.getDay())?selectedDate:friday(today());modalMonth=new Date(modalDate.getFullYear(),modalDate.getMonth(),1,12);
var img=recipe.image.replace(/&amp;/g,"&");dlg.querySelector("#nk-selected-recipe").innerHTML='<img src="'+esc(img)+'" alt=""><div><small class="nk-eyebrow">WYBRANY PRZEPIS</small><br><strong>'+esc(recipe.title)+'</strong></div>';
var radio=dlg.querySelector('input[name="nk-meal"][value="'+(selectedMeal||"obiad")+'"]');if(radio)radio.checked=true;renderModalCalendar();dlg.showModal();}
function installButtons(){
document.querySelectorAll('#kolekcja a[href$=".html"]').forEach(function(a){
if(a.nextElementSibling&&a.nextElementSibling.classList.contains("weekend-add-button"))return;
var parent=a.closest(".family-copy,.featured-info,.side-recipe");if(!parent)return;
var url=a.getAttribute("href")||"";var id=url.split("/").pop().replace(/\.html$/,"");if(!recipeMap[id])return;
var b=document.createElement("button");b.className="weekend-add-button";b.type="button";b.textContent="＋ Dodaj do listy";b.addEventListener("click",function(){openAdd(id);});
a.insertAdjacentElement("afterend",b);
});
var recipeSection=document.querySelector(".recipe-view.family-recipe");if(recipeSection){var id=window.location.pathname.split("/").pop().replace(/\.html$/,"");if(recipeMap[id]){var nav=recipeSection.querySelector(".family-nav");if(nav&&!nav.querySelector(".weekend-add-button")){
var a=Array.from(nav.querySelectorAll("a")).find(function(n){return /krok po kroku/i.test(n.textContent);});
var button=document.createElement("button");button.className="weekend-add-button";button.type="button";button.textContent="＋ Dodaj do listy";button.addEventListener("click",function(){openAdd(id);});
if(a)a.insertAdjacentElement("afterend",button);else nav.appendChild(button);
}}}
if(new URLSearchParams(window.location.search).has("dodaj")&&typeof window.openForm==="function"){window.openForm();}
}
function weekCards(month){var start=new Date(month.getFullYear(),month.getMonth(),1,12),end=new Date(month.getFullYear(),month.getMonth()+1,0,12);
var cursor=plus(start,-2);while(cursor.getDay()!==5)cursor=plus(cursor,1);var arr=[];
while(cursor<=end){if(plus(cursor,2)>=start)arr.push(new Date(cursor));cursor=plus(cursor,7);}return arr;}
function renderCalendarPage(){if(!calendarState)return;var month=calendarState.month;
var monthControl=document.getElementById("nk-month-select"),yearControl=document.getElementById("nk-year-select");
if(monthControl)monthControl.value=String(month.getMonth());if(yearControl)yearControl.value=String(month.getFullYear());
var cal=document.getElementById("nk-calendar-month"),heading=document.getElementById("nk-calendar-month-heading");
if(heading)heading.textContent=MONTHS[month.getMonth()]+" "+month.getFullYear();
if(cal)cal.innerHTML=calendarHtml(month,null,false);
var list=document.getElementById("nk-weekend-list");if(list)list.innerHTML=weekCards(month).map(function(f){var count=planCount(f),detail="weekend-menu.html?weekend="+iso(f);
return '<a class="nk-weekend-card" href="'+detail+'"><span><strong>'+esc(compactWeekend(f))+'</strong><small>'+count+'/9 zaplanowanych posiłków</small></span><span class="nk-status'+(count?"":" empty")+'">'+(count?"✓ Menu zaplanowane":"＋ Zaplanuj menu")+'</span></a>';
}).join("");
var selected=document.getElementById("nk-selected-weekend");if(selected){var n=planCount(calendarState.selected);selected.innerHTML='<div class="nk-eyebrow">WYBRANY WEEKEND</div><h2 style="margin:10px 0">'+esc(compactWeekend(calendarState.selected))+'</h2><p class="nk-dim" style="line-height:1.7">'+n+' z 9 posiłków zaplanowanych. Kliknij, aby zobaczyć piątek, sobotę i niedzielę.</p><a class="nk-button" href="weekend-menu.html?weekend='+iso(calendarState.selected)+'">'+(n?"Otwórz menu weekendowe →":"Zaplanuj menu →")+'</a>';}
}
function initCalendarPage(){if(document.body.dataset.nkPage!=="calendar")return;
calendarState={month:new Date(today().getFullYear(),today().getMonth(),1,12),selected:friday(today())};
var monthSel=document.getElementById("nk-month-select"),yearSel=document.getElementById("nk-year-select");
MONTHS.forEach(function(s,i){var o=document.createElement("option");o.value=i;o.textContent=s;monthSel.appendChild(o);});
for(var y=today().getFullYear()-7;y<=today().getFullYear()+20;y++){var o=document.createElement("option");o.value=y;o.textContent=y;yearSel.appendChild(o);}
function changeMonth(delta){calendarState.month=new Date(calendarState.month.getFullYear(),calendarState.month.getMonth()+delta,1,12);renderCalendarPage();}
document.getElementById("nk-month-previous").addEventListener("click",function(){changeMonth(-1);});document.getElementById("nk-month-next").addEventListener("click",function(){changeMonth(1);});
[monthSel,yearSel].forEach(function(s){s.addEventListener("change",function(){calendarState.month=new Date(Number(yearSel.value),Number(monthSel.value),1,12);renderCalendarPage();});});
document.getElementById("nk-prev-weekend").addEventListener("click",function(){calendarState.selected=plus(calendarState.selected,-7);calendarState.month=new Date(calendarState.selected.getFullYear(),calendarState.selected.getMonth(),1,12);renderCalendarPage();});
document.getElementById("nk-next-weekend").addEventListener("click",function(){calendarState.selected=plus(calendarState.selected,7);calendarState.month=new Date(calendarState.selected.getFullYear(),calendarState.selected.getMonth(),1,12);renderCalendarPage();});
document.getElementById("nk-calendar-month").addEventListener("click",function(e){var b=e.target.closest("[data-nk-date]");if(!b||b.disabled)return;var d=parse(b.dataset.nkDate);if(!d||![5,6,0].includes(d.getDay()))return;calendarState.selected=friday(d);renderCalendarPage();});
renderCalendarPage();}
function slotCard(date,meal){var r=recipeMap[plan()[slotKey(date,meal.id)]];
var res='<div class="nk-slot"><div class="nk-slot-name">'+meal.icon+' '+meal.label+'</div>';
if(r){res+='<img loading="lazy" src="'+esc(r.image.replace(/&amp;/g,"&"))+'" alt=""><strong>'+esc(r.title)+'</strong><div class="nk-slot-actions"><a href="'+esc(r.url)+'">Zobacz przepis</a><button type="button" data-nk-pick="'+iso(date)+'|'+meal.id+'">Zmień</button><button type="button" data-nk-remove="'+iso(date)+'|'+meal.id+'">Usuń</button></div>';}
else{res+='<div class="nk-empty-slot">Brak zaplanowanego posiłku<br><button type="button" data-nk-pick="'+iso(date)+'|'+meal.id+'">＋ Dodaj danie</button></div>';}
return res+"</div>";}
function renderDetail(){if(!detailFriday)return;
var f=detailFriday, title=document.getElementById("nk-detail-range");
if(title)title.textContent=compactWeekend(f);
document.title="Menu weekendowe: "+compactWeekend(f)+" — Agnieszka ♥ Michał";
var holder=document.getElementById("nk-detail-days");holder.innerHTML=DAY_NAMES.map(function(day,i){var date=plus(f,i);return '<article class="nk-card nk-day-panel"><h2>'+day+'</h2><p>'+esc(format(date))+'</p>'+MEALS.map(function(meal){return slotCard(date,meal);}).join("")+"</article>";}).join("");
var progress=document.getElementById("nk-detail-progress");if(progress)progress.textContent=planCount(f)+" / 9 posiłków zaplanowanych";
var shop=document.getElementById("nk-shopping-section");shop.hidden=!detailShoppingVisible;
if(detailShoppingVisible)renderShopping();
}
function getIngredients(f){var entries=[],p=plan();for(var d=0;d<3;d++)for(var m=0;m<MEALS.length;m++){var rid=p[slotKey(plus(f,d),MEALS[m].id)],recipe=recipeMap[rid];if(!recipe)continue;
recipe.ingredients.forEach(function(item){entries.push({name:item,source:recipe.title});});}
var grouped=new Map();entries.forEach(function(e){var key=e.name.trim().toLocaleLowerCase("pl");if(!grouped.has(key))grouped.set(key,{key:key,name:e.name,count:0,sources:[]});var item=grouped.get(key);item.count++;if(!item.sources.includes(e.source))item.sources.push(e.source);});
return Array.from(grouped.values()).sort(function(a,b){return a.name.localeCompare(b.name,"pl");});}
function renderShopping(){var items=getIngredients(detailFriday),list=document.getElementById("nk-shopping-items"),count=document.getElementById("nk-shopping-count"),all=storageRead(CHECK_KEY),marked=all[iso(detailFriday)]||{};
count.textContent=items.length+" pozycji do przygotowania";if(!items.length){list.innerHTML='<li>Najpierw zaplanuj przynajmniej jeden posiłek, żeby utworzyć listę zakupów.</li>';return;}
list.innerHTML=items.map(function(item){return '<li><label style="display:flex;gap:10px;cursor:pointer"><input type="checkbox" data-nk-check="'+esc(item.key)+'" '+(marked[item.key]?"checked":"")+'><span>'+(item.count>1?'<strong>'+item.count+' × </strong>':"")+esc(item.name)+'<small>'+esc(item.sources.join(" · "))+'</small></span></label></li>';}).join("");
}
function openPicker(date,meal){var dlg=document.getElementById("nk-pick-dialog");dlg.dataset.nkSlot=slotKey(date,meal);
var el=document.getElementById("nk-pick-slot");el.textContent=format(date,{weekday:"long",day:"numeric",month:"long",year:"numeric"})+" · "+MEALS.find(function(x){return x.id===meal;}).label;
var inp=document.getElementById("nk-pick-search");inp.value="";renderPickerResults();dlg.showModal();inp.focus();}
function renderPickerResults(){var q=(document.getElementById("nk-pick-search").value||"").toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l");var filtered=recipes.filter(function(r){return r.title.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ł/g,"l").includes(q);});
var holder=document.getElementById("nk-pick-results");holder.innerHTML=filtered.length?filtered.map(function(r){return '<button type="button" class="nk-recipe-option" data-nk-recipe="'+esc(r.id)+'"><img src="'+esc(r.image.replace(/&amp;/g,"&"))+'" alt=""><span><strong>'+esc(r.title)+'</strong><br><small class="nk-dim">'+esc(r.category)+'</small></span></button>';}).join(""):'<p class="nk-dim">Nie znaleziono takiego przepisu.</p>';}
function initDetailPage(){if(document.body.dataset.nkPage!=="detail")return;
var param=new URLSearchParams(location.search).get("weekend"),maybe=parse(param);detailFriday=maybe?friday(maybe):friday(today());
document.getElementById("nk-detail-previous").addEventListener("click",function(){location.href="weekend-menu.html?weekend="+iso(plus(detailFriday,-7));});
document.getElementById("nk-detail-next").addEventListener("click",function(){location.href="weekend-menu.html?weekend="+iso(plus(detailFriday,7));});
document.getElementById("nk-detail-days").addEventListener("click",function(e){var choice=e.target.closest("[data-nk-pick]"),del=e.target.closest("[data-nk-remove]");if(choice){var parts=choice.dataset.nkPick.split("|");openPicker(parse(parts[0]),parts[1]);}
if(del){var parts2=del.dataset.nkRemove.split("|");if(confirm("Usunąć danie z tego weekendowego menu?")&&removeRecipe(parse(parts2[0]),parts2[1]))renderDetail();}});
document.getElementById("nk-shopping-toggle").addEventListener("click",function(){detailShoppingVisible=!detailShoppingVisible;this.textContent=detailShoppingVisible?"Ukryj listę zakupów":"🛒 Pokaż listę zakupów weekendową";renderDetail();if(detailShoppingVisible)document.getElementById("nk-shopping-section").scrollIntoView({behavior:"smooth",block:"start"});});
document.getElementById("nk-shopping-items").addEventListener("change",function(e){var b=e.target.closest("[data-nk-check]");if(!b)return;var all=storageRead(CHECK_KEY);var f=iso(detailFriday);all[f]=all[f]||{};all[f][b.dataset.nkCheck]=b.checked;storageSave(CHECK_KEY,all);});
document.getElementById("nk-copy-shopping").addEventListener("click",function(){var items=getIngredients(detailFriday),text="Nasza Kuchnia — lista zakupów na weekend "+compactWeekend(detailFriday)+"\n\n"+items.map(function(x){return "☐ "+(x.count>1?x.count+" × ":"")+x.name;}).join("\n");if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){notify("Lista zakupów skopiowana.");}).catch(function(){prompt("Skopiuj listę:",text);});}else prompt("Skopiuj listę:",text);});
document.getElementById("nk-print-shopping").addEventListener("click",function(){window.print();});
document.getElementById("nk-pick-close").addEventListener("click",function(){document.getElementById("nk-pick-dialog").close();});
document.getElementById("nk-pick-search").addEventListener("input",renderPickerResults);
document.getElementById("nk-pick-results").addEventListener("click",function(e){var b=e.target.closest("[data-nk-recipe]");if(!b)return;var dlg=document.getElementById("nk-pick-dialog"),k=dlg.dataset.nkSlot.split("|"),date=parse(k[0]),meal=k[1];if(saveRecipe(b.dataset.nkRecipe,date,meal)){dlg.close();renderDetail();notify("Posiłek dodany do menu na "+format(date)+".");}});
renderDetail();}
window.addEventListener("storage",function(e){if(e.key===KEY||e.key===CHECK_KEY){if(calendarState)renderCalendarPage();if(detailFriday)renderDetail();}});
function initialize(){if(!recipes.length){console.warn("Nasza Kuchnia: brak katalogu przepisów.");return;}installButtons();initCalendarPage();initDetailPage();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
window.NKWeekend={openAdd:openAdd,friday:friday};
})();
