/* Public OAuth client identifier; never store access tokens. Imported tasks are saved locally. */
const GOOGLE_CLIENT_ID='456722203279-isn3ob17244i1l5c2lk47tri9pesp61a.apps.googleusercontent.com';
const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.readonly';
let calendarToken='',calendarClient=null,calendarExpiry=null,calendarRequest=0,calendarBusy=false;
const calElement=id=>document.getElementById(id);
let workCalendarId='';
try{workCalendarId=localStorage.getItem('moment-work-calendar-v1')||'';}catch{}
function isWorkCalendar(){const option=calElement('calendar-select').selectedOptions[0];return option?.dataset.work==='true';}
function workImportControls(){const checkbox=calElement('work-import');checkbox.disabled=calendarBusy||!calendarToken||!isWorkCalendar();checkbox.checked=Boolean(calendarToken&&isWorkCalendar()&&workCalendarId===calElement('calendar-select').value);}
function importWorkEvents(events,calendarId){
 if(!isWorkCalendar()||calendarId!==workCalendarId)return '';
 let added=0,updated=0;
 for(const event of events){
  if(!event.id)continue;
  const due=event.start.date||dateKey(new Date(event.start.dateTime));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due))continue;
  const title=event.summary||'제목 없는 일정';
  const existing=tasks.find(t=>t.calendarSource?.calendarId===calendarId&&t.calendarSource?.eventId===event.id);
  if(existing){if(existing.title!==title||existing.due!==due){existing.title=title;existing.due=due;updated++;}}
  else{tasks.push({id:crypto.randomUUID(),title,project:'업무용 캘린더',due,priority:'medium',status:'todo',calendarSource:{calendarId,eventId:event.id}});added++;}
 }
 if(added||updated)save();
 return ` · To Do ${added}개 추가 / ${updated}개 갱신`;
}

