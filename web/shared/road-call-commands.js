export const ROAD_CALLS=Object.freeze({
  straight:{angle:0,radius:24,length:48,label:'STRAIGHT'},
  left:{angle:-90,radius:24,label:'LEFT'},right:{angle:90,radius:24,label:'RIGHT'},
  gentleLeft:{angle:-35,radius:36,label:'GENTLE LEFT'},gentleRight:{angle:35,radius:36,label:'GENTLE RIGHT'},
  sharpLeft:{angle:-120,radius:18,label:'SHARP LEFT'},sharpRight:{angle:120,radius:18,label:'SHARP RIGHT'},
  uLeft:{angle:-180,radius:20,label:'U-TURN LEFT'},uRight:{angle:180,radius:20,label:'U-TURN RIGHT'}
});
export const ROAD_PHRASES=Object.freeze(['straight','keep going','go straight','left','right','turn left','turn right','make a right','make a left','take a right','take a left','turn to the right','turn to the left',
  'gentle left','gentle right','slight left','slight right','bear left','bear right',
  'sharp left','sharp right','hard left','hard right','tight left','tight right',
  'u turn left','u turn right','you turn left','you turn right','u turn on the left','u turn on the right','hairpin left','hairpin right','turn around left','turn around right',
  // Keep negation and common cabin chatter in the decoder vocabulary. Without
  // these, a constrained recognizer can force "don't turn right" into "right".
  "don't turn left","don't turn right",'do not turn left','do not turn right','not left','not right','no left','no right','stop','cancel','the door is open','left door','right door','[unk]']);
/** Deliberately small vocabulary: never guess a side from ambiguous chat. */
export function parseRoadCall(value){
  if(typeof value!=='string'||value.length>160)return null;
  const text=value.toLowerCase().replace(/\byou turn\b/g,'u turn').replace(/u[- ]?turn/g,'u turn').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(!text||/\b(no|not|never|don t|dont|stop|cancel|maybe|either|or|then|after|before|unk)\b/.test(text))return null;
  if((text.match(/\b(left|right)\b/g)||[]).length>1||/\bturn turn\b/.test(text))return null;
  const left=/\bleft\b/.test(text),right=/\bright\b/.test(text);
  if(left===right)return !left&&/^(?:please |okay )?(?:go |keep going |keep )?straight(?: ahead)?$|^keep going$/.test(text)?'straight':null;
  // Reject unrelated sentences such as "I was right" or "the left door".
  if(text.split(' ').some(w=>!['please','okay','ok','go','turn','take','make','on','a','the','to','now','left','right','gentle','gently','slight','slightly','bear','sharp','sharply','hard','tight','u','around','hairpin'].includes(w)))return null;
  const side=left?'Left':'Right';
  if(/\bu turn\b|\bhairpin\b|\baround\b/.test(text))return 'u'+side;
  if(/\b(sharp|sharply|hard|tight)\b/.test(text))return 'sharp'+side;
  if(/\b(gentle|gently|slight|slightly|bear)\b/.test(text))return 'gentle'+side;
  return left?'left':'right';
}