function calendarMessage(text){calElement('calendar-status').textContent=text;}
function calendarControls(){workImportControls();calElement('google-connect').disabled=calendarBusy;calElement('calendar-sync').disabled=!calendarToken||calendarBusy;calElement('calendar-select').disabled=!calendarToken||calendarBusy;calElement('google-disconnect').hidden=!calendarToken;calElement('google-connect').textContent=calendarToken?'계정 다시 연결':'Google 연결';}
function clearCalendar(message){calendarRequest++;calendarToken='';calendarBusy=false;clearTimeout(calendarExpiry);calElement('calendar-select').innerHTML='<option>Google 계정을 연결하세요</option>';calElement('calendar-events').replaceChildren();calendarControls();calendarMessage(message);}
function googleCalendarLoadError(){calendarMessage('Google 로그인 기능을 불러오지 못했습니다. 인터넷 연결이나 광고 차단 설정을 확인하고 새로고침하세요.');}
function initGoogleCalendar(){
 calendarClient=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:CALENDAR_SCOPE,error_callback:()=>{calendarBusy=false;calendarControls();calendarMessage('로그인 창이 닫혔거나 차단되었습니다. Google 연결을 다시 누르세요.');},callback:async response=>{
  calendarBusy=false;
  if(response.error||!response.access_token){calendarControls();calendarMessage('연결이 승인되지 않았습니다. 테스트 사용자 등록과 캘린더 조회 권한을 확인하세요.');return;}
  if(!google.accounts.oauth2.hasGrantedAllScopes(response,CALENDAR_SCOPE)){clearCalendar('캘린더 조회 권한이 필요합니다. 다시 연결해 권한을 허용하세요.');return;}
  calendarRequest++;calendarToken=response.access_token;clearTimeout(calendarExpiry);calendarExpiry=setTimeout(()=>clearCalendar('로그인이 만료되었습니다. Google 연결을 다시 눌러주세요.'),Math.max(1,Number(response.expires_in)||3600)*1000);calendarControls();await loadCalendars();
 }});
 calendarMessage('Google 연결을 눌러 일정이 저장된 계정으로 로그인하세요.');
}
async function calendarFetch(path,params,request){
 const url=new URL('https://www.googleapis.com/calendar/v3/'+path);Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
 const response=await fetch(url,{headers:{Authorization:'Bearer '+calendarToken}});
 if(request!==calendarRequest)throw new Error('stale');
 if(response.status===401){clearCalendar('로그인이 만료되었습니다. 다시 연결하세요.');throw new Error('stale');}
 if(response.status===403)throw new Error('캘린더 조회가 거부되었습니다. Google Calendar API 사용 설정과 계정 권한을 확인하세요.');
 if(!response.ok)throw new Error(response.status===429?'요청이 너무 많습니다. 잠시 후 다시 동기화하세요.':'일정을 가져오지 못했습니다. 잠시 후 다시 시도하세요.');
 return response.json();
}
async function loadCalendars(){
 const request=calendarRequest;calendarBusy=true;calendarControls();calElement('calendar-events').replaceChildren();calendarMessage('캘린더 목록을 불러오는 중…');
 try{let calendars=[],pageToken='';do{const data=await calendarFetch('users/me/calendarList',{maxResults:'250',...(pageToken?{pageToken}:{})},request);if(request!==calendarRequest)return;calendars.push(...(data.items||[]));pageToken=data.nextPageToken||'';}while(pageToken);
  const select=calElement('calendar-select');select.replaceChildren();calendars.forEach(c=>{const option=document.createElement('option');option.value=c.id;option.dataset.work=String((c.summaryOverride||c.summary||'').trim()==='업무용'||(c.summary||'').trim()==='업무용');option.textContent=(c.summaryOverride||c.summary||c.id)+(c.primary?' (기본)':'');select.append(option);});
  if(!calendars.length){calendarMessage('조회 가능한 캘린더가 없습니다.');return;}
  select.value=(calendars.find(c=>c.id===workCalendarId)||calendars.find(c=>(c.summary||'').trim()==='업무용'||(c.summaryOverride||'').trim()==='업무용')||calendars.find(c=>c.primary)||calendars[0]).id;await loadCalendarEvents();
 }catch(error){if(error.message!=='stale'&&request===calendarRequest)calendarMessage(error.message==='Failed to fetch'?'네트워크 연결을 확인하고 다시 연결하세요.':error.message);}
 finally{if(request===calendarRequest){calendarBusy=false;calendarControls();}}
}
async function loadCalendarEvents(){
 if(!calendarToken||!calElement('calendar-select').value)return;
 const selectedCalendarId=calElement('calendar-select').value;
 const request=++calendarRequest;calendarBusy=true;calendarControls();calElement('calendar-events').replaceChildren();calendarMessage('최신 일정을 불러오는 중…');
 const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+30);
 try{let events=[],pageToken='';do{const data=await calendarFetch('calendars/'+encodeURIComponent(selectedCalendarId)+'/events',{timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250',showDeleted:'false',...(pageToken?{pageToken}:{})},request);if(request!==calendarRequest)return;events.push(...(data.items||[]));pageToken=data.nextPageToken||'';}while(pageToken);
  events=events.filter(e=>e.status!=='cancelled'&&(e.start?.date||e.start?.dateTime));const container=calElement('calendar-events');
  for(const event of events){const row=document.createElement('article');row.className='calendar-event';const time=document.createElement('time');const allDay=Boolean(event.start.date);time.dateTime=event.start.date||event.start.dateTime;
   if(allDay){const first=new Date(event.start.date+'T00:00:00');time.textContent=first.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})+' · 종일';if(event.end?.date){const last=new Date(event.end.date+'T00:00:00');last.setDate(last.getDate()-1);if(last>first)time.textContent+=' ~ '+last.toLocaleDateString('ko-KR',{month:'long',day:'numeric'});}}
   else{const first=new Date(event.start.dateTime);time.textContent=first.toLocaleString('ko-KR',{month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'});if(event.end?.dateTime)time.textContent+=' ~ '+new Date(event.end.dateTime).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});}
   const body=document.createElement('div'),title=document.createElement('h3');title.textContent=event.summary||'제목 없는 일정';body.append(title);if(event.location){const location=document.createElement('p');location.textContent=event.location;body.append(location);}
   if(event.htmlLink){try{const url=new URL(event.htmlLink);if(url.protocol==='https:'&&(url.hostname==='calendar.google.com'||url.hostname==='www.google.com')){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Google 캘린더에서 보기 ↗';body.append(link);}}catch{}}
   row.append(time,body);container.append(row);
  }
  const importSummary=importWorkEvents(events,selectedCalendarId);
  calendarMessage(`${events.length}개의 일정${importSummary} · ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 동기화 완료 · 시간은 이 기기의 현지 시간 기준`);
  if(!events.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='앞으로 30일 동안 예정된 일정이 없습니다.';container.append(empty);}
 }catch(error){if(error.message!=='stale'&&request===calendarRequest)calendarMessage(error.message==='Failed to fetch'?'인터넷 연결을 확인하고 일정 동기화를 다시 누르세요.':error.message);}
 finally{if(request===calendarRequest){calendarBusy=false;calendarControls();}}
}
calElement('google-connect').onclick=()=>{if(!calendarClient){googleCalendarLoadError();return;}calendarBusy=true;calendarControls();calendarClient.requestAccessToken({prompt:'consent'});};
calElement('calendar-sync').onclick=loadCalendarEvents;
calElement('calendar-select').onchange=loadCalendarEvents;
calElement('google-disconnect').onclick=()=>{const token=calendarToken;clearCalendar('연결을 해제했습니다. 표시된 일정을 지웠습니다.');if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});};
calendarControls();

calElement('work-import').onchange=()=>{
 const checkbox=calElement('work-import');if(!isWorkCalendar()){checkbox.checked=false;return;}
 workCalendarId=checkbox.checked?calElement('calendar-select').value:'';
 try{localStorage.setItem('moment-work-calendar-v1',workCalendarId);}catch{calendarMessage('자동 추가 설정을 저장하지 못했습니다. 이 페이지를 열어 둔 동안만 적용됩니다.');}
 calElement('import-note').textContent=checkbox.checked?'동기화할 때 업무용 일정이 To Do로 저장됩니다. 제목·마감일은 캘린더 기준으로 갱신됩니다. 끄더라도 이미 추가된 업무는 유지됩니다.':'자동 추가를 껐습니다. 이미 추가된 To Do는 유지됩니다.';
 if(checkbox.checked)loadCalendarEvents();
};
